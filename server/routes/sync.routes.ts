import { Router } from "express";
import { syncAll } from "../services/sync.service.js";
import { config } from "../config.js";

const router = Router();

router.post("/", async (_req, res) => {
  if (config.features.demoMode) {
    res.json({ message: "Demo mode — sync disabled, using seed data" });
    return;
  }
  try {
    const result = await syncAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
