import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "../config.js";

/**
 * MCP endpoint (Streamable HTTP, stateless) at /mcp.
 *
 * Tools call this app's own REST API on localhost, so they always match the UI.
 * Read tools are always available. Action tools (polls, syncs, subnet changes) are
 * only registered when MCP_API_KEY is set, and then every /mcp call must send
 * "Authorization: Bearer <MCP_API_KEY>".
 */

type Json = any;

const base = () => `http://127.0.0.1:${config.server.port}`;

async function api(path: string, init?: { method?: string; body?: unknown }): Promise<Json> {
  const res = await fetch(`${base()}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: Json;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true });

const short = (n: string | null | undefined) => (n ? (/^\d+\.\d+\.\d+\.\d+$/.test(n) ? n : n.split(".")[0]) : n);

/** Resolve server names (short or FQDN, case-insensitive) to ids. */
async function serverIds(names: string[]): Promise<{ ids: number[]; matched: string[]; unknown: string[] }> {
  const servers: { id: number; name: string }[] = await api("/api/servers");
  const ids: number[] = [];
  const matched: string[] = [];
  const unknown: string[] = [];
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    const hit = servers.find((s) => s.name.toLowerCase() === n || short(s.name)!.toLowerCase() === n);
    if (hit) {
      ids.push(hit.id);
      matched.push(hit.name);
    } else unknown.push(raw);
  }
  return { ids, matched, unknown };
}

function summarizeSimulation(r: Json, topSubnets: number) {
  const subnets: Record<string, { name: string; cidr: string; reRegister: number; unregistered: number; failedOver: number }> = {};
  for (const d of r.details ?? []) {
    for (const s of d.subnetImpacts ?? []) {
      const key = s.cidr ?? s.subnetName ?? "unmapped";
      const e = (subnets[key] ??= { name: s.subnetName ?? key, cidr: s.cidr ?? "", reRegister: 0, unregistered: 0, failedOver: 0 });
      e.reRegister += s.willReRegister ?? 0;
      e.unregistered += s.unregistered ?? 0;
      e.failedOver += s.failedOver ?? 0;
    }
  }
  return {
    totals: {
      phones: r.totalPhones,
      noImpact: r.noImpact,
      willReRegister: r.willReRegister,
      unregistered: r.unregistered,
      alreadyFailedOver: r.failedOver,
    },
    byCmGroup: (r.details ?? [])
      .filter((d: Json) => d.willReRegister || d.unregistered || d.failedOver)
      .map((d: Json) => ({
        cmGroup: d.cmGroupName,
        phones: d.totalPhones,
        willReRegister: d.willReRegister,
        unregistered: d.unregistered,
        alreadyFailedOver: d.failedOver,
      })),
    topImpactedSubnets: Object.values(subnets)
      .sort((a, b) => b.unregistered + b.reRegister + b.failedOver - (a.unregistered + a.reRegister + a.failedOver))
      .slice(0, topSubnets),
    trunkImpact: r.trunkImpact,
    gatewayImpact: r.gatewayImpact,
    serviceImpacts: r.serviceImpacts,
  };
}

function createServer(allowActions: boolean): McpServer {
  const server = new McpServer({ name: "cucm-avail", version: process.env.npm_package_version || "1.9.0" });

  // ---------- Read tools ----------
  server.tool(
    "cucm_servers",
    "List CUCM servers: node type, whether they are in a CM group (call processing role), and whether the CallManager service is currently active.",
    {},
    async () => {
      try {
        const servers: Json[] = await api("/api/servers");
        return ok(
          servers.map((s) => ({
            name: s.name,
            short: short(s.name),
            hostname: s.hostname,
            nodeType: s.node_type,
            inCmGroup: s.in_cm_group === 1,
            callManagerActive: s.ccm_service_active === 1,
            lastChecked: s.last_checked_at,
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_cm_groups",
    "List Call Manager Groups with their member servers in priority order and their Availability Group (AG) label.",
    {},
    async () => {
      try {
        const [groups, ags]: [Json[], Json[]] = await Promise.all([api("/api/cmgroups"), api("/api/ag")]);
        const agOf = new Map<string, string>();
        for (const a of ags) for (const n of a.cmgNames) agOf.set(n, a.label);
        return ok(
          groups.map((g) => ({
            name: g.name,
            ag: agOf.get(g.name) ?? null,
            members: [...g.members].sort((a: Json, b: Json) => a.priority - b.priority).map((m: Json) => `P${m.priority} ${short(m.server_name)}`),
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_availability_groups",
    "List Availability Groups: CM groups that share the exact same server set, with phone counts. AGs that share no servers are independent (safe pairs).",
    {},
    async () => {
      try {
        return ok(await api("/api/ag"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_device_pools",
    "List device pools with their CM group and phone count. Optionally only pools on one CM group.",
    { cmGroup: z.string().optional().describe("Only pools on this CM group name") },
    async ({ cmGroup }) => {
      try {
        const pools: Json[] = await api("/api/devicepools");
        const rows = pools
          .filter((p) => !cmGroup || (p.cm_group_name || "").toLowerCase() === cmGroup.toLowerCase())
          .map((p) => ({ name: p.name, cmGroup: p.cm_group_name, phones: p.phone_count }))
          .sort((a, b) => b.phones - a.phones);
        return ok({ count: rows.length, phones: rows.reduce((s, r) => s + (r.phones || 0), 0), pools: rows });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_registration_summary",
    "Current phone registration counts per server, plus phones not on their CM group primary (failed over), and the last RISPort poll.",
    {},
    async () => {
      try {
        const [stats, failover, poll] = await Promise.all([
          api("/api/registrations/stats"),
          api("/api/registrations/failover"),
          api("/api/poll/status"),
        ]);
        return ok({ lastPoll: poll, perServer: stats, failedOver: failover });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_simulate_outage",
    "Simulate taking CUCM servers down (planned outage/upgrade): how many phones re-register, go unregistered, or are already failed over, by CM group and subnet, plus trunk/gateway/service impact.",
    {
      servers: z.array(z.string()).min(1).describe("Server names to take down, short (dcrsub05) or FQDN"),
      topSubnets: z.number().int().min(0).max(100).default(15).describe("How many impacted subnets to list"),
    },
    async ({ servers, topSubnets }) => {
      try {
        const { ids, matched, unknown } = await serverIds(servers);
        if (ids.length === 0) return fail(new Error(`No matching servers for: ${unknown.join(", ")}`));
        const r = await api("/api/simulate", { method: "POST", body: { disabledServerIds: ids } });
        return ok({ serversDown: matched, unknownServers: unknown, ...summarizeSimulation(r, topSubnets) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_phone_status",
    "Look up one phone by device name (e.g. SEP001122334455): registration, CM group, device pool, IP/subnet. Optionally where it would go if given servers went down.",
    {
      name: z.string().describe("Device name"),
      ifServersDown: z.array(z.string()).optional().describe("Optional server names to simulate as down for this phone"),
    },
    async ({ name, ifServersDown }) => {
      try {
        const status = await api(`/api/phones/${encodeURIComponent(name)}/status`);
        if (!ifServersDown?.length) return ok(status);
        const { ids, unknown } = await serverIds(ifServersDown);
        const impact = await api(`/api/phones/${encodeURIComponent(name)}/impact?servers=${ids.join(",")}`);
        return ok({ status, impact, unknownServers: unknown });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_upgrade_plan",
    "Recommended CUCM upgrade/reboot order (sequential steps with phone impact per step).",
    {},
    async () => {
      try {
        return ok(await api("/api/upgrade"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_subnets",
    "Defined phone subnets with phone counts and, when CER is synced, their CER (Emergency Responder) status: match, inside (inside a wider CER subnet), mismatch (CER splits it), missing (not in CER).",
    {
      cerStatus: z.enum(["any", "match", "inside", "mismatch", "missing"]).default("any"),
      search: z.string().optional().describe("Filter by text in CIDR, name or description"),
      minPhones: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(500).default(100),
    },
    async ({ cerStatus, search, minPhones, limit }) => {
      try {
        const o = await api("/api/subnets/overview");
        const q = search?.toLowerCase();
        const rows = (o.subnets as Json[])
          .filter((s) => cerStatus === "any" || s.cerStatus === cerStatus)
          .filter((s) => s.phones >= minPhones)
          .filter((s) => !q || `${s.cidr} ${s.name} ${s.description}`.toLowerCase().includes(q))
          .sort((a, b) => b.phones - a.phones);
        return ok({
          cer: o.cer && { lastSync: o.cer.lastSuccess, subnets: o.cer.subnetCount, lastError: o.cer.lastError || undefined },
          totals: o.totals,
          matching: rows.length,
          subnets: rows.slice(0, limit).map((s) => ({
            cidr: s.cidr,
            name: s.name,
            description: s.description || undefined,
            phones: s.phones,
            cerStatus: s.cerStatus,
            cer: s.cer?.map((c: Json) => `${c.cidr} (${c.erlName}${c.broad ? ", broad" : ""})`),
            useCerTargets: s.replaceWith?.length ? s.replaceWith : undefined,
          })),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_unmapped_phones",
    "Phones whose IP falls in no defined subnet, grouped by the CER subnet that contains them (importable) or a guessed /24 when CER doesn't cover them (911 location gaps).",
    {},
    async () => {
      try {
        const o = await api("/api/subnets/overview");
        return ok({ totals: o.totals, inCer: o.unmapped.inCer, notInCer: o.unmapped.notInCer });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_trunks",
    "SIP trunks with their registration state per server.",
    {},
    async () => {
      try {
        return ok(await api("/api/trunks"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  if (!allowActions) return server;

  // ---------- Action tools (only with MCP_API_KEY) ----------
  server.tool("cucm_poll_risport", "Start a RISPort registration poll now (runs in the background).", {}, async () => {
    try {
      return ok(await api("/api/poll/trigger", { method: "POST" }));
    } catch (e) {
      return fail(e);
    }
  });

  server.tool("cucm_sync_axl", "Run a full AXL sync from CUCM (servers, CM groups, device pools, phones, trunks).", {}, async () => {
    try {
      return ok(await api("/api/sync", { method: "POST" }));
    } catch (e) {
      return fail(e);
    }
  });

  server.tool("cucm_sync_cer", "Sync IP subnets from Cisco Emergency Responder (about 30 seconds).", {}, async () => {
    try {
      return ok(await api("/api/cer/sync", { method: "POST" }));
    } catch (e) {
      return fail(e);
    }
  });

  server.tool(
    "cucm_import_cer_subnets",
    "Add CER subnets to the app's subnet list (name = ERL, description = CER location). Existing CIDRs are skipped.",
    { cidrs: z.array(z.string()).min(1).describe("CER subnet CIDRs, e.g. 10.20.8.0/24") },
    async ({ cidrs }) => {
      try {
        return ok(await api("/api/subnets/import-cer", { method: "POST", body: { cidrs } }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.tool(
    "cucm_replace_with_cer",
    "Use CER for app subnets (same as the UI's Use CER): replace each with its overlapping CER subnets, or roll it up into a wider CER subnet already defined. Atomic per subnet.",
    { cidrs: z.array(z.string()).min(1).describe("App subnet CIDRs to replace") },
    async ({ cidrs }) => {
      try {
        const subnets: Json[] = await api("/api/subnets");
        const ids: number[] = [];
        const unknown: string[] = [];
        for (const c of cidrs) {
          const hit = subnets.find((s) => s.cidr === c.trim());
          if (hit) ids.push(hit.id);
          else unknown.push(c);
        }
        const r = ids.length ? await api("/api/subnets/replace-cer", { method: "POST", body: { subnetIds: ids } }) : null;
        return ok({ result: r, unknownCidrs: unknown });
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

export function mountMcp(app: Express) {
  const key = process.env.MCP_API_KEY || "";

  app.post("/mcp", async (req: Request, res: Response) => {
    if (key && req.headers.authorization !== `Bearer ${key}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const server = createServer(!!key);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[MCP] request error:", (err as Error).message);
      if (!res.headersSent) res.status(500).json({ error: "MCP server error" });
    }
  });

  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ error: "Method Not Allowed" });
  };
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  console.log(`[MCP] /mcp enabled (${key ? "API key required, action tools on" : "no key: read-only tools"})`);
}
