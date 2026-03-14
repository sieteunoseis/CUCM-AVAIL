import { Router } from "express";
import { analyzeUpgradeOrder } from "../simulation/upgrade.engine.js";

const router = Router();

router.get("/", (_req, res) => {
  const analysis = analyzeUpgradeOrder();
  res.json(analysis);
});

export default router;
