// Run against a running server: npx tsx scripts/check-mcp.ts http://localhost:3911 [apiKey]
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [base, key] = process.argv.slice(2);
const url = new URL("/mcp", base);

async function connect(withKey?: string) {
  const client = new Client({ name: "check-mcp", version: "0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: withKey ? { headers: { Authorization: `Bearer ${withKey}` } } : undefined,
  });
  await client.connect(transport);
  return client;
}

const READ = [
  "cucm_availability_groups", "cucm_cm_groups", "cucm_device_pools", "cucm_phone_status", "cucm_registration_summary",
  "cucm_servers", "cucm_simulate_outage", "cucm_subnets", "cucm_trunks", "cucm_unmapped_phones", "cucm_upgrade_plan",
];
const ACTIONS = ["cucm_import_cer_subnets", "cucm_poll_risport", "cucm_replace_with_cer", "cucm_sync_axl", "cucm_sync_cer"];

if (key) {
  await assert.rejects(connect(), /401|Unauthorized/i);
  await assert.rejects(connect("wrong"), /401|Unauthorized/i);
}
const c = await connect(key);
const names = (await c.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(names, (key ? [...READ, ...ACTIONS] : READ).sort());

const text = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await c.callTool({ name, arguments: args });
  assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`);
  return JSON.parse(r.content[0].text);
};

const servers = await text("cucm_servers");
assert.ok(servers.length > 0);
const cmgs = await text("cucm_cm_groups");
assert.ok(cmgs[0].members[0].startsWith("P1 "));
const target = cmgs[0].members[0].slice(3);
const sim = await text("cucm_simulate_outage", { servers: [target, "nope-server"] });
assert.deepEqual(sim.unknownServers, ["nope-server"]);
assert.ok(sim.totals.phones > 0 && sim.totals.willReRegister + sim.totals.unregistered + sim.totals.alreadyFailedOver > 0);
assert.ok(sim.byCmGroup.length > 0 && !("movements" in sim.byCmGroup[0]));
const bad: any = await c.callTool({ name: "cucm_simulate_outage", arguments: { servers: ["nope"] } });
assert.equal(bad.isError, true);
const subs = await text("cucm_subnets", { limit: 3 });
assert.ok(subs.subnets.length <= 3 && subs.totals.phones > 0);
const pools = await text("cucm_device_pools");
assert.ok(pools.count > 0);
await text("cucm_unmapped_phones");
await text("cucm_upgrade_plan");
await text("cucm_registration_summary");
await text("cucm_availability_groups");
await text("cucm_trunks");
const r = await (await fetch(url)).status;
assert.equal(r, 405);

console.log(`mcp checks passed (${names.length} tools, ${key ? "with" : "without"} key) · outage of ${target}: ${JSON.stringify(sim.totals)}`);
await c.close();
