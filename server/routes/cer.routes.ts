import { Router } from "express";
import { config } from "../config.js";
import { syncCer } from "../services/cer.service.js";
import { getCerSyncStatus } from "../db/queries.js";

const router = Router();

export function cerStatusJson() {
  const s = getCerSyncStatus();
  return {
    enabled: config.features.enableCer,
    lastSuccess: s?.last_success ?? null,
    subnetCount: s?.subnet_count ?? 0,
    skippedNontrackable: s?.skipped_nontrackable ?? 0,
    lastError: s?.last_error || "",
    lastAttempt: s?.last_attempt ?? null,
  };
}

let syncing = false;

router.post("/sync", async (_req, res) => {
  if (!config.features.enableCer) {
    res.status(400).json({ error: "CER not configured" });
    return;
  }
  if (syncing) {
    res.status(409).json({ error: "CER sync already running" });
    return;
  }
  syncing = true;
  try {
    res.json(await syncCer());
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  } finally {
    syncing = false;
  }
});

router.get("/status", (_req, res) => {
  res.json(cerStatusJson());
});

export default router;
