import { Router } from "express";
import {
  getDevicePoolDetails,
  getDevicePoolPhoneBreakdown,
  getAllSubnets,
} from "../db/queries.js";
import { getDb } from "../db/database.js";
import { matchSubnet, type SubnetRow } from "../utils/subnet.js";

const router = Router();

// GET all device pools with phone counts (optionally filtered by model)
router.get("/", (req, res) => {
  const model = req.query.model as string | undefined;
  if (model) {
    const db = getDb();
    const pools = db
      .prepare(
        `SELECT dp.id, dp.name, cmg.name as cm_group_name, COUNT(p.id) as phone_count
         FROM device_pools dp
         LEFT JOIN cm_groups cmg ON dp.cm_group_id = cmg.id
         LEFT JOIN phones p ON p.device_pool_id = dp.id AND p.model = ?
         GROUP BY dp.id
         HAVING phone_count > 0
         ORDER BY phone_count DESC`
      )
      .all(model);
    res.json(pools);
  } else {
    const pools = getDevicePoolDetails();
    res.json(pools);
  }
});

// GET all distinct phone models with counts
router.get("/models", (_req, res) => {
  const db = getDb();
  const models = db
    .prepare(
      `SELECT model, COUNT(*) as count
       FROM phones
       WHERE model <> ''
       GROUP BY model
       ORDER BY count DESC`
    )
    .all();
  res.json(models);
});

// GET detailed breakdown for a specific device pool
router.get("/:id/breakdown", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { phones, serverDistribution } = getDevicePoolPhoneBreakdown(id);
  const subnets = getAllSubnets() as SubnetRow[];

  // Compute subnet distribution for this device pool's phones
  const subnetCounts: Record<string, { name: string; cidr: string; count: number }> = {};
  let unmapped = 0;

  for (const phone of phones as any[]) {
    const ip = phone.ip_address || "";
    const matched = matchSubnet(ip, subnets);
    if (matched) {
      if (!subnetCounts[matched.cidr]) {
        subnetCounts[matched.cidr] = { name: matched.name, cidr: matched.cidr, count: 0 };
      }
      subnetCounts[matched.cidr].count++;
    } else {
      unmapped++;
    }
  }

  // Model distribution
  const modelCounts: Record<string, number> = {};
  for (const phone of phones as any[]) {
    const model = (phone as any).model || "Unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  }

  res.json({
    totalPhones: (phones as any[]).length,
    serverDistribution,
    subnetDistribution: Object.values(subnetCounts),
    unmappedSubnet: unmapped,
    modelDistribution: Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count),
  });
});

export default router;
