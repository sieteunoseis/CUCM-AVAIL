import { getDb } from "../db/database.js";
import type { SimulationResult, SimulationDetail, PhoneMovement, SubnetImpact, TrunkImpact, TrunkMovement, GatewayImpact, GatewayMovement, ServiceImpact } from "../types/index.js";
import { getAllSubnets } from "../db/queries.js";
import { ipToLong, parseSubnets, matchSubnetFast, type SubnetRow } from "../utils/subnet.js";
import { config } from "../config.js";
import { SERVICE_DISPLAY_NAMES } from "../services/serviceability.service.js";

export function simulateFailover(disabledServerIds: number[]): SimulationResult {
  const db = getDb();
  const disabledSet = new Set(disabledServerIds);
  const subnets = getAllSubnets() as SubnetRow[];
  const parsedSubnets = parseSubnets(subnets);

  // Get all CMGs with their members
  const cmGroups = db
    .prepare("SELECT * FROM cm_groups ORDER BY name")
    .all() as any[];

  // Pre-load all CMG members
  const cmgMembersMap = new Map<number, any[]>();
  const allMembers = db
    .prepare(
      `SELECT cgm.*, s.name as server_name, s.hostname
       FROM cm_group_members cgm
       JOIN servers s ON cgm.server_id = s.id
       ORDER BY cgm.cm_group_id, cgm.priority`
    )
    .all() as any[];
  for (const m of allMembers) {
    if (!cmgMembersMap.has(m.cm_group_id)) cmgMembersMap.set(m.cm_group_id, []);
    cmgMembersMap.get(m.cm_group_id)!.push(m);
  }

  // Bulk-load all phone registrations
  const regMap = new Map<number, { server_id: number | null; server_name: string | null; ip_address: string }>();
  const regs = db
    .prepare(
      `SELECT lr.phone_id, lr.registered_server_id as server_id, s.name as server_name, lr.ip_address
       FROM latest_registrations lr
       LEFT JOIN servers s ON lr.registered_server_id = s.id`
    )
    .all() as any[];
  for (const r of regs) {
    regMap.set(r.phone_id, { server_id: r.server_id, server_name: r.server_name, ip_address: r.ip_address || "" });
  }

  // Bulk-load all phones with CMG info
  const allPhones = db
    .prepare(
      `SELECT p.id, p.name as phone_name, dp.name as device_pool_name, dp.cm_group_id
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id`
    )
    .all() as any[];

  // Group phones by CMG
  const phonesByCmg = new Map<number, any[]>();
  for (const phone of allPhones) {
    if (!phonesByCmg.has(phone.cm_group_id)) phonesByCmg.set(phone.cm_group_id, []);
    phonesByCmg.get(phone.cm_group_id)!.push(phone);
  }

  const details: SimulationDetail[] = [];
  let totalNoImpact = 0;
  let totalReRegister = 0;
  let totalUnregistered = 0;
  let totalPhones = 0;

  for (const cmg of cmGroups) {
    const members = cmgMembersMap.get(cmg.id) || [];
    const availableMembers = members.filter((m: any) => !disabledSet.has(m.server_id));
    const newPrimaryServerId = availableMembers.length > 0 ? availableMembers[0].server_id : null;
    const newPrimaryServerName = availableMembers.length > 0 ? availableMembers[0].server_name : null;

    const phones = phonesByCmg.get(cmg.id) || [];
    const movements: PhoneMovement[] = [];
    let groupNoImpact = 0;
    let groupReRegister = 0;
    let groupUnregistered = 0;

    for (const phone of phones) {
      const reg = regMap.get(phone.id);
      const assumedServerId = members.length > 0 ? members[0].server_id : null;
      const assumedServerName = members.length > 0 ? members[0].server_name : null;

      const currentServerId = reg?.server_id ?? assumedServerId;
      const currentServerName = reg?.server_name ?? assumedServerName;
      const isAssumed = !reg;

      let impact: "no_change" | "re_register" | "unregistered";

      if (newPrimaryServerId === null) {
        impact = "unregistered";
        groupUnregistered++;
      } else if (currentServerId === null || !disabledSet.has(currentServerId)) {
        impact = "no_change";
        groupNoImpact++;
      } else {
        impact = "re_register";
        groupReRegister++;
      }

      const phoneIp = reg?.ip_address || "";
      const ipNum = phoneIp ? ipToLong(phoneIp) : 0;
      const matched = phoneIp ? matchSubnetFast(ipNum, parsedSubnets) : null;

      movements.push({
        phoneName: phone.phone_name,
        currentServer: currentServerName
          ? (isAssumed ? `${currentServerName} (assumed)` : currentServerName)
          : null,
        newServer:
          impact === "unregistered"
            ? null
            : impact === "re_register"
              ? newPrimaryServerName
              : currentServerName,
        impact,
        ipAddress: phoneIp || undefined,
        subnetName: matched?.name || undefined,
      });
    }

    // Compute subnet impacts for this CMG
    const subnetMap = new Map<string, SubnetImpact>();
    for (const m of movements) {
      const key = m.subnetName || "Unknown";
      if (!subnetMap.has(key)) {
        const matchedSub = subnets.find((s) => s.name === key);
        subnetMap.set(key, {
          subnetName: key,
          cidr: matchedSub?.cidr || "",
          totalPhones: 0,
          noImpact: 0,
          willReRegister: 0,
          unregistered: 0,
        });
      }
      const si = subnetMap.get(key)!;
      si.totalPhones++;
      if (m.impact === "no_change") si.noImpact++;
      else if (m.impact === "re_register") si.willReRegister++;
      else si.unregistered++;
    }

    if (phones.length > 0) {
      details.push({
        cmGroupName: cmg.name,
        cmGroupId: cmg.id,
        totalPhones: phones.length,
        noImpact: groupNoImpact,
        willReRegister: groupReRegister,
        unregistered: groupUnregistered,
        movements,
        subnetImpacts: Array.from(subnetMap.values()).filter((s) => s.subnetName !== "Unknown"),
      });
    }

    totalNoImpact += groupNoImpact;
    totalReRegister += groupReRegister;
    totalUnregistered += groupUnregistered;
    totalPhones += phones.length;
  }

  // Simulate trunk impact
  const trunkImpact = simulateTrunkFailover(db, disabledSet, cmgMembersMap);

  // Simulate gateway impact (if enabled)
  const gatewayImpact = config.features.enableGateways
    ? simulateGatewayFailover(db, disabledSet, cmgMembersMap)
    : undefined;

  // Simulate service impact
  const serviceImpacts = simulateServiceImpact(db, disabledSet);

  return {
    totalPhones,
    noImpact: totalNoImpact,
    willReRegister: totalReRegister,
    unregistered: totalUnregistered,
    details,
    trunkImpact,
    gatewayImpact,
    serviceImpacts: serviceImpacts.length > 0 ? serviceImpacts : undefined,
  };
}

