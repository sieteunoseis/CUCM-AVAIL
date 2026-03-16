import { getDb } from "./database.js";
import type {
  CucmServer,
  DevicePool,
  Phone,
  RegistrationSnapshot,
} from "../types/index.js";

// --- Servers ---

export function upsertServer(server: CucmServer) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO servers (name, hostname, node_type, ccm_service_active, last_checked_at)
       VALUES (@name, @hostname, @nodeType, @ccmServiceActive, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         hostname = @hostname,
         node_type = @nodeType,
         ccm_service_active = @ccmServiceActive,
         last_checked_at = datetime('now')`
    )
    .run({
      name: server.name,
      hostname: server.hostname,
      nodeType: server.nodeType,
      ccmServiceActive: server.ccmServiceActive ? 1 : 0,
    });
}

export function getAllServers() {
  return getDb().prepare("SELECT * FROM servers ORDER BY name").all();
}

export function getServerByName(name: string) {
  return getDb().prepare("SELECT * FROM servers WHERE name = ?").get(name);
}

export function updateServerServiceStatus(
  serverId: number,
  active: boolean
) {
  return getDb()
    .prepare(
      `UPDATE servers SET ccm_service_active = ?, last_checked_at = datetime('now') WHERE id = ?`
    )
    .run(active ? 1 : 0, serverId);
}

// --- CM Groups ---

export function upsertCmGroup(name: string): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO cm_groups (name) VALUES (?)
     ON CONFLICT(name) DO NOTHING`
  ).run(name);
  const row = db
    .prepare("SELECT id FROM cm_groups WHERE name = ?")
    .get(name) as { id: number };
  return row.id;
}

export function setCmGroupMembers(
  cmGroupId: number,
  members: { serverId: number; priority: number }[]
) {
  const db = getDb();
  db.prepare("DELETE FROM cm_group_members WHERE cm_group_id = ?").run(
    cmGroupId
  );
  const insert = db.prepare(
    `INSERT INTO cm_group_members (cm_group_id, server_id, priority) VALUES (?, ?, ?)`
  );
  for (const m of members) {
    insert.run(cmGroupId, m.serverId, m.priority);
  }
}

export function getAllCmGroups() {
  const db = getDb();
  const groups = db
    .prepare("SELECT * FROM cm_groups ORDER BY name")
    .all() as any[];
  return groups.map((g) => {
    const members = db
      .prepare(
        `SELECT cgm.priority, s.id as server_id, s.name as server_name, s.hostname
         FROM cm_group_members cgm
         JOIN servers s ON cgm.server_id = s.id
         WHERE cgm.cm_group_id = ?
         ORDER BY cgm.priority`
      )
      .all(g.id);
    return { ...g, members };
  });
}

// --- Device Pools ---

export function upsertDevicePool(name: string, cmGroupId: number): number {
  const db = getDb();
  db.prepare(
    `INSERT INTO device_pools (name, cm_group_id) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET cm_group_id = ?`
  ).run(name, cmGroupId, cmGroupId);
  const row = db
    .prepare("SELECT id FROM device_pools WHERE name = ?")
    .get(name) as { id: number };
  return row.id;
}

export function getAllDevicePools() {
  return getDb()
    .prepare(
      `SELECT dp.*, cmg.name as cm_group_name
       FROM device_pools dp
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       ORDER BY dp.name`
    )
    .all();
}

// --- Phones ---

export function upsertPhone(phone: {
  name: string;
  description: string;
  model: string;
  devicePoolId: number;
}) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO phones (name, description, model, device_pool_id)
       VALUES (@name, @description, @model, @devicePoolId)
       ON CONFLICT(name) DO UPDATE SET
         description = @description,
         model = @model,
         device_pool_id = @devicePoolId`
    )
    .run(phone);
}

export function getAllPhones(limit = 100, offset = 0) {
  return getDb()
    .prepare(
      `SELECT p.*, dp.name as device_pool_name, cmg.name as cm_group_name
       FROM phones p
       LEFT JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       ORDER BY p.name
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
}

export function getPhoneCount() {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM phones")
    .get() as { count: number };
  return row.count;
}

// --- Registration Snapshots ---

export function insertRegistrationBatch(
  snapshots: {
    phoneId: number;
    registeredServerId: number | null;
    status: string;
    ipAddress: string;
  }[]
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO registration_snapshots (phone_id, registered_server_id, status, ip_address)
     VALUES (@phoneId, @registeredServerId, @status, @ipAddress)`
  );
  const upsertLatest = db.prepare(
    `INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
     VALUES (@phoneId, @registeredServerId, @status, @ipAddress, datetime('now'))
     ON CONFLICT(phone_id) DO UPDATE SET
       registered_server_id = @registeredServerId,
       status = @status,
       ip_address = @ipAddress,
       polled_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const s of snapshots) {
      insert.run(s);
      upsertLatest.run(s);
    }
  });
  tx();
}

