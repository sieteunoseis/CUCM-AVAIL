import { Router } from "express";
import {
  getAllSubnets,
  createSubnet,
  updateSubnet,
  deleteSubnet,
  getPhonesWithIps,
} from "../db/queries.js";
import { getDb } from "../db/database.js";
import { ipToLong, parseSubnets, matchSubnetFast, matchSubnet, type SubnetRow } from "../utils/subnet.js";
import { getCached, setCache, invalidateCache } from "../services/cache.service.js";

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
    invalidateCache("subnet:");
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
  invalidateCache("subnet:");
  res.json({ ok: true });
});

// DELETE subnet
router.delete("/:id", (req, res) => {
  deleteSubnet(parseInt(req.params.id, 10));
  invalidateCache("subnet:");
  res.json({ ok: true });
});

// GET subnet distribution — phones per subnet per CMG
router.get("/distribution", (_req, res) => {
  const cached = getCached("subnet:distribution");
  if (cached) {
    res.json(cached);
    return;
  }

  const subnets = getAllSubnets() as SubnetRow[];
  const parsed = parseSubnets(subnets);
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
    if (!ip) { unmapped++; unmappedCmGroups[cmg] = (unmappedCmGroups[cmg] || 0) + 1; continue; }
    const matched = matchSubnetFast(ipToLong(ip), parsed);

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

  const result = {
    subnets: Object.values(distribution),
    unmapped,
    unmappedCmGroups,
    totalPhones: phones.length,
  };
  setCache("subnet:distribution", result);
  res.json(result);
});

// GET discover subnets — scan phone IPs and find missing /24 subnets
router.get("/discover", (_req, res) => {
  const subnets = getAllSubnets() as SubnetRow[];
  const parsed = parseSubnets(subnets);
  const phones = getPhonesWithIps() as any[];

  const missingSubnets = new Map<string, { count: number; ips: Set<string> }>();
  let totalUnmapped = 0;

  for (const phone of phones) {
    const ip = phone.ip_address;
    if (!ip) continue;
    const matched = matchSubnetFast(ipToLong(ip), parsed);
    if (!matched) {
      totalUnmapped++;
      // Assume /24
      const parts = ip.split(".");
      if (parts.length === 4) {
        const cidr = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        if (!missingSubnets.has(cidr)) {
          missingSubnets.set(cidr, { count: 0, ips: new Set() });
        }
        const entry = missingSubnets.get(cidr)!;
        entry.count++;
        entry.ips.add(ip);
      }
    }
  }

  const discovered = Array.from(missingSubnets.entries())
    .map(([cidr, data]) => ({
      cidr,
      count: data.count,
      suggestedName: `Subnet ${cidr}`,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({ discovered, totalUnmapped });
});

// POST bulk create subnets from discover
router.post("/discover", (req, res) => {
  const { subnets: toCreate } = req.body as { subnets: { cidr: string; name: string }[] };
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const s of toCreate) {
    try {
      createSubnet(s.cidr, s.name, "Auto-discovered from phone IPs");
      created++;
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        skipped++;
      } else {
        errors.push(`${s.cidr}: ${e.message}`);
      }
    }
  }

  res.json({ created, skipped, errors });
});

// POST parse subnet masks from pasted text
router.post("/parse-masks", (req, res) => {
  const { text } = req.body as { text: string };
  const existingSubnets = getAllSubnets() as SubnetRow[];
  const existingCidrs = new Set(existingSubnets.map((s) => s.cidr));

  const lines = text.trim().split("\n");
  const discovered = new Map<string, number>();
  let totalParsed = 0;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const ip = parts[0];
    const mask = parts[1];
    if (!ip.match(/^\d+\.\d+\.\d+\.\d+$/) || !mask.match(/^\d+\.\d+\.\d+\.\d+$/)) continue;
    totalParsed++;

    // Convert mask to prefix length
    const maskParts = mask.split(".").map(Number);
    let bits = 0;
    for (const octet of maskParts) {
      bits += (octet >>> 0).toString(2).split("1").length - 1;
    }

    // Compute network address
    const ipParts = ip.split(".").map(Number);
    const network = ipParts.map((p, i) => p & maskParts[i]).join(".");
    const cidr = `${network}/${bits}`;

    if (!existingCidrs.has(cidr)) {
      discovered.set(cidr, (discovered.get(cidr) || 0) + 1);
    }
  }

  const result = Array.from(discovered.entries())
    .map(([cidr, count]) => ({
      cidr,
      count,
      suggestedName: `Subnet ${cidr}`,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({ discovered: result, totalParsed });
});

// GET scrape preview — count phones eligible for scraping
router.get("/scrape/preview", (req, res) => {
  const all = req.query.all === "true";
  const db = getDb();

  // Get registered phones with scrapeable models
  const nonScrapeableModels = ["Cisco Unified Client Services Framework", "Cisco Dual Mode for Android", "Cisco Dual Mode for iPhone",
    "Cisco Jabber for Tablet", "Third-party SIP Device (Advanced)", "Third-party SIP Device (Basic)",
    "Cisco Webex", "Cisco Webex Teams"];
  const placeholders = nonScrapeableModels.map(() => "?").join(",");

  const query = `SELECT p.model, COUNT(*) as count
           FROM phones p
           JOIN latest_registrations lr ON lr.phone_id = p.id
             AND lr.status IN ('Registered', 'registered')
           WHERE p.model NOT IN (${placeholders})
             AND lr.ip_address <> ''
           GROUP BY p.model ORDER BY count DESC`;

  const rows = db.prepare(query).all(...nonScrapeableModels) as { model: string; count: number }[];
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byModel[r.model] = r.count;
    total += r.count;
  }

  res.json({ total, byModel });
});

// POST scrape phones — placeholder (actual scraping needs phone web access)
router.post("/scrape", (_req, res) => {
  res.json({ ok: true, message: "Phone scraping not available in this deployment" });
});

// GET scrape progress
router.get("/scrape/progress", (_req, res) => {
  res.json({ total: 0, completed: 0, found: 0, errors: 0, status: "idle" });
});

// GET shared IPs (multiple phones on same IP — likely Expressway/MRA)
router.get("/shared-ips", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT lr.ip_address, COUNT(DISTINCT lr.phone_id) as phone_count,
              GROUP_CONCAT(DISTINCT p.name) as phone_names
       FROM latest_registrations lr
       JOIN phones p ON lr.phone_id = p.id
       WHERE lr.ip_address <> ''
       GROUP BY lr.ip_address
       HAVING COUNT(DISTINCT lr.phone_id) > 1
       ORDER BY phone_count DESC`
    )
    .all();
  res.json(rows);
});

export default router;
