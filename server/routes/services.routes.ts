import { Router } from "express";
import {
  getAllServiceStatuses,
  getServiceSummary,
  getServiceGroups,
} from "../db/queries.js";
import { SERVICE_DISPLAY_NAMES } from "../services/serviceability.service.js";

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

// GET display name map
router.get("/display-names", (_req, res) => {
  res.json(SERVICE_DISPLAY_NAMES);
});

// GET service groups (like AGs but for services)
router.get("/groups", (_req, res) => {
  const groups = getServiceGroups();
  res.json(groups);
});

export default router;