export function getLatestRegistrations() {
  return getDb()
    .prepare(
      `SELECT lr.phone_id, lr.registered_server_id, lr.status, lr.ip_address, lr.polled_at,
              p.name as phone_name, s.name as server_name, s.hostname as server_hostname
       FROM latest_registrations lr
       JOIN phones p ON lr.phone_id = p.id
       LEFT JOIN servers s ON lr.registered_server_id = s.id`
    )
    .all();
}

export function getRegistrationStats() {
  return getDb()
    .prepare(
      `SELECT s.name as server_name, lr.status, COUNT(*) as count
       FROM latest_registrations lr
       LEFT JOIN servers s ON lr.registered_server_id = s.id
       GROUP BY s.name, lr.status`
    )
    .all();
}

export function getFailoverSummary() {
  return getDb()
    .prepare(
      `SELECT
         cmg.name as cm_group_name,
         s_reg.name as registered_server,
         s_pri.name as primary_server,
         cgm_match.priority as registered_priority,
         COUNT(*) as count
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       JOIN cm_group_members cgm_pri ON cgm_pri.cm_group_id = cmg.id AND cgm_pri.priority = 1
       JOIN servers s_pri ON cgm_pri.server_id = s_pri.id
       JOIN latest_registrations lr ON lr.phone_id = p.id
       JOIN servers s_reg ON lr.registered_server_id = s_reg.id
       LEFT JOIN cm_group_members cgm_match ON cgm_match.cm_group_id = cmg.id AND cgm_match.server_id = s_reg.id
       WHERE lr.status = 'Registered'
         AND lr.registered_server_id != cgm_pri.server_id
       GROUP BY cmg.name, s_reg.name, s_pri.name, cgm_match.priority
       ORDER BY count DESC`
    )
    .all();
}

export function getFailoverDetails() {
  return getDb()
    .prepare(
      `SELECT
         p.name as phone_name,
         p.model,
         dp.name as device_pool_name,
         cmg.name as cm_group_name,
         lr.ip_address,
         s_reg.name as registered_server,
         s_pri.name as primary_server,
         cgm_match.priority as registered_priority
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       JOIN cm_group_members cgm_pri ON cgm_pri.cm_group_id = cmg.id AND cgm_pri.priority = 1
       JOIN servers s_pri ON cgm_pri.server_id = s_pri.id
       JOIN latest_registrations lr ON lr.phone_id = p.id
       JOIN servers s_reg ON lr.registered_server_id = s_reg.id
       LEFT JOIN cm_group_members cgm_match ON cgm_match.cm_group_id = cmg.id AND cgm_match.server_id = s_reg.id
       WHERE lr.status = 'Registered'
         AND lr.registered_server_id != cgm_pri.server_id
       ORDER BY cmg.name, s_reg.name, p.name`
    )
    .all();
}

export function pruneOldSnapshots(daysToKeep = 7) {
  return getDb()
    .prepare(
      `DELETE FROM registration_snapshots
       WHERE polled_at < datetime('now', '-' || ? || ' days')`
    )
    .run(daysToKeep);
}

export function getPhoneByName(name: string) {
  return getDb().prepare("SELECT * FROM phones WHERE name = ?").get(name);
}

export function getPhonesByDevicePool(devicePoolId: number) {
  return getDb()
    .prepare("SELECT * FROM phones WHERE device_pool_id = ?")
    .all(devicePoolId);
}

// --- Device Pools (detailed) ---

export function getDevicePoolDetails() {
  const db = getDb();
  return db
    .prepare(
      `SELECT dp.id, dp.name, cmg.name as cm_group_name, COUNT(p.id) as phone_count
       FROM device_pools dp
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN phones p ON p.device_pool_id = dp.id
       GROUP BY dp.id
       ORDER BY phone_count DESC`
    )
    .all();
}

export function getDevicePoolPhoneBreakdown(devicePoolId: number) {
  const db = getDb();

  // Phones with their current server and IP
  const phones = db
    .prepare(
      `SELECT p.id, p.name, p.model, lr.ip_address, lr.status, s.name as server_name
       FROM phones p
       LEFT JOIN latest_registrations lr ON lr.phone_id = p.id
       LEFT JOIN servers s ON lr.registered_server_id = s.id
       WHERE p.device_pool_id = ?
       ORDER BY p.name`
    )
    .all(devicePoolId);

  // Server distribution
  const serverDist = db
    .prepare(
      `SELECT s.name as server_name, COUNT(*) as count
       FROM phones p
       JOIN latest_registrations lr ON lr.phone_id = p.id
       JOIN servers s ON lr.registered_server_id = s.id
       WHERE p.device_pool_id = ?
       GROUP BY s.name
       ORDER BY count DESC`
    )
    .all(devicePoolId);

  return { phones, serverDistribution: serverDist };
}

