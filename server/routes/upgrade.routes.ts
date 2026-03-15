import { Router } from "express";
import { analyzeUpgradeOrder } from "../simulation/upgrade.engine.js";
import { getCached, setCache } from "../services/cache.service.js";

const router = Router();

router.get("/", (_req, res) => {
  const cached = getCached("upgrade");
  if (cached) {
    res.json(cached);
    return;
  }

  const analysis = analyzeUpgradeOrder();
  setCache("upgrade", analysis);
  res.json(analysis);
});

export default router;
