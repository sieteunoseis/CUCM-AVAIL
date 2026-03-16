import { Router } from "express";
import {
  getAllGateways,
  getGatewayCount,
  getLatestGatewayRegistrations,
  getGatewayRegistrationStats,
  getGatewaySummary,
} from "../db/queries.js";

const router = Router();

router.get("/", (_req, res) => {
  const gateways = getAllGateways();
  const total = getGatewayCount();
  res.json({ gateways, total });
});

router.get("/registrations", (_req, res) => {
  const registrations = getLatestGatewayRegistrations();
  res.json(registrations);
});

router.get("/stats", (_req, res) => {
  const stats = getGatewayRegistrationStats();
  res.json(stats);
});

router.get("/summary", (_req, res) => {
  const summary = getGatewaySummary();
  res.json(summary);
});

export default router;
