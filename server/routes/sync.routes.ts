import { Router } from "express";
import { syncAll } from "../services/sync.service.js";

const router = Router();

router.post("/", async (_req, res) => {
  try {
    const result = await syncAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
