import { getDb } from "../db/database.js";
import { getAllSubnets } from "../db/queries.js";
import { ipToLong, parseSubnets, matchSubnetFast, type SubnetRow } from "../utils/subnet.js";

export interface GeoZone {
  name: string;
  subnetIds: number[];
  phoneCount: number;
  phones: { id: number; name: string; ip: string; currentDp: string; currentCmg: string }[];
}

export interface CmgAssignment {
  cmgName: string;
  cmgId: number;
  members: { serverId: number; serverName: string; priority: number }[];
  geoZones: string[];
  totalPhones: number;
}

export interface PlannerResult {
  currentState: {
    serverLoads: { serverName: string; phoneCount: number; cmgs: string[]; agLabels: string[] }[];
    imbalanceRatio: number;
  };
  proposedState: {
    serverLoads: { serverName: string; phoneCount: number; cmgs: string[]; agLabels: string[] }[];
    imbalanceRatio: number;
  };
  geoZones: {
    name: string;
    subnetCidrs: string[];
    phoneCount: number;
    currentCmg: string;
    assignedCmg: string;
    primaryServer: string;
    agLabel: string;
  }[];
  unmappedPhones: number;
  totalPhones: number;
  phoneStats: {
    totalPhones: number;
    registeredPhones: number;
    unregisteredPhones: number;
    neverSeenPhones: number;
    stalePhones: number;
  };
  rebalanceCmgIds: number[];
  lockedCmgIds: number[];
  allCmgs: { id: number; name: string; phoneCount: number; ccmActive: boolean }[];
}

