import { Router } from "express";
import { runPlanner } from "../simulation/planner.engine.js";

const router = Router();

router.get("/", (_req, res) => {
  const result = runPlanner();
  res.json(result);
});

export default router;
