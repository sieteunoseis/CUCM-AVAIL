import { Router } from "express";
import { getAllCmGroups } from "../db/queries.js";
import { getDb } from "../db/database.js";

const router = Router();

router.get("/", (_req, res) => {
  const cmGroups = getAllCmGroups() as any[];

  // Build server sets per CMG
  const cmgServerSets = cmGroups.map((cmg) => ({
    cmg,
    servers: cmg.members.map((m: any) => m.server_name.split(".")[0]).sort(),
    serverKey: cmg.members.map((m: any) => m.server_name.split(".")[0]).sort().join(","),
  }));

  // Group by identical server set
  const channelMap = new Map<string, { servers: string[]; cmgs: any[] }>();
  for (const entry of cmgServerSets) {
    if (!channelMap.has(entry.serverKey)) {
      channelMap.set(entry.serverKey, { servers: entry.servers, cmgs: [] });
    }
    channelMap.get(entry.serverKey)!.cmgs.push(entry.cmg);
  }

  // Get phone counts per CMG
  const db = getDb();
  const phoneCounts = new Map<number, number>();
  const rows = db
    .prepare(
      `SELECT dp.cm_group_id, COUNT(p.id) as count
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       GROUP BY dp.cm_group_id`
    )
    .all() as { cm_group_id: number; count: number }[];
  for (const r of rows) {
    phoneCounts.set(r.cm_group_id, r.count);
  }

  // Sort channels by total phone count (descending) and assign labels
  const channels = Array.from(channelMap.values())
    .map((ch) => {
      const phoneCount = ch.cmgs.reduce(
        (sum: number, cmg: any) => sum + (phoneCounts.get(cmg.id) || 0),
        0
      );
      return { ...ch, phoneCount };
    })
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const result = channels.map((ch, i) => ({
    label: `AG-${i + 1}`,
    servers: ch.servers,
    cmgNames: ch.cmgs.map((c: any) => c.name),
    phoneCount: ch.phoneCount,
  }));

  res.json(result);
});

export default router;