function simulateTrunkFailover(
  db: any,
  disabledSet: Set<number>,
  cmgMembersMap: Map<number, any[]>
): TrunkImpact {
  const trunks = db
    .prepare(
      `SELECT t.id, t.name, t.description, dp.name as device_pool_name,
              dp.cm_group_id, cg.name as cm_group_name
       FROM trunks t
       JOIN device_pools dp ON t.device_pool_id = dp.id
       JOIN cm_groups cg ON dp.cm_group_id = cg.id`
    )
    .all() as any[];

  if (trunks.length === 0) {
    return { totalTrunks: 0, noImpact: 0, willReRegister: 0, noService: 0, movements: [] };
  }

  // Bulk-load trunk registrations
  const trunkRegMap = new Map<number, { server_id: number | null; server_name: string | null }>();
  const trunkRegs = db
    .prepare(
      `SELECT ltr.trunk_id, ltr.registered_server_id as server_id, s.name as server_name
       FROM latest_trunk_registrations ltr
       LEFT JOIN servers s ON ltr.registered_server_id = s.id`
    )
    .all() as any[];
  for (const r of trunkRegs) {
    trunkRegMap.set(r.trunk_id, { server_id: r.server_id, server_name: r.server_name });
  }

  const movements: TrunkMovement[] = [];
  let noImpact = 0;
  let willReRegister = 0;
  let noService = 0;

  for (const trunk of trunks) {
    const members = cmgMembersMap.get(trunk.cm_group_id) || [];
    const availableMembers = members.filter((m: any) => !disabledSet.has(m.server_id));
    const newPrimaryName = availableMembers.length > 0 ? availableMembers[0].server_name : null;

    const reg = trunkRegMap.get(trunk.id);
    const currentServerId = reg?.server_id ?? (members.length > 0 ? members[0].server_id : null);
    const currentServerName = reg?.server_name ?? (members.length > 0 ? members[0].server_name : null);

    let impact: "no_change" | "re_register" | "no_service";

    if (availableMembers.length === 0) {
      impact = "no_service";
      noService++;
    } else if (currentServerId === null || !disabledSet.has(currentServerId)) {
      impact = "no_change";
      noImpact++;
    } else {
      impact = "re_register";
      willReRegister++;
    }

    movements.push({
      trunkName: trunk.name,
      description: trunk.description || "",
      currentServer: currentServerName,
      newServer: impact === "no_service" ? null : impact === "re_register" ? newPrimaryName : currentServerName,
      impact,
      devicePoolName: trunk.device_pool_name,
      cmGroupName: trunk.cm_group_name,
    });
  }

  return { totalTrunks: trunks.length, noImpact, willReRegister, noService, movements };
}

