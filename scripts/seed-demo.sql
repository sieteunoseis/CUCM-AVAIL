-- Demo database seed for CUCM Availability Dashboard
-- Creates a realistic multi-datacenter enterprise cluster with generic naming
-- 3 datacenters: HQ (headquarters), DR (disaster recovery), BR (branch)
-- 8 subscribers, ~2000 phones, trunks, gateways, subnets

-- ============================================================
-- SERVERS (1 publisher + 8 subscribers)
-- ============================================================
INSERT INTO servers (name, hostname, node_type, ccm_service_active, last_checked_at) VALUES
  ('hq-cucm-pub.acme.local',  'hq-cucm-pub.acme.local',  'Publisher',  1, datetime('now')),
  ('hq-cucm-sub01.acme.local','hq-cucm-sub01.acme.local','Subscriber', 1, datetime('now')),
  ('hq-cucm-sub02.acme.local','hq-cucm-sub02.acme.local','Subscriber', 1, datetime('now')),
  ('hq-cucm-sub03.acme.local','hq-cucm-sub03.acme.local','Subscriber', 1, datetime('now')),
  ('dr-cucm-sub01.acme.local','dr-cucm-sub01.acme.local','Subscriber', 1, datetime('now')),
  ('dr-cucm-sub02.acme.local','dr-cucm-sub02.acme.local','Subscriber', 1, datetime('now')),
  ('dr-cucm-sub03.acme.local','dr-cucm-sub03.acme.local','Subscriber', 1, datetime('now')),
  ('br-cucm-sub01.acme.local','br-cucm-sub01.acme.local','Subscriber', 1, datetime('now')),
  ('br-cucm-sub02.acme.local','br-cucm-sub02.acme.local','Subscriber', 1, datetime('now'));

-- ============================================================
-- CM GROUPS (6 CMGs across 3 datacenters)
-- ============================================================
INSERT INTO cm_groups (name) VALUES
  ('CMG-HQ1'),   -- 1: hq-sub01 primary, hq-sub02 backup, dr-sub01 tertiary
  ('CMG-HQ2'),   -- 2: hq-sub02 primary, hq-sub03 backup, dr-sub02 tertiary
  ('CMG-HQ3'),   -- 3: hq-sub03 primary, hq-sub01 backup, dr-sub03 tertiary
  ('CMG-DR1'),   -- 4: dr-sub01 primary, dr-sub02 backup, hq-sub01 tertiary
  ('CMG-DR2'),   -- 5: dr-sub02 primary, dr-sub03 backup, hq-sub02 tertiary
  ('CMG-BR1');   -- 6: br-sub01 primary, br-sub02 backup, hq-sub03 tertiary

-- CMG members (server IDs: pub=1, hq-sub01=2, hq-sub02=3, hq-sub03=4, dr-sub01=5, dr-sub02=6, dr-sub03=7, br-sub01=8, br-sub02=9)
INSERT INTO cm_group_members (cm_group_id, server_id, priority) VALUES
  (1, 2, 1), (1, 3, 2), (1, 5, 3),
  (2, 3, 1), (2, 4, 2), (2, 6, 3),
  (3, 4, 1), (3, 2, 2), (3, 7, 3),
  (4, 5, 1), (4, 6, 2), (4, 2, 3),
  (5, 6, 1), (5, 7, 2), (5, 3, 3),
  (6, 8, 1), (6, 9, 2), (6, 4, 3);

-- ============================================================
-- DEVICE POOLS
-- ============================================================
INSERT INTO device_pools (name, cm_group_id) VALUES
  ('DP-HQ-Lobby',       1),
  ('DP-HQ-Engineering', 1),
  ('DP-HQ-Finance',     2),
  ('DP-HQ-Executive',   2),
  ('DP-HQ-IT',          3),
  ('DP-HQ-HR',          3),
  ('DP-HQ-CommonArea',  1),
  ('DP-DR-Operations',  4),
  ('DP-DR-Support',     4),
  ('DP-DR-Lab',         5),
  ('DP-DR-CommonArea',  5),
  ('DP-BR-Sales',       6),
  ('DP-BR-Warehouse',   6),
  ('DP-BR-CommonArea',  6);

-- ============================================================
-- PHONES (~2000 across all device pools)
-- Using recursive CTE to generate sequences
-- ============================================================

-- HQ-Lobby (DP 1, CMG-HQ1): 180 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 180)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00000000 + n),
  'Lobby ' || printf('%03d', n),
  CASE n % 4 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' WHEN 2 THEN 'Cisco 7841' ELSE 'Cisco 8861' END,
  1
