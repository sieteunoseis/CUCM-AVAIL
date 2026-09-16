import { Router } from "express";
import { getAllPhones, getPhoneCount, getPhoneStatus } from "../db/queries.js";
import { simulatePhoneImpact } from "../simulation/failover.engine.js";
import type { PhoneStatus } from "../types/index.js";

const router = Router();

router.get("/", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const phones = getAllPhones(limit, offset);
  const total = getPhoneCount();
  res.json({ phones, total, limit, offset });
});

// Live status for one phone: its CMG member servers (priority order, live
// CCM service state) and its current registration. Intended for cheap
// polling from an external dashboard card.
router.get("/:name/status", (req, res) => {
  const raw = getPhoneStatus(req.params.name);
  if (!raw) {
    res.status(404).json({ error: "Phone not found" });
    return;
  }

  const { phone, members, registration } = raw;
  const isRegistered =
    !!registration &&
    registration.registered_server_id != null &&
    (registration.status || "").toLowerCase() === "registered";

  let health: PhoneStatus["health"];
  if (!isRegistered) {
    health = "down";
  } else if (members.length > 0 && registration!.registered_server_id === members[0].server_id) {
    health = "ok";
  } else {
    health = "on_backup";
  }

  const status: PhoneStatus = {
    phoneName: phone.name,
    model: phone.model,
    devicePoolName: phone.device_pool_name,
    cmGroupName: phone.cm_group_name,
    members: members.map((m) => ({
      priority: m.priority,
      serverId: m.server_id,
      serverName: m.server_name,
      hostname: m.hostname,
      ccmServiceActive: m.ccm_service_active === 1,
    })),
    registeredServer: registration?.server_name ?? null,
    registrationStatus: registration?.status ?? null,
    ipAddress: registration?.ip_address || null,
    lastSeenAt: registration?.last_seen_at || null,
    lastActiveAt: registration?.last_active_at || null,
    health,
  };

  res.json(status);
});

// Hypothetical impact for one phone if the given servers were taken down
// (planned upgrade / outage modeling), e.g. GET /:name/impact?servers=3,7
router.get("/:name/impact", (req, res) => {
  const raw = (req.query.servers as string) || "";
  const disabledServerIds = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  const result = simulatePhoneImpact(req.params.name, disabledServerIds);
  if (!result) {
    res.status(404).json({ error: "Phone not found" });
    return;
  }
  res.json(result);
});

export default router;
