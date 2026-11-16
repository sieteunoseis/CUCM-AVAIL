// Run: npx tsx scripts/check-cer-replace.ts   (uses a throwaway DB)
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cer-replace-"));
process.env.DB_PATH = join(dir, "t.db");
process.env.DEMO_MODE = "false";

const { getDb, closeDb } = await import("../server/db/database.ts");
const q = await import("../server/db/queries.ts");
getDb();

q.createSubnet("10.2.0.0/24", "ours", "");
const id = (q.getAllSubnets() as any[])[0].id;
q.replaceCerSubnets(
  [{ cidr: "10.2.0.0/25", subnetId: "10.2.0.0", mask: "255.255.255.128", erlName: "W", location: "LW" }],
  0,
);

// A target that cannot be inserted must roll the whole replace back: our subnet stays.
assert.throws(() => q.replaceSubnetWithCer(id, ["10.2.0.0/25", "not-in-cer/99"]));
assert.deepEqual((q.getAllSubnets() as any[]).map((s) => s.cidr), ["10.2.0.0/24"]);

// A good replace removes ours and adds CER's.
const r = q.replaceSubnetWithCer(id, ["10.2.0.0/25"]);
assert.deepEqual(r, { created: 1, skipped: 0 });
assert.deepEqual((q.getAllSubnets() as any[]).map((s) => [s.cidr, s.name, s.description]), [["10.2.0.0/25", "W", "LW"]]);

closeDb();
rmSync(dir, { recursive: true, force: true });
console.log("cer replace checks passed");