FROM seq;

-- HQ-Engineering (DP 2, CMG-HQ1): 320 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 320)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00010000 + n),
  'Eng ' || printf('%03d', n),
  CASE n % 5 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8865' WHEN 2 THEN 'Cisco 8851' WHEN 3 THEN 'Cisco 7841' ELSE 'Cisco 8861' END,
  2
FROM seq;

-- HQ-Finance (DP 3, CMG-HQ2): 200 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 200)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00020000 + n),
  'Finance ' || printf('%03d', n),
  CASE n % 3 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' ELSE 'Cisco 7841' END,
  3
FROM seq;

-- HQ-Executive (DP 4, CMG-HQ2): 60 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 60)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00030000 + n),
  'Exec ' || printf('%03d', n),
  CASE n % 2 WHEN 0 THEN 'Cisco 8865' ELSE 'Cisco 8861' END,
  4
FROM seq;

-- HQ-IT (DP 5, CMG-HQ3): 150 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 150)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00040000 + n),
  'IT ' || printf('%03d', n),
  CASE n % 4 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' WHEN 2 THEN 'Cisco 7841' ELSE 'Cisco 8865' END,
  5
FROM seq;

-- HQ-HR (DP 6, CMG-HQ3): 100 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 100)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00050000 + n),
  'HR ' || printf('%03d', n),
  CASE n % 3 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' ELSE 'Cisco 7841' END,
  6
FROM seq;

-- HQ-CommonArea (DP 7, CMG-HQ1): 90 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 90)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00060000 + n),
  'CA-HQ ' || printf('%03d', n),
  'Cisco 7811',
  7
FROM seq;

-- DR-Operations (DP 8, CMG-DR1): 250 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 250)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00070000 + n),
  'DR-Ops ' || printf('%03d', n),
  CASE n % 4 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' WHEN 2 THEN 'Cisco 7841' ELSE 'Cisco 8861' END,
  8
FROM seq;

-- DR-Support (DP 9, CMG-DR1): 150 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 150)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00080000 + n),
  'DR-Support ' || printf('%03d', n),
  CASE n % 3 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 7841' ELSE 'Cisco 8851' END,
  9
FROM seq;

-- DR-Lab (DP 10, CMG-DR2): 120 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 120)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB00090000 + n),
  'DR-Lab ' || printf('%03d', n),
  CASE n % 3 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 7841' ELSE 'Cisco 7811' END,
  10
FROM seq;

-- DR-CommonArea (DP 11, CMG-DR2): 60 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 60)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB000A0000 + n),
  'CA-DR ' || printf('%03d', n),
  'Cisco 7811',
  11
FROM seq;

-- BR-Sales (DP 12, CMG-BR1): 160 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 160)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB000B0000 + n),
  'BR-Sales ' || printf('%03d', n),
  CASE n % 3 WHEN 0 THEN 'Cisco 8845' WHEN 1 THEN 'Cisco 8851' ELSE 'Cisco 7841' END,
  12
FROM seq;

-- BR-Warehouse (DP 13, CMG-BR1): 80 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 80)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB000C0000 + n),
  'BR-Warehouse ' || printf('%03d', n),
  CASE n % 2 WHEN 0 THEN 'Cisco 7821' ELSE 'Cisco 7811' END,
  13
FROM seq;

-- BR-CommonArea (DP 14, CMG-BR1): 30 phones
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 30)
INSERT INTO phones (name, description, model, device_pool_id)
SELECT
  'SEP' || printf('%012X', 0xAABB000D0000 + n),
  'CA-BR ' || printf('%03d', n),
  'Cisco 7811',
  14
FROM seq;

-- ============================================================
-- REGISTRATION DATA
-- Most phones on primary, some failover to simulate real state
-- ============================================================

-- CMG-HQ1 phones (DPs 1,2,7 -> primary=hq-sub01 id=2)
-- 95% on primary, 4% on backup (hq-sub02 id=3), 1% on tertiary (dr-sub01 id=5)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 95 THEN 2
    WHEN (p.id % 100) < 99 THEN 3
    ELSE 5
  END,
  'Registered',
  '10.10.' || ((p.id % 4) + 1) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (1, 2, 7);

-- CMG-HQ2 phones (DPs 3,4 -> primary=hq-sub02 id=3)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 93 THEN 3
    WHEN (p.id % 100) < 98 THEN 4
    ELSE 6
  END,
  'Registered',
  '10.10.' || ((p.id % 4) + 5) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (3, 4);

