import { Router } from "express";
import { runPlanner } from "../simulation/planner.engine.js";

const router = Router();

router.get("/", (req, res) => {
  const cmgsParam = req.query.cmgs as string | undefined;
  const cmgIds = cmgsParam
    ? cmgsParam.split(",").map(Number).filter((n) => !isNaN(n))
    : undefined;
  const result = runPlanner(cmgIds);
  res.json(result);
});

export default router;
