import { Router } from "express";
import {
  getAllTrunks,
  getTrunkCount,
  getLatestTrunkRegistrations,
  getTrunkRegistrationStats,
} from "../db/queries.js";

const router = Router();

router.get("/", (_req, res) => {
  const trunks = getAllTrunks();
  const total = getTrunkCount();
  res.json({ trunks, total });
});

router.get("/registrations", (_req, res) => {
  const registrations = getLatestTrunkRegistrations();
  res.json(registrations);
});

router.get("/stats", (_req, res) => {
  const stats = getTrunkRegistrationStats();
  res.json(stats);
});

export default router;
