import { Router } from "express";
import { getLatestRegistrations, getRegistrationStats, getFailoverSummary, getFailoverDetails } from "../db/queries.js";

const router = Router();

router.get("/latest", (_req, res) => {
  const registrations = getLatestRegistrations();
  res.json(registrations);
});

router.get("/stats", (_req, res) => {
  const stats = getRegistrationStats();
  res.json(stats);
});

router.get("/failover", (_req, res) => {
  const summary = getFailoverSummary();
  res.json(summary);
});

router.get("/failover/details", (_req, res) => {
  const details = getFailoverDetails();
  res.json(details);
});

export default router;
