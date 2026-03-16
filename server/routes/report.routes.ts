import { Router } from "express";
import { getDb } from "../db/database.js";

const router = Router();

// GET phone report — all phones with extended registration data
router.get("/phones", (req, res) => {
  const db = getDb();
  const search = (req.query.search as string) || "";
  const model = (req.query.model as string) || "";
  const protocol = (req.query.protocol as string) || "";
  const status = (req.query.status as string) || "";
  const server = (req.query.server as string) || "";
  const firmware = (req.query.firmware as string) || "";

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (search) {
    where += " AND (p.name LIKE ? OR p.description LIKE ? OR lr.dir_number LIKE ? OR lr.login_user_id LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (model) {
    where += " AND p.model = ?";
    params.push(model);
  }
  if (protocol) {
    where += " AND lr.protocol = ?";
    params.push(protocol);
  }
  if (status) {
    where += " AND lr.status = ?";
    params.push(status);
  }
  if (server) {
    where += " AND s.name = ?";
    params.push(server);
  }
  if (firmware) {
    where += " AND lr.active_load_id = ?";
    params.push(firmware);
  }

  const phones = db
    .prepare(
      `SELECT p.name as phone_name, p.description, p.model,
              dp.name as device_pool_name, cmg.name as cm_group_name,
              lr.status, lr.ip_address, lr.status_reason, lr.dir_number,
              lr.protocol, lr.active_load_id, lr.last_seen_at, lr.last_active_at, lr.login_user_id,
              lr.polled_at, s.name as server_name
       FROM phones p
       LEFT JOIN device_pools dp ON p.device_pool_id = dp.id
       LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
       LEFT JOIN latest_registrations lr ON lr.phone_id = p.id
       LEFT JOIN servers s ON lr.registered_server_id = s.id
       ${where}
       ORDER BY p.name`
    )
    .all(...params);

  res.json(phones);
});

// GET cluster summary — active phone stats
router.get("/summary", (_req, res) => {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as c FROM phones").get() as any).c;

  const registered = (db.prepare(
    "SELECT COUNT(*) as c FROM latest_registrations WHERE status IN ('Registered', 'registered')"
  ).get() as any).c;

  const unregistered = (db.prepare(
    "SELECT COUNT(*) as c FROM latest_registrations WHERE status NOT IN ('Registered', 'registered')"
  ).get() as any).c;

  const neverSeen = total - registered - unregistered;

  // Active in last 24h, 7d, 30d based on last_seen_at
  // last_seen_at may be Unix epoch (string) or ISO date — handle both
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;

  const active24h = (db.prepare(
    `SELECT COUNT(*) as c FROM latest_registrations
     WHERE last_seen_at != '' AND (
       CAST(last_seen_at AS INTEGER) > ? OR last_seen_at > datetime('now', '-1 day')
     )`
  ).get(now - day) as any).c;

  const active7d = (db.prepare(
    `SELECT COUNT(*) as c FROM latest_registrations
     WHERE last_seen_at != '' AND (
       CAST(last_seen_at AS INTEGER) > ? OR last_seen_at > datetime('now', '-7 days')
     )`
  ).get(now - 7 * day) as any).c;

  const active30d = (db.prepare(
    `SELECT COUNT(*) as c FROM latest_registrations
     WHERE last_seen_at != '' AND (
       CAST(last_seen_at AS INTEGER) > ? OR last_seen_at > datetime('now', '-30 days')
     )`
  ).get(now - 30 * day) as any).c;

  // Per-server breakdown
  const serverBreakdown = db.prepare(
    `SELECT s.name as server_name,
            COUNT(*) as total,
            SUM(CASE WHEN lr.status IN ('Registered', 'registered') THEN 1 ELSE 0 END) as registered,
            SUM(CASE WHEN lr.status NOT IN ('Registered', 'registered') THEN 1 ELSE 0 END) as unregistered
     FROM latest_registrations lr
     JOIN servers s ON lr.registered_server_id = s.id
     GROUP BY s.name
     ORDER BY total DESC`
  ).all();

  // Protocol distribution
  const protocols = db.prepare(
    `SELECT protocol, COUNT(*) as count
     FROM latest_registrations
     WHERE protocol != ''
     GROUP BY protocol
     ORDER BY count DESC`
  ).all();

  // Firmware distribution (top 20)
  const firmware = db.prepare(
    `SELECT active_load_id as firmware, COUNT(*) as count
     FROM latest_registrations
     WHERE active_load_id != ''
     GROUP BY active_load_id
     ORDER BY count DESC
     LIMIT 20`
  ).all();

  // Model distribution
  const models = db.prepare(
    `SELECT p.model, COUNT(*) as count
     FROM phones p
     WHERE p.model != ''
     GROUP BY p.model
     ORDER BY count DESC`
  ).all();

  res.json({
    total,
    registered,
    unregistered,
    neverSeen,
    active24h,
    active7d,
    active30d,
    serverBreakdown,
    protocols,
    firmware,
    models,
  });
});

export default router;