-- CMG-HQ3 phones (DPs 5,6 -> primary=hq-sub03 id=4)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 96 THEN 4
    WHEN (p.id % 100) < 99 THEN 2
    ELSE 7
  END,
  'Registered',
  '10.10.' || ((p.id % 4) + 9) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (5, 6);

-- CMG-DR1 phones (DPs 8,9 -> primary=dr-sub01 id=5)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 90 THEN 5
    WHEN (p.id % 100) < 97 THEN 6
    ELSE 2
  END,
  'Registered',
  '10.20.' || ((p.id % 4) + 1) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (8, 9);

-- CMG-DR2 phones (DPs 10,11 -> primary=dr-sub02 id=6)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 94 THEN 6
    WHEN (p.id % 100) < 99 THEN 7
    ELSE 3
  END,
  'Registered',
  '10.20.' || ((p.id % 4) + 5) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (10, 11);

-- CMG-BR1 phones (DPs 12,13,14 -> primary=br-sub01 id=8)
INSERT INTO latest_registrations (phone_id, registered_server_id, status, ip_address, polled_at)
SELECT
  p.id,
  CASE
    WHEN (p.id % 100) < 92 THEN 8
    WHEN (p.id % 100) < 98 THEN 9
    ELSE 4
  END,
  'Registered',
  '10.30.' || ((p.id % 4) + 1) || '.' || ((p.id % 254) + 1),
  datetime('now')
FROM phones p WHERE p.device_pool_id IN (12, 13, 14);

-- ============================================================
-- SIP TRUNKS
-- ============================================================
INSERT INTO trunks (name, description, device_pool_id) VALUES
  ('SIP-PSTN-HQ-01',    'PSTN Gateway HQ Primary',     1),
  ('SIP-PSTN-HQ-02',    'PSTN Gateway HQ Secondary',   3),
  ('SIP-PSTN-DR-01',    'PSTN Gateway DR Primary',     8),
  ('SIP-CUBE-HQ-01',    'CUBE SBC HQ',                 1),
  ('SIP-CUBE-DR-01',    'CUBE SBC DR',                 8),
  ('SIP-WEBEX-01',      'Webex Calling Trunk',         3),
  ('SIP-TEAMS-01',      'MS Teams Direct Routing',     5),
  ('SIP-UNITY-HQ-01',   'Unity Connection HQ',         2),
  ('SIP-UNITY-DR-01',   'Unity Connection DR',        10),
  ('SIP-CER-01',        'Emergency Responder',         5);

INSERT INTO latest_trunk_registrations (trunk_id, registered_server_id, status, ip_address, polled_at)
SELECT t.id,
  CASE
    WHEN t.device_pool_id IN (1,2) THEN 2
    WHEN t.device_pool_id IN (3,4) THEN 3
    WHEN t.device_pool_id IN (5,6) THEN 4
    WHEN t.device_pool_id IN (8,9) THEN 5
    WHEN t.device_pool_id IN (10,11) THEN 6
    ELSE 8
  END,
  'Registered',
  '10.10.100.' || t.id,
  datetime('now')
FROM trunks t;

-- ============================================================
-- MGCP GATEWAYS
-- ============================================================
INSERT INTO gateways (name, description, domain_name, device_pool_id) VALUES
  ('AALN/S0/SU0/0@HQ-VG310-01', 'HQ Main Lobby Analog',       'HQ-VG310-01.acme.local',  1),
  ('AALN/S0/SU0/0@HQ-VG310-02', 'HQ Conference Rooms',        'HQ-VG310-02.acme.local',  2),
  ('AALN/S0/SU0/0@HQ-VG310-03', 'HQ Executive Floor',         'HQ-VG310-03.acme.local',  4),
  ('AALN/S0/SU0/0@DR-VG310-01', 'DR Operations Floor Analog',  'DR-VG310-01.acme.local',  8),
  ('AALN/S0/SU0/0@DR-VG310-02', 'DR Support Center',          'DR-VG310-02.acme.local',  9),
  ('AALN/S0/SU0/0@BR-VG310-01', 'Branch Sales Floor',         'BR-VG310-01.acme.local', 12),
  ('T1CAS/0@HQ-VG350-01',       'HQ PRI Gateway',             'HQ-VG350-01.acme.local',  1),
  ('T1CAS/0@DR-VG350-01',       'DR PRI Gateway',             'DR-VG350-01.acme.local',  8);

