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
  const tx = db.transaction(() => {
    for (const s of snapshots) {
      insert.run(s);
    }
  });
  tx();
}

export function getLatestRegistrations() {
  return getDb()
    .prepare(
      `SELECT rs.*, p.name as phone_name, s.name as server_name, s.hostname as server_hostname
       FROM registration_snapshots rs
       JOIN phones p ON rs.phone_id = p.id
       LEFT JOIN servers s ON rs.registered_server_id = s.id
       WHERE rs.polled_at = (
         SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = rs.phone_id
       )`
    )
    .all();
}

export function getRegistrationStats() {
  return getDb()
    .prepare(
      `SELECT s.name as server_name, rs.status, COUNT(*) as count
       FROM registration_snapshots rs
       LEFT JOIN servers s ON rs.registered_server_id = s.id
       WHERE rs.polled_at = (
         SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = rs.phone_id
       )
       GROUP BY s.name, rs.status`
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
      `SELECT p.id, p.name, p.model, rs.ip_address, rs.status, s.name as server_name
       FROM phones p
       LEFT JOIN registration_snapshots rs ON rs.phone_id = p.id
         AND rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = p.id)
       LEFT JOIN servers s ON rs.registered_server_id = s.id
       WHERE p.device_pool_id = ?
       ORDER BY p.name`
    )
    .all(devicePoolId);

  // Server distribution
  const serverDist = db
    .prepare(
      `SELECT s.name as server_name, COUNT(*) as count
       FROM phones p
       JOIN registration_snapshots rs ON rs.phone_id = p.id
         AND rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = p.id)
       JOIN servers s ON rs.registered_server_id = s.id
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
  const tx = db.transaction(() => {
    for (const s of snapshots) {
      insert.run(s);
    }
  });
  tx();
}

export function getLatestTrunkRegistrations() {
  return getDb()
    .prepare(
      `SELECT ts.*, t.name as trunk_name, t.description, s.name as server_name,
              dp.name as device_pool_name, cmg.name as cm_group_name
       FROM trunk_snapshots ts
       JOIN trunks t ON ts.trunk_id = t.id
       LEFT JOIN servers s ON ts.registered_server_id = s.id
       LEFT JOIN device_pools dp ON t.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       WHERE ts.polled_at = (
         SELECT MAX(ts2.polled_at) FROM trunk_snapshots ts2 WHERE ts2.trunk_id = ts.trunk_id
       )`
    )
    .all();
}

export function getTrunkRegistrationStats() {
  return getDb()
    .prepare(
      `SELECT s.name as server_name, ts.status, COUNT(*) as count
       FROM trunk_snapshots ts
       LEFT JOIN servers s ON ts.registered_server_id = s.id
       WHERE ts.polled_at = (
         SELECT MAX(ts2.polled_at) FROM trunk_snapshots ts2 WHERE ts2.trunk_id = ts.trunk_id
       )
       GROUP BY s.name, ts.status`
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
      `SELECT p.id, p.name, dp.name as device_pool_name, cmg.name as cm_group_name, rs.ip_address
       FROM phones p
       LEFT JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN registration_snapshots rs ON rs.phone_id = p.id
         AND rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = p.id)
       ORDER BY p.name`
    )
    .all();
}
