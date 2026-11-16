// Run: npx tsx scripts/check-ag-compare.ts
import assert from "node:assert/strict";
import { sharedServers, classifyPools } from "../client/src/lib/agCompare.ts";

const g = (id: number, name: string, servers: string[]) => ({
  id,
  name,
  members: servers.map((s) => ({ server_name: s })),
});

assert.deepEqual(sharedServers(g(1, "A", ["a.x.com", "b.x.com"]), g(2, "B", ["b.y.com", "c.x.com"])), ["b"]);
assert.deepEqual(sharedServers(g(1, "A", ["a.x.com"]), g(2, "B", ["c.x.com"])), []);
assert.deepEqual(sharedServers(g(1, "A", ["b.x.com", "a.x.com"]), g(2, "B", ["a.x.com", "b.x.com"])), ["a", "b"]);
assert.deepEqual(sharedServers(g(1, "Default", ["pub.x.com"]), g(2, "B", ["pub.x.com", "c.x.com"])), ["pub"]);

const cmgs = [
  g(1, "A", ["s1.x", "s2.x"]),
  g(2, "B", ["s3.x"]),
  g(3, "C", ["s2.x", "s4.x"]),
  g(4, "D", ["s5.x"]),
];
const pools = [
  { id: 10, name: "pA", cm_group_name: "A", phone_count: 5 },
  { id: 11, name: "pB", cm_group_name: "B", phone_count: 50 },
  { id: 12, name: "pC", cm_group_name: "C", phone_count: 7 },
  { id: 13, name: "pD", cm_group_name: "D", phone_count: 9 },
  { id: 14, name: "pNone", cm_group_name: null as unknown as string, phone_count: 1 },
  { id: 15, name: "pA0", cm_group_name: "A", phone_count: 0 },
];
const r = classifyPools(pools, cmgs, ["A", "B"]);
assert.deepEqual(r.onSelected.map((p) => p.name), ["pB", "pA", "pA0"]);
assert.deepEqual(r.alsoImpacted.map((p) => [p.name, p.shared]), [["pC", ["s2"]]]);
assert.deepEqual(r.notImpacted.map((p) => p.name), ["pD", "pNone"]);
assert.equal(classifyPools(pools, cmgs, []).onSelected.length, 0);

console.log("ag-compare checks passed");
