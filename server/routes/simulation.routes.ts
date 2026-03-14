import { Router } from "express";
import { simulateFailover } from "../simulation/failover.engine.js";

const router = Router();

router.post("/", (req, res) => {
  const { disabledServerIds } = req.body;

  if (!Array.isArray(disabledServerIds)) {
    res.status(400).json({ error: "disabledServerIds must be an array" });
    return;
  }

  const result = simulateFailover(disabledServerIds);
  res.json(result);
});

export default router;
