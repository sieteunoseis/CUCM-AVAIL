import { getDb } from "../db/database.js";
import { getAllSubnets } from "../db/queries.js";
import { matchSubnet, type SubnetRow } from "../utils/subnet.js";

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
    serverLoads: { serverName: string; phoneCount: number; cmgs: string[] }[];
    imbalanceRatio: number; // max/min ratio
  };
  proposedState: {
    serverLoads: { serverName: string; phoneCount: number; cmgs: string[] }[];
    imbalanceRatio: number;
  };
  geoZones: {
    name: string;
    subnetCidrs: string[];
    phoneCount: number;
    assignedCmg: string;
    primaryServer: string;
  }[];
  unmappedPhones: number;
  totalPhones: number;
}

export function runPlanner(): PlannerResult {
  const db = getDb();
  const subnets = getAllSubnets() as SubnetRow[];

  // Get all phones with their IPs and current assignments
  const phones = db
    .prepare(
      `SELECT p.id, p.name, dp.name as dp_name, cmg.name as cmg_name,
              rs.ip_address
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN registration_snapshots rs ON rs.phone_id = p.id
         AND rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = p.id)
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
    const matched = matchSubnet(ip, subnets);
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
  // Get CCM-active CMGs (ones with at least one CCM-active server as priority 1)
  const ccmCmgs = cmGroups.filter((cmg: any) => {
    const members = cmgMembers.get(cmg.id) || [];
    return members.some((m: any) => {
      const server = db
        .prepare("SELECT ccm_service_active FROM servers WHERE id = ?")
        .get(m.server_id) as any;
      return server?.ccm_service_active === 1;
    });
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
    }))
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const proposedMax = Math.max(...proposedLoads.map((l) => l.phoneCount), 1);
  const proposedMin = Math.max(Math.min(...proposedLoads.map((l) => l.phoneCount)), 1);
  const proposedImbalance = proposedMax / proposedMin;

  // Build output geo zones with CMG assignments
  const geoZoneOutput = sortedZones.map((zone) => {
    // Find which CMG this zone was assigned to
    let assignedCmgName = "Unassigned";
    let primaryServer = "—";

    for (const cmg of ccmCmgs) {
      const zones = cmgGeoZones.get(cmg.id) || [];
      if (zones.includes(zone.name)) {
        assignedCmgName = cmg.name;
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
      assignedCmg: assignedCmgName,
      primaryServer,
    };
  });

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
  };
}