function simulateGatewayFailover(
  db: any,
  disabledSet: Set<number>,
  cmgMembersMap: Map<number, any[]>
): GatewayImpact {
  // Get all gateways with CMG info
  const gateways = db
    .prepare(
      `SELECT g.id, g.name, g.description, g.domain_name,
              dp.name as device_pool_name, dp.cm_group_id,
              cg.name as cm_group_name
       FROM gateways g
       JOIN device_pools dp ON g.device_pool_id = dp.id
       JOIN cm_groups cg ON dp.cm_group_id = cg.id`
    )
    .all() as any[];

  if (gateways.length === 0) {
    return { totalGateways: 0, noImpact: 0, degraded: 0, noService: 0, movements: [] };
  }

  // Bulk-load gateway registrations (multiple per gateway)
  const gwRegMap = new Map<number, Set<number>>();
  const gwRegs = db
    .prepare(
      `SELECT lgr.gateway_id, lgr.registered_server_id
       FROM latest_gateway_registrations lgr
       WHERE lgr.status = 'Registered'`
    )
    .all() as any[];
  for (const r of gwRegs) {
    if (!gwRegMap.has(r.gateway_id)) gwRegMap.set(r.gateway_id, new Set());
    gwRegMap.get(r.gateway_id)!.add(r.registered_server_id);
  }

  const movements: GatewayMovement[] = [];
  let noImpact = 0;
  let degraded = 0;
  let noService = 0;

  for (const gw of gateways) {
    const members = cmgMembersMap.get(gw.cm_group_id) || [];
    const currentRegisteredServers = gwRegMap.get(gw.id) || new Set<number>();

    // Current count = how many CMG servers the gateway is registered to
    const currentCount = currentRegisteredServers.size;

    // After disabling servers, how many remain?
    let newCount = 0;
    for (const serverId of currentRegisteredServers) {
      if (!disabledSet.has(serverId)) newCount++;
    }

    // Also check: are there any CMG members still available at all?
    const availableMembers = members.filter((m: any) => !disabledSet.has(m.server_id));

    let impact: "no_change" | "degraded" | "no_service";

    if (availableMembers.length === 0) {
      impact = "no_service";
      newCount = 0;
      noService++;
    } else if (newCount === currentCount) {
      impact = "no_change";
      noImpact++;
    } else {
      impact = "degraded";
      degraded++;
    }

    movements.push({
      gatewayName: gw.name,
      description: gw.description || "",
      domainName: gw.domain_name || "",
      devicePoolName: gw.device_pool_name,
      cmGroupName: gw.cm_group_name,
      currentCount,
      newCount,
      impact,
    });
  }

  return { totalGateways: gateways.length, noImpact, degraded, noService, movements };
}

function simulateServiceImpact(
  db: any,
  disabledSet: Set<number>
): ServiceImpact[] {
  // Get all service statuses grouped by service name
  const statuses = db
    .prepare(
      `SELECT ss.service_name, ss.server_id, ss.status
       FROM service_statuses ss`
    )
    .all() as { service_name: string; server_id: number; status: string }[];

  if (statuses.length === 0) return [];

  // Group by service
  const serviceMap = new Map<string, { serverId: number; isActive: boolean }[]>();
  for (const s of statuses) {
    if (!serviceMap.has(s.service_name)) serviceMap.set(s.service_name, []);
    serviceMap.get(s.service_name)!.push({
      serverId: s.server_id,
      isActive: s.status === "Started" || s.status === "started",
    });
  }

  const impacts: ServiceImpact[] = [];

  for (const [serviceName, servers] of serviceMap) {
    const totalServers = servers.length;
    const currentActive = servers.filter((s) => s.isActive).length;
    const newActive = servers.filter((s) => s.isActive && !disabledSet.has(s.serverId)).length;

    let impact: "no_change" | "degraded" | "outage";
    if (newActive === currentActive) {
      impact = "no_change";
    } else if (newActive === 0) {
      impact = "outage";
    } else {
      impact = "degraded";
    }

    impacts.push({
      serviceName,
      displayName: SERVICE_DISPLAY_NAMES[serviceName] || serviceName,
      currentActive,
      newActive,
      totalServers,
      impact,
    });
  }

  return impacts;
}