export function runPlanner(selectedCmgIds?: number[]): PlannerResult {
  const db = getDb();
  const subnets = getAllSubnets() as SubnetRow[];
  const parsedSubnets = parseSubnets(subnets);

  // Pre-load server CCM active status
  const serverCcmActive = new Map<number, boolean>();
  const allServers = db.prepare("SELECT id, ccm_service_active FROM servers").all() as any[];
  for (const s of allServers) {
    serverCcmActive.set(s.id, s.ccm_service_active === 1);
  }

  // Get all phones with their IPs and current assignments
  const phones = db
    .prepare(
      `SELECT p.id, p.name, dp.name as dp_name, cmg.name as cmg_name,
              lr.ip_address
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN latest_registrations lr ON lr.phone_id = p.id
       ORDER BY p.name`
    )
    .all() as any[];

  // Get all CMGs with members
  const cmGroups = db
    .prepare("SELECT * FROM cm_groups ORDER BY name")
    .all() as any[];

  const cmgMembers = new Map<number, any[]>();
  for (const cmg of cmGroups) {
    const members = db
      .prepare(
        `SELECT cgm.*, s.name as server_name
         FROM cm_group_members cgm
         JOIN servers s ON cgm.server_id = s.id
         WHERE cgm.cm_group_id = ?
         ORDER BY cgm.priority`
      )
      .all(cmg.id) as any[];
    cmgMembers.set(cmg.id, members);
  }

  // Compute Availability Groups (server → AG labels)
  const cmgServerSets = cmGroups.map((cmg: any) => {
    const members = cmgMembers.get(cmg.id) || [];
    const servers = members.map((m: any) => m.server_name.split(".")[0]).sort();
    return { cmg, servers, serverKey: servers.join(",") };
  });

  const agChannelMap = new Map<string, { servers: string[]; cmgs: any[] }>();
  for (const entry of cmgServerSets) {
    if (!agChannelMap.has(entry.serverKey)) {
      agChannelMap.set(entry.serverKey, { servers: entry.servers, cmgs: [] });
    }
    agChannelMap.get(entry.serverKey)!.cmgs.push(entry.cmg);
  }

  // Count phones per CMG
  const cmgPhoneCountsForAg = new Map<number, number>();
  const pcRows = db
    .prepare(
      `SELECT dp.cm_group_id, COUNT(p.id) as count
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       GROUP BY dp.cm_group_id`
    )
    .all() as { cm_group_id: number; count: number }[];
  for (const r of pcRows) {
    cmgPhoneCountsForAg.set(r.cm_group_id, r.count);
  }

  const agChannels = Array.from(agChannelMap.values())
    .map((ch) => {
      const phoneCount = ch.cmgs.reduce(
        (sum: number, cmg: any) => sum + (cmgPhoneCountsForAg.get(cmg.id) || 0),
        0
      );
      return { ...ch, phoneCount };
    })
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const agLabelsMap = new Map<string, string>(); // server short name → AG label
  const cmgAgLabelMap = new Map<number, string>(); // cmg id → AG label
  agChannels.forEach((ch, i) => {
    const label = `AG-${i + 1}`;
    for (const srv of ch.servers) {
      agLabelsMap.set(srv, label);
    }
    for (const cmg of ch.cmgs) {
      cmgAgLabelMap.set(cmg.id, label);
    }
  });

  // Build server → AG labels (a server can be in multiple AGs)
  const serverAgLabels = new Map<string, string[]>();
  agChannels.forEach((ch, i) => {
    const label = `AG-${i + 1}`;
    for (const srv of ch.servers) {
      if (!serverAgLabels.has(srv)) serverAgLabels.set(srv, []);
      serverAgLabels.get(srv)!.push(label);
    }
  });

  // Phone stats
  const totalPhonesCount = phones.length;
  const registeredPhones = (db.prepare(
    `SELECT COUNT(*) as count FROM latest_registrations
     WHERE status IN ('Registered', 'registered')`
  ).get() as any)?.count || 0;

  const neverSeenPhones = (db.prepare(
    `SELECT COUNT(*) as count FROM phones p
     WHERE NOT EXISTS (SELECT 1 FROM latest_registrations lr WHERE lr.phone_id = p.id)`
  ).get() as any)?.count || 0;

  const stalePhones = (db.prepare(
    `SELECT COUNT(*) as count FROM latest_registrations
     WHERE polled_at < datetime('now', '-7 days')`
  ).get() as any)?.count || 0;

  const phoneStats = {
    totalPhones: totalPhonesCount,
    registeredPhones,
    unregisteredPhones: totalPhonesCount - registeredPhones - neverSeenPhones,
    neverSeenPhones,
    stalePhones,
  };

  // All CMGs for selection UI
  const allCmgs = cmGroups.map((cmg: any) => {
    const members = cmgMembers.get(cmg.id) || [];
    const ccmActive = members.some((m: any) => serverCcmActive.get(m.server_id) === true);
    return {
      id: cmg.id,
      name: cmg.name,
      phoneCount: cmgPhoneCountsForAg.get(cmg.id) || 0,
      ccmActive,
    };
  });

  // --- Current State ---
  // Count phones per priority-1 server (based on current CMG assignment)
  const currentServerLoads = new Map<string, { count: number; cmgs: Set<string> }>();
  for (const phone of phones) {
    const cmgName = phone.cmg_name || "Unknown";
    const cmg = cmGroups.find((c: any) => c.name === cmgName);
    if (cmg) {
      const members = cmgMembers.get(cmg.id) || [];
      const primary = members.find((m: any) => m.priority === 1);
      if (primary) {
        const name = primary.server_name;
        if (!currentServerLoads.has(name)) {
          currentServerLoads.set(name, { count: 0, cmgs: new Set() });
        }
        const entry = currentServerLoads.get(name)!;
        entry.count++;
        entry.cmgs.add(cmgName);
      }
    }
  }

  const currentLoads = Array.from(currentServerLoads.entries())
    .map(([name, data]) => ({
      serverName: name,
      phoneCount: data.count,
      cmgs: Array.from(data.cmgs),
      agLabels: serverAgLabels.get(name.split(".")[0]) || [],
    }))
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const currentMax = Math.max(...currentLoads.map((l) => l.phoneCount), 1);
  const currentMin = Math.max(Math.min(...currentLoads.map((l) => l.phoneCount)), 1);
  const currentImbalance = currentMax / currentMin;

  // --- Group phones by subnet into geo zones ---
  const subnetPhones = new Map<string, {
    subnetName: string;
    cidr: string;
    phones: typeof phones;
  }>();
  let unmapped = 0;
  const unmappedPhones: typeof phones = [];

  for (const phone of phones) {
    const ip = phone.ip_address || "";
    if (!ip) { unmapped++; unmappedPhones.push(phone); continue; }
    const ipNum = ipToLong(ip);
    const matched = matchSubnetFast(ipNum, parsedSubnets);
    if (matched) {
      const key = matched.name;
      if (!subnetPhones.has(key)) {
        subnetPhones.set(key, { subnetName: matched.name, cidr: matched.cidr, phones: [] });
      }
      subnetPhones.get(key)!.phones.push(phone);
    } else {
      unmapped++;
      unmappedPhones.push(phone);
    }
  }

  // Build geo zones from subnet groupings
  const geoZones = Array.from(subnetPhones.entries())
    .map(([name, data]) => ({
      name,
      cidr: data.cidr,
      phoneCount: data.phones.length,
    }))
    .sort((a, b) => b.phoneCount - a.phoneCount);

  // --- Propose balanced CMG assignments ---
  // Get CCM-active CMGs, filtered by selectedCmgIds if provided
  const ccmCmgs = cmGroups.filter((cmg: any) => {
    if (selectedCmgIds && selectedCmgIds.length > 0) {
      return selectedCmgIds.includes(cmg.id);
    }
    const members = cmgMembers.get(cmg.id) || [];
    return members.some((m: any) => serverCcmActive.get(m.server_id) === true);
  });

  // Greedy bin-packing: assign geo zones to CMGs to balance phone counts
  // Start with unmapped phones distributed among current assignments
  const cmgPhoneCounts = new Map<number, number>();
  const cmgGeoZones = new Map<number, string[]>();

  for (const cmg of ccmCmgs) {
    cmgPhoneCounts.set(cmg.id, 0);
    cmgGeoZones.set(cmg.id, []);
  }

  // Distribute unmapped phones proportionally to current assignments
  // (they keep their current CMG since we can't determine location)
  for (const phone of unmappedPhones) {
    const cmg = ccmCmgs.find((c: any) => c.name === phone.cmg_name);
    if (cmg) {
      cmgPhoneCounts.set(cmg.id, (cmgPhoneCounts.get(cmg.id) || 0) + 1);
    }
  }

  // Sort geo zones largest first, assign each to the CMG with fewest phones
  const sortedZones = [...geoZones].sort((a, b) => b.phoneCount - a.phoneCount);

  for (const zone of sortedZones) {
    // Find CMG with fewest phones
    let minCmgId = ccmCmgs[0]?.id;
    let minCount = Infinity;

    for (const cmg of ccmCmgs) {
      const count = cmgPhoneCounts.get(cmg.id) || 0;
      if (count < minCount) {
        minCount = count;
        minCmgId = cmg.id;
      }
    }

    if (minCmgId !== undefined) {
      cmgPhoneCounts.set(minCmgId, (cmgPhoneCounts.get(minCmgId) || 0) + zone.phoneCount);
      cmgGeoZones.get(minCmgId)?.push(zone.name);
    }
  }

  // --- Proposed State ---
  const proposedServerLoads = new Map<string, { count: number; cmgs: Set<string> }>();

  for (const cmg of ccmCmgs) {
    const members = cmgMembers.get(cmg.id) || [];
    const primary = members.find((m: any) => m.priority === 1);
    if (primary) {
      const name = primary.server_name;
      if (!proposedServerLoads.has(name)) {
        proposedServerLoads.set(name, { count: 0, cmgs: new Set() });
      }
      const entry = proposedServerLoads.get(name)!;
      entry.count += cmgPhoneCounts.get(cmg.id) || 0;
      entry.cmgs.add(cmg.name);
    }
  }

  const proposedLoads = Array.from(proposedServerLoads.entries())
    .map(([name, data]) => ({
      serverName: name,
      phoneCount: data.count,
      cmgs: Array.from(data.cmgs),
      agLabels: serverAgLabels.get(name.split(".")[0]) || [],
    }))
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const proposedMax = Math.max(...proposedLoads.map((l) => l.phoneCount), 1);
  const proposedMin = Math.max(Math.min(...proposedLoads.map((l) => l.phoneCount)), 1);
  const proposedImbalance = proposedMax / proposedMin;

  // Build a map of subnet name → current CMG (majority vote from phones in that subnet)
  const subnetCurrentCmg = new Map<string, string>();
  for (const [name, data] of subnetPhones.entries()) {
    const cmgVotes = new Map<string, number>();
    for (const phone of data.phones) {
      const cmg = phone.cmg_name || "Unknown";
      cmgVotes.set(cmg, (cmgVotes.get(cmg) || 0) + 1);
    }
    let bestCmg = "Unknown";
    let bestCount = 0;
    for (const [cmg, count] of cmgVotes) {
      if (count > bestCount) {
        bestCmg = cmg;
        bestCount = count;
      }
    }
    subnetCurrentCmg.set(name, bestCmg);
  }

  // Build output geo zones with CMG assignments
  const geoZoneOutput = sortedZones.map((zone) => {
    // Find which CMG this zone was assigned to
    let assignedCmgName = "Unassigned";
    let primaryServer = "—";
    let agLabel = "";

    for (const cmg of ccmCmgs) {
      const zones = cmgGeoZones.get(cmg.id) || [];
      if (zones.includes(zone.name)) {
        assignedCmgName = cmg.name;
        agLabel = cmgAgLabelMap.get(cmg.id) || "";
        const members = cmgMembers.get(cmg.id) || [];
        const primary = members.find((m: any) => m.priority === 1);
        if (primary) primaryServer = primary.server_name;
        break;
      }
    }

    return {
      name: zone.name,
      subnetCidrs: [zone.cidr],
      phoneCount: zone.phoneCount,
      currentCmg: subnetCurrentCmg.get(zone.name) || "Unknown",
      assignedCmg: assignedCmgName,
      primaryServer,
      agLabel,
    };
  });

  // Default rebalance CMG IDs (all CCM-active)
  const defaultCcmCmgIds = allCmgs.filter((c) => c.ccmActive).map((c) => c.id);

  return {
    currentState: {
      serverLoads: currentLoads,
      imbalanceRatio: Math.round(currentImbalance * 10) / 10,
    },
    proposedState: {
      serverLoads: proposedLoads,
      imbalanceRatio: Math.round(proposedImbalance * 10) / 10,
    },
    geoZones: geoZoneOutput,
    unmappedPhones: unmapped,
    totalPhones: phones.length,
    phoneStats,
    rebalanceCmgIds: selectedCmgIds || defaultCcmCmgIds,
    lockedCmgIds: [],
    allCmgs,
  };
}