-- Gateway registrations (each to 3 servers per CMG)
INSERT INTO latest_gateway_registrations (gateway_id, registered_server_id, status, ip_address, polled_at) VALUES
  -- HQ gateways (CMG-HQ1: servers 2,3,5)
  (1, 2, 'Registered', '10.10.50.1', datetime('now')),
  (1, 3, 'Registered', '10.10.50.1', datetime('now')),
  (1, 5, 'Registered', '10.10.50.1', datetime('now')),
  (2, 2, 'Registered', '10.10.50.2', datetime('now')),
  (2, 3, 'Registered', '10.10.50.2', datetime('now')),
  (2, 5, 'Registered', '10.10.50.2', datetime('now')),
  -- Executive floor gateway (CMG-HQ2: servers 3,4,6) - one sub down for demo
  (3, 3, 'Registered',   '10.10.50.3', datetime('now')),
  (3, 4, 'Registered',   '10.10.50.3', datetime('now')),
  (3, 6, 'UnRegistered', '10.10.50.3', datetime('now')),
  -- DR gateways (CMG-DR1: servers 5,6,2)
  (4, 5, 'Registered', '10.20.50.1', datetime('now')),
  (4, 6, 'Registered', '10.20.50.1', datetime('now')),
  (4, 2, 'Registered', '10.20.50.1', datetime('now')),
  (5, 5, 'Registered', '10.20.50.2', datetime('now')),
  (5, 6, 'Registered', '10.20.50.2', datetime('now')),
  (5, 2, 'Registered', '10.20.50.2', datetime('now')),
  -- BR gateway (CMG-BR1: servers 8,9,4)
  (6, 8, 'Registered', '10.30.50.1', datetime('now')),
  (6, 9, 'Registered', '10.30.50.1', datetime('now')),
  (6, 4, 'Registered', '10.30.50.1', datetime('now')),
  -- PRI gateways
  (7, 2, 'Registered', '10.10.50.10', datetime('now')),
  (7, 3, 'Registered', '10.10.50.10', datetime('now')),
  (7, 5, 'Registered', '10.10.50.10', datetime('now')),
  (8, 5, 'Registered', '10.20.50.10', datetime('now')),
  (8, 6, 'Registered', '10.20.50.10', datetime('now')),
  (8, 2, 'Registered', '10.20.50.10', datetime('now'));

-- ============================================================
-- SUBNETS
-- ============================================================
INSERT INTO subnets (cidr, name, description) VALUES
  ('10.10.1.0/24', 'HQ-Voice-1',     'HQ Building A Voice VLAN'),
  ('10.10.2.0/24', 'HQ-Voice-2',     'HQ Building B Voice VLAN'),
  ('10.10.3.0/24', 'HQ-Voice-3',     'HQ Building C Voice VLAN'),
  ('10.10.4.0/24', 'HQ-Voice-4',     'HQ Building D Voice VLAN'),
  ('10.10.5.0/24', 'HQ-Finance',     'HQ Finance Floor'),
  ('10.10.6.0/24', 'HQ-Executive',   'HQ Executive Floor'),
  ('10.10.7.0/24', 'HQ-Exec-2',      'HQ Executive Annex'),
  ('10.10.8.0/24', 'HQ-Finance-2',   'HQ Finance Annex'),
  ('10.10.9.0/24', 'HQ-IT-Voice',    'HQ IT Department'),
  ('10.10.10.0/24','HQ-IT-Voice-2',  'HQ IT Lab'),
  ('10.10.11.0/24','HQ-HR-Voice',    'HQ Human Resources'),
  ('10.10.12.0/24','HQ-HR-Voice-2',  'HQ HR Annex'),
  ('10.20.1.0/24', 'DR-Voice-1',     'DR Building A Voice VLAN'),
  ('10.20.2.0/24', 'DR-Voice-2',     'DR Building B Voice VLAN'),
  ('10.20.3.0/24', 'DR-Voice-3',     'DR Building C Voice VLAN'),
  ('10.20.4.0/24', 'DR-Voice-4',     'DR Building D Voice VLAN'),
  ('10.20.5.0/24', 'DR-Lab-Voice',   'DR Lab Voice VLAN'),
  ('10.20.6.0/24', 'DR-Lab-Voice-2', 'DR Lab Annex'),
  ('10.20.7.0/24', 'DR-Support',     'DR Support Center'),
  ('10.20.8.0/24', 'DR-Support-2',   'DR Support Annex'),
  ('10.30.1.0/24', 'BR-Voice-1',     'Branch Sales Voice VLAN'),
  ('10.30.2.0/24', 'BR-Voice-2',     'Branch Warehouse Voice VLAN'),
  ('10.30.3.0/24', 'BR-Voice-3',     'Branch CommonArea Voice VLAN'),
  ('10.30.4.0/24', 'BR-Voice-4',     'Branch Warehouse Annex');
