import { getDb } from "../db/database.js";
import type { SimulationResult, SimulationDetail, PhoneMovement, SubnetImpact, TrunkImpact, TrunkMovement } from "../types/index.js";
import { getAllSubnets } from "../db/queries.js";
import { matchSubnet, type SubnetRow } from "../utils/subnet.js";

export function simulateFailover(disabledServerIds: number[]): SimulationResult {
  const db = getDb();
  const disabledSet = new Set(disabledServerIds);
  const subnets = getAllSubnets() as SubnetRow[];

  // Get all CMGs with their members
  const cmGroups = db
    .prepare("SELECT * FROM cm_groups ORDER BY name")
    .all() as any[];

  const details: SimulationDetail[] = [];
  let totalNoImpact = 0;
  let totalReRegister = 0;
  let totalUnregistered = 0;
  let totalPhones = 0;

  for (const cmg of cmGroups) {
    // Get CMG members ordered by priority
    const members = db
      .prepare(
        `SELECT cgm.*, s.name as server_name, s.hostname
         FROM cm_group_members cgm
         JOIN servers s ON cgm.server_id = s.id
         WHERE cgm.cm_group_id = ?
         ORDER BY cgm.priority`
      )
      .all(cmg.id) as any[];

    // Determine the available servers after removing disabled ones
    const availableMembers = members.filter(
      (m: any) => !disabledSet.has(m.server_id)
    );
    const newPrimaryServerId =
      availableMembers.length > 0 ? availableMembers[0].server_id : null;
    const newPrimaryServerName =
      availableMembers.length > 0 ? availableMembers[0].server_name : null;

    // Get all phones in this CMG via device pools
    const phones = db
      .prepare(
        `SELECT p.id, p.name as phone_name, dp.name as device_pool_name
         FROM phones p
         JOIN device_pools dp ON p.device_pool_id = dp.id
         WHERE dp.cm_group_id = ?`
      )
      .all(cmg.id) as any[];

    const movements: PhoneMovement[] = [];
    let groupNoImpact = 0;
    let groupReRegister = 0;
    let groupUnregistered = 0;

    for (const phone of phones) {
      // Get latest registration for this phone
      const latestReg = db
        .prepare(
          `SELECT rs.*, s.name as server_name
           FROM registration_snapshots rs
           LEFT JOIN servers s ON rs.registered_server_id = s.id
           WHERE rs.phone_id = ?
           ORDER BY rs.polled_at DESC
           LIMIT 1`
        )
        .get(phone.id) as any;

      // If no RISPort data, assume phone is on priority 1 server of its CMG
      const assumedServerId = members.length > 0 ? members[0].server_id : null;
      const assumedServerName = members.length > 0 ? members[0].server_name : null;

      const currentServerId = latestReg?.registered_server_id ?? assumedServerId;
      const currentServerName = latestReg?.server_name ?? assumedServerName;
      const isAssumed = !latestReg;

      let impact: "no_change" | "re_register" | "unregistered";

      if (newPrimaryServerId === null) {
        // All CMG servers are disabled
        impact = "unregistered";
        groupUnregistered++;
      } else if (currentServerId === null || !disabledSet.has(currentServerId)) {
        // Phone's current server is still up
        impact = "no_change";
        groupNoImpact++;
      } else {
        // Phone's current server is disabled — it will re-register
        impact = "re_register";
        groupReRegister++;
      }

      const phoneIp = latestReg?.ip_address || "";
      const matched = matchSubnet(phoneIp, subnets);

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
  const trunkImpact = simulateTrunkFailover(db, disabledSet, cmGroups);

  return {
    totalPhones,
    noImpact: totalNoImpact,
    willReRegister: totalReRegister,
    unregistered: totalUnregistered,
    details,
    trunkImpact,
  };
}

function simulateTrunkFailover(
  db: any,
  disabledSet: Set<number>,
  cmGroups: any[]
): TrunkImpact {
  // Get all trunks with their device pool and CMG info
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

  const movements: TrunkMovement[] = [];
  let noImpact = 0;
  let willReRegister = 0;
  let noService = 0;

  for (const trunk of trunks) {
    // Get CMG members for this trunk's CMG
    const members = db
      .prepare(
        `SELECT cgm.*, s.name as server_name
         FROM cm_group_members cgm
         JOIN servers s ON cgm.server_id = s.id
         WHERE cgm.cm_group_id = ?
         ORDER BY cgm.priority`
      )
      .all(trunk.cm_group_id) as any[];

    const availableMembers = members.filter((m: any) => !disabledSet.has(m.server_id));
    const newPrimaryName = availableMembers.length > 0 ? availableMembers[0].server_name : null;

    // Get latest trunk registration
    const latestReg = db
      .prepare(
        `SELECT ts.*, s.name as server_name
         FROM trunk_snapshots ts
         LEFT JOIN servers s ON ts.registered_server_id = s.id
         WHERE ts.trunk_id = ?
         ORDER BY ts.polled_at DESC
         LIMIT 1`
      )
      .get(trunk.id) as any;

    const currentServerId = latestReg?.registered_server_id ?? (members.length > 0 ? members[0].server_id : null);
    const currentServerName = latestReg?.server_name ?? (members.length > 0 ? members[0].server_name : null);

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