// --- Trunks ---

export function upsertTrunk(trunk: {
  name: string;
  description: string;
  devicePoolId: number;
}) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO trunks (name, description, device_pool_id)
       VALUES (@name, @description, @devicePoolId)
       ON CONFLICT(name) DO UPDATE SET
         description = @description,
         device_pool_id = @devicePoolId`
    )
    .run(trunk);
}

export function getAllTrunks() {
  return getDb()
    .prepare(
      `SELECT t.*, dp.name as device_pool_name, cmg.name as cm_group_name
       FROM trunks t
       LEFT JOIN device_pools dp ON t.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       ORDER BY t.name`
    )
    .all();
}

export function getTrunkByName(name: string) {
  return getDb().prepare("SELECT * FROM trunks WHERE name = ?").get(name);
}

export function getTrunkCount() {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM trunks")
    .get() as { count: number };
  return row.count;
}

export function insertTrunkSnapshotBatch(
  snapshots: {
    trunkId: number;
    registeredServerId: number | null;
    status: string;
    ipAddress: string;
  }[]
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO trunk_snapshots (trunk_id, registered_server_id, status, ip_address)
     VALUES (@trunkId, @registeredServerId, @status, @ipAddress)`
  );
  const upsertLatest = db.prepare(
    `INSERT INTO latest_trunk_registrations (trunk_id, registered_server_id, status, ip_address, polled_at)
     VALUES (@trunkId, @registeredServerId, @status, @ipAddress, datetime('now'))
     ON CONFLICT(trunk_id) DO UPDATE SET
       registered_server_id = @registeredServerId,
       status = @status,
       ip_address = @ipAddress,
       polled_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    for (const s of snapshots) {
      insert.run(s);
      upsertLatest.run(s);
    }
  });
  tx();
}

export function getLatestTrunkRegistrations() {
  return getDb()
    .prepare(
      `SELECT ltr.trunk_id, ltr.registered_server_id, ltr.status, ltr.ip_address, ltr.polled_at,
              t.name as trunk_name, t.description, s.name as server_name,
              dp.name as device_pool_name, cmg.name as cm_group_name
       FROM latest_trunk_registrations ltr
       JOIN trunks t ON ltr.trunk_id = t.id
       LEFT JOIN servers s ON ltr.registered_server_id = s.id
       LEFT JOIN device_pools dp ON t.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id`
    )
    .all();
}

export function getTrunkRegistrationStats() {
  return getDb()
    .prepare(
      `SELECT s.name as server_name, ltr.status, COUNT(*) as count
       FROM latest_trunk_registrations ltr
       LEFT JOIN servers s ON ltr.registered_server_id = s.id
       GROUP BY s.name, ltr.status`
    )
    .all();
}

// --- Gateways ---

export function upsertGateway(gw: {
  name: string;
  description: string;
  domainName: string;
  devicePoolId: number;
}) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO gateways (name, description, domain_name, device_pool_id)
       VALUES (@name, @description, @domainName, @devicePoolId)
       ON CONFLICT(name) DO UPDATE SET
         description = @description,
         domain_name = @domainName,
         device_pool_id = @devicePoolId`
    )
    .run(gw);
}

export function getAllGateways() {
  return getDb()
    .prepare(
      `SELECT g.*, dp.name as device_pool_name, cmg.name as cm_group_name
       FROM gateways g
       LEFT JOIN device_pools dp ON g.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       ORDER BY g.name`
    )
    .all();
}

export function getGatewayByName(name: string) {
  return getDb().prepare("SELECT * FROM gateways WHERE name = ?").get(name);
}

export function getGatewayCount() {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM gateways")
    .get() as { count: number };
  return row.count;
}

