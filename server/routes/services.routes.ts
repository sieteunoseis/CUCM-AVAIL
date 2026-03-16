import { Router } from "express";
import {
  getAllServiceStatuses,
  getServiceSummary,
} from "../db/queries.js";
import { SERVICE_DISPLAY_NAMES, TRACKED_SERVICES } from "../services/serviceability.service.js";

const router = Router();

// GET all service statuses (one row per server × service)
router.get("/", (_req, res) => {
  const statuses = getAllServiceStatuses();
  res.json(statuses);
});

// GET summary (one row per service with active/stopped counts)
router.get("/summary", (_req, res) => {
  const summary = getServiceSummary();
  res.json(summary);
});

// GET tracked service names with display labels
router.get("/tracked", (_req, res) => {
  res.json(
    TRACKED_SERVICES.map((name) => ({
      name,
      displayName: SERVICE_DISPLAY_NAMES[name] || name,
    }))
  );
});

export default router;
