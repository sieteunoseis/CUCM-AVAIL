CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  hostname TEXT NOT NULL,
  node_type TEXT NOT NULL,
  ccm_service_active INTEGER DEFAULT 0,
  last_checked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cm_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cm_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cm_group_id INTEGER NOT NULL REFERENCES cm_groups(id) ON DELETE CASCADE,
  server_id INTEGER NOT NULL REFERENCES servers(id),
  priority INTEGER NOT NULL,
  UNIQUE(cm_group_id, priority)
);

CREATE TABLE IF NOT EXISTS device_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  cm_group_id INTEGER REFERENCES cm_groups(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  model TEXT DEFAULT '',
  device_pool_id INTEGER REFERENCES device_pools(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registration_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_id INTEGER NOT NULL REFERENCES phones(id),
  registered_server_id INTEGER REFERENCES servers(id),
  status TEXT NOT NULL,
  ip_address TEXT DEFAULT '',
  polled_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  device_pool_id INTEGER REFERENCES device_pools(id),
  destination TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trunk_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trunk_id INTEGER NOT NULL REFERENCES trunks(id),
  registered_server_id INTEGER REFERENCES servers(id),
  status TEXT NOT NULL,
  ip_address TEXT DEFAULT '',
  polled_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trunk_snap_latest ON trunk_snapshots(trunk_id, polled_at DESC);

CREATE TABLE IF NOT EXISTS subnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cidr TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reg_latest ON registration_snapshots(phone_id, polled_at DESC);
CREATE INDEX IF NOT EXISTS idx_phones_pool ON phones(device_pool_id);
CREATE INDEX IF NOT EXISTS idx_cmg_members ON cm_group_members(cm_group_id, priority);
