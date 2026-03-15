import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.db.path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  seedLatestRegistrations();
}

function seedLatestRegistrations() {
  // Populate latest_registrations from existing snapshot data if table is empty
  const count = (db.prepare("SELECT COUNT(*) as count FROM latest_registrations").get() as any).count;
  if (count === 0) {
    const snapCount = (db.prepare("SELECT COUNT(*) as count FROM registration_snapshots").get() as any).count;
    if (snapCount > 0) {
      db.exec(`
        INSERT OR REPLACE INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
        SELECT rs.phone_id, rs.registered_server_id, rs.status, rs.ip_address, rs.polled_at
        FROM registration_snapshots rs
        WHERE rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = rs.phone_id)
      `);
      console.log("[DB] Seeded latest_registrations from existing snapshots");
    }
  }

  // Same for trunks
  const trunkCount = (db.prepare("SELECT COUNT(*) as count FROM latest_trunk_registrations").get() as any).count;
  if (trunkCount === 0) {
    const tsCount = (db.prepare("SELECT COUNT(*) as count FROM trunk_snapshots").get() as any).count;
    if (tsCount > 0) {
      db.exec(`
        INSERT OR REPLACE INTO latest_trunk_registrations (trunk_id, registered_server_id, status, ip_address, polled_at)
        SELECT ts.trunk_id, ts.registered_server_id, ts.status, ts.ip_address, ts.polled_at
        FROM trunk_snapshots ts
        WHERE ts.polled_at = (SELECT MAX(ts2.polled_at) FROM trunk_snapshots ts2 WHERE ts2.trunk_id = ts.trunk_id)
      `);
      console.log("[DB] Seeded latest_trunk_registrations from existing snapshots");
    }
  }
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
