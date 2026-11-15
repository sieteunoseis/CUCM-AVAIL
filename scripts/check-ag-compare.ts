// Run: npx tsx scripts/check-ag-compare.ts
import assert from "node:assert/strict";
import { sharedServers } from "../client/src/lib/agCompare.ts";

const g = (id: number, name: string, servers: string[]) => ({
  id,
  name,
  members: servers.map((s) => ({ server_name: s })),
});

assert.deepEqual(sharedServers(g(1, "A", ["a.x.com", "b.x.com"]), g(2, "B", ["b.y.com", "c.x.com"])), ["b"]);
assert.deepEqual(sharedServers(g(1, "A", ["a.x.com"]), g(2, "B", ["c.x.com"])), []);
assert.deepEqual(sharedServers(g(1, "A", ["b.x.com", "a.x.com"]), g(2, "B", ["a.x.com", "b.x.com"])), ["a", "b"]);
assert.deepEqual(sharedServers(g(1, "Default", ["pub.x.com"]), g(2, "B", ["pub.x.com", "c.x.com"])), ["pub"]);

console.log("ag-compare checks passed");
