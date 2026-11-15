// Run: npx tsx scripts/check-node-filter.ts
import assert from "node:assert/strict";
import {
  failoverDirection,
  filterFailoverForNode,
  filterCmGroupsForNode,
} from "../client/src/lib/nodeFilter.ts";

const row = { registered_server: "b", primary_server: "a" };
assert.equal(failoverDirection(row, "a"), "moved_off");
assert.equal(failoverDirection(row, "b"), "landed_on");
assert.equal(failoverDirection(row, "c"), null);
assert.equal(failoverDirection({ registered_server: "a", primary_server: "a" }, "a"), "landed_on");

const rows = [
  { registered_server: "b", primary_server: "a" },
  { registered_server: "d", primary_server: "c" },
  { registered_server: "e", primary_server: "b" },
];
assert.equal(filterFailoverForNode(rows, "b").length, 2);

const groups = [
  { name: "with", members: [{ server_name: "hq1.x.com" }, { server_name: "hq2.x.com" }] },
  { name: "without", members: [{ server_name: "dr1.x.com" }] },
  { name: "lookalike", members: [{ server_name: "hq1.y.com" }] },
];
assert.deepEqual(filterCmGroupsForNode(groups, "hq1.x.com").map((g) => g.name), ["with"]);

console.log("node-filter checks passed");