export function insertGatewaySnapshotBatch(
  snapshots: {
    gatewayId: number;
    registeredServerId: number | null;
    status: string;
    ipAddress: string;
  }[]
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO gateway_snapshots (gateway_id, registered_server_id, status, ip_address)
     VALUES (@gatewayId, @registeredServerId, @status, @ipAddress)`
  );
  const upsertLatest = db.prepare(
    `INSERT INTO latest_gateway_registrations (gateway_id, registered_server_id, status, ip_address, polled_at)
     VALUES (@gatewayId, @registeredServerId, @status, @ipAddress, datetime('now'))
     ON CONFLICT(gateway_id, registered_server_id) DO UPDATE SET
       status = @status,
       ip_address = @ipAddress,
       polled_at = datetime('now')`
  );
  const tx = db.transaction(() => {
    // Clear stale latest registrations before inserting fresh ones
    const gatewayIds = [...new Set(snapshots.map((s) => s.gatewayId))];
    const clearLatest = db.prepare(
      "DELETE FROM latest_gateway_registrations WHERE gateway_id = ?"
    );
    for (const id of gatewayIds) {
      clearLatest.run(id);
    }
    for (const s of snapshots) {
      insert.run(s);
      upsertLatest.run(s);
    }
  });
  tx();
}

export function getLatestGatewayRegistrations() {
  return getDb()
    .prepare(
      `SELECT lgr.gateway_id, lgr.registered_server_id, lgr.status, lgr.ip_address, lgr.polled_at,
              g.name as gateway_name, g.description, g.domain_name,
              s.name as server_name,
              dp.name as device_pool_name, cmg.name as cm_group_name
       FROM latest_gateway_registrations lgr
       JOIN gateways g ON lgr.gateway_id = g.id
       LEFT JOIN servers s ON lgr.registered_server_id = s.id
       LEFT JOIN device_pools dp ON g.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id`
    )
    .all();
}

export function getGatewayRegistrationStats() {
  return getDb()
    .prepare(
      `SELECT s.name as server_name, lgr.status, COUNT(*) as count
       FROM latest_gateway_registrations lgr
       LEFT JOIN servers s ON lgr.registered_server_id = s.id
       GROUP BY s.name, lgr.status`
    )
    .all();
}

export function getGatewaySummary() {
  // For each gateway, show how many subscribers it's registered to
  return getDb()
    .prepare(
      `SELECT g.id, g.name as gateway_name, g.description, g.domain_name,
              dp.name as device_pool_name, cmg.name as cm_group_name,
              COUNT(lgr.registered_server_id) as registered_count,
              GROUP_CONCAT(s.name, ', ') as registered_servers
       FROM gateways g
       LEFT JOIN device_pools dp ON g.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN latest_gateway_registrations lgr ON lgr.gateway_id = g.id AND lgr.status = 'Registered'
       LEFT JOIN servers s ON lgr.registered_server_id = s.id
       GROUP BY g.id
       ORDER BY g.name`
    )
    .all();
}

// --- Services ---

export function upsertServiceStatus(
  serverId: number,
  serviceName: string,
  status: string,
  reasonCode: string
) {
  return getDb()
    .prepare(
      `INSERT INTO service_statuses (server_id, service_name, status, reason_code, checked_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(server_id, service_name) DO UPDATE SET
         status = ?,
         reason_code = ?,
         checked_at = datetime('now')`
    )
    .run(serverId, serviceName, status, reasonCode, status, reasonCode);
}

export function getAllServiceStatuses() {
  return getDb()
    .prepare(
      `SELECT ss.*, s.name as server_name, s.hostname as server_hostname
       FROM service_statuses ss
       JOIN servers s ON ss.server_id = s.id
       ORDER BY ss.service_name, s.name`
    )
    .all();
}

export function getServiceStatusesByServer(serverId: number) {
  return getDb()
    .prepare(
      `SELECT * FROM service_statuses WHERE server_id = ? ORDER BY service_name`
    )
    .all(serverId);
}

export function getServiceSummary() {
  return getDb()
    .prepare(
      `SELECT ss.service_name,
              COUNT(*) as total_servers,
              SUM(CASE WHEN ss.status IN ('Started', 'started') THEN 1 ELSE 0 END) as active_count,
              SUM(CASE WHEN ss.status IN ('Stopped', 'stopped') THEN 1 ELSE 0 END) as stopped_count,
              SUM(CASE WHEN ss.status NOT IN ('Started', 'started', 'Stopped', 'stopped') THEN 1 ELSE 0 END) as error_count
       FROM service_statuses ss
       GROUP BY ss.service_name
       ORDER BY ss.service_name`
    )
    .all();
}

// --- Subnets ---

export function getAllSubnets() {
  return getDb().prepare("SELECT * FROM subnets ORDER BY name").all();
}

export function createSubnet(cidr: string, name: string, description = "") {
  return getDb()
    .prepare(
      "INSERT INTO subnets (cidr, name, description) VALUES (?, ?, ?)"
    )
    .run(cidr, name, description);
}

export function updateSubnet(id: number, cidr: string, name: string, description = "") {
  return getDb()
    .prepare(
      "UPDATE subnets SET cidr = ?, name = ?, description = ? WHERE id = ?"
    )
    .run(cidr, name, description, id);
}

export function deleteSubnet(id: number) {
  return getDb().prepare("DELETE FROM subnets WHERE id = ?").run(id);
}

export function getPhonesWithIps() {
  return getDb()
    .prepare(
      `SELECT p.id, p.name, dp.name as device_pool_name, cmg.name as cm_group_name, lr.ip_address
       FROM phones p
       LEFT JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN latest_registrations lr ON lr.phone_id = p.id
       ORDER BY p.name`
    )
    .all();
}
