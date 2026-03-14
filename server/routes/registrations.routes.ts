import { Router } from "express";
import { getLatestRegistrations, getRegistrationStats } from "../db/queries.js";

const router = Router();

router.get("/latest", (_req, res) => {
  const registrations = getLatestRegistrations();
  res.json(registrations);
});

router.get("/stats", (_req, res) => {
  const stats = getRegistrationStats();
  res.json(stats);
});

export default router;
