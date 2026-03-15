import { Router } from "express";
import { runPlanner } from "../simulation/planner.engine.js";
import { getCached, setCache } from "../services/cache.service.js";

const router = Router();

router.get("/", (req, res) => {
  const cmgsParam = req.query.cmgs as string | undefined;
  const cmgIds = cmgsParam
    ? cmgsParam.split(",").map(Number).filter((n) => !isNaN(n))
    : undefined;

  const cacheKey = `planner:${cmgIds ? cmgIds.sort().join(",") : "default"}`;
  const cached = getCached(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const result = runPlanner(cmgIds);
  setCache(cacheKey, result);
  res.json(result);
});

export default router;
