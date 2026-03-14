import { Router } from "express";
import {
  getAllSubnets,
  createSubnet,
  updateSubnet,
  deleteSubnet,
  getPhonesWithIps,
} from "../db/queries.js";
import { getDb } from "../db/database.js";
import { matchSubnet, type SubnetRow } from "../utils/subnet.js";

const router = Router();

// GET all subnets
router.get("/", (_req, res) => {
  const subnets = getAllSubnets();
  res.json(subnets);
});

// POST create subnet
router.post("/", (req, res) => {
  const { cidr, name, description } = req.body;
  if (!cidr || !name) {
    res.status(400).json({ error: "cidr and name are required" });
    return;
  }
  try {
    const result = createSubnet(cidr, name, description || "");
    res.json({ id: result.lastInsertRowid, cidr, name, description });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) {
      res.status(409).json({ error: "Subnet CIDR already exists" });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// PUT update subnet
router.put("/:id", (req, res) => {
  const { cidr, name, description } = req.body;
  updateSubnet(parseInt(req.params.id, 10), cidr, name, description || "");
  res.json({ ok: true });
});

// DELETE subnet
router.delete("/:id", (req, res) => {
  deleteSubnet(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// GET subnet distribution — phones per subnet per CMG
router.get("/distribution", (_req, res) => {
  const subnets = getAllSubnets() as SubnetRow[];
  const phones = getPhonesWithIps() as any[];

  const distribution: Record<
    string,
    { subnetId: number; subnetName: string; cidr: string; count: number; cmGroups: Record<string, number> }
  > = {};

  let unmapped = 0;
  const unmappedCmGroups: Record<string, number> = {};

  for (const phone of phones) {
    const ip = phone.ip_address;
    const cmg = phone.cm_group_name || "Unknown";
    const matched = matchSubnet(ip, subnets);

    if (matched) {
      if (!distribution[matched.cidr]) {
        distribution[matched.cidr] = {
          subnetId: matched.id,
          subnetName: matched.name,
          cidr: matched.cidr,
          count: 0,
          cmGroups: {},
        };
      }
      distribution[matched.cidr].count++;
      distribution[matched.cidr].cmGroups[cmg] =
        (distribution[matched.cidr].cmGroups[cmg] || 0) + 1;
    } else {
      unmapped++;
      unmappedCmGroups[cmg] = (unmappedCmGroups[cmg] || 0) + 1;
    }
  }

  res.json({
    subnets: Object.values(distribution),
    unmapped,
    unmappedCmGroups,
    totalPhones: phones.length,
  });
});

// GET shared IPs (multiple phones on same IP — likely Expressway/MRA)
router.get("/shared-ips", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rs.ip_address, COUNT(DISTINCT rs.phone_id) as phone_count,
              GROUP_CONCAT(DISTINCT p.name) as phone_names
       FROM registration_snapshots rs
       JOIN phones p ON rs.phone_id = p.id
       WHERE rs.ip_address <> ''
         AND rs.polled_at = (SELECT MAX(rs2.polled_at) FROM registration_snapshots rs2 WHERE rs2.phone_id = rs.phone_id)
       GROUP BY rs.ip_address
       HAVING COUNT(DISTINCT rs.phone_id) > 1
       ORDER BY phone_count DESC`
    )
    .all();
  res.json(rows);
});

export default router;
