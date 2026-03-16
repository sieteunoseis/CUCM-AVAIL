import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { GatewaySummary, GatewayRegistration } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function Gateways() {
  const [summary, setSummary] = useState<GatewaySummary[]>([]);
  const [registrations, setRegistrations] = useState<GatewayRegistration[]>([]);
  const [stats, setStats] = useState<{ server_name: string; status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [view, setView] = useState<"summary" | "detail">("summary");
  const { sort: gwSort, toggle: toggleGwSort, sorted: sortedGw } = useSort<"gw" | "desc" | "domain" | "pool" | "cmg" | "count" | "servers">();
  const { sort: detSort, toggle: toggleDetSort, sorted: sortedDet } = useSort<"gw" | "desc" | "server" | "pool" | "cmg" | "ip" | "status">();
  const { cmgToAg } = useAvailabilityGroups();

  useEffect(() => {
    Promise.all([
      api.getGatewaySummary().catch(() => []),
      api.getGatewayRegistrations().catch(() => []),
      api.getGatewayStats().catch(() => []),
    ]).then(([s, r, st]) => {
      setSummary(s);
      setRegistrations(r);
      setStats(st);
      setLoading(false);
    });
  }, []);

  // Stats
  const totalGateways = summary.length;
  const fullService = summary.filter((g) => g.registered_count >= 3).length;
  const partialService = summary.filter((g) => g.registered_count > 0 && g.registered_count < 3).length;
  const noService = summary.filter((g) => g.registered_count === 0).length;

  const serverStats = new Map<string, { registered: number; unregistered: number; unknown: number }>();
  for (const s of stats) {
    const key = s.server_name || "Unknown";
    const entry = serverStats.get(key) || { registered: 0, unregistered: 0, unknown: 0 };
    if (s.status === "Registered") entry.registered += s.count;
    else if (s.status === "UnRegistered") entry.unregistered += s.count;
    else entry.unknown += s.count;
    serverStats.set(key, entry);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading endpoint data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-noc-text-bright">
          MGCP Endpoint Monitor
        </h1>
        <p className="text-xs font-mono text-noc-text-dim mt-1">
          Real-time MGCP endpoint registration status — each endpoint registers to up to 3 subscribers
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-cyan">{totalGateways}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Total Endpoints
          </div>
        </div>
        <div className={`p-4 text-center ${fullService > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${fullService > 0 ? "text-noc-green" : "text-noc-text-dim"}`}>
            {fullService}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Full Service (3/3)</div>
        </div>
        <div className={`p-4 text-center ${partialService > 0 ? "bg-noc-amber/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${partialService > 0 ? "text-noc-amber" : "text-noc-text-dim"}`}>
            {partialService}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Partial Service</div>
        </div>
        <div className={`p-4 text-center ${noService > 0 ? "bg-noc-red/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${noService > 0 ? "text-noc-red" : "text-noc-text-dim"}`}>
            {noService}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">No Service</div>
        </div>
      </div>
      {totalGateways > 0 && (
        <div className="h-2 bg-noc-bg overflow-hidden flex -mt-2">
          {fullService > 0 && (
            <div className="h-full bg-noc-green" style={{ width: `${(fullService / totalGateways) * 100}%` }} />
          )}
          {partialService > 0 && (
            <div className="h-full bg-noc-amber" style={{ width: `${(partialService / totalGateways) * 100}%` }} />
          )}
          {noService > 0 && (
            <div className="h-full bg-noc-red" style={{ width: `${(noService / totalGateways) * 100}%` }} />
          )}
        </div>
      )}

      {/* View toggle + Server selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setView(view === "summary" ? "detail" : "summary")}
          className="relative h-7 shrink-0 cursor-pointer bg-noc-bg border border-noc-border rounded"
          style={{ width: "11rem" }}
        >
          <div
            className="absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-200 ease-in-out bg-noc-cyan"
            style={{
              left: view === "summary" ? "2px" : "calc(50% + 1px)",
              width: "calc(50% - 3px)",
            }}
          />
          <div className="relative z-10 flex h-full">
            <div className={`w-1/2 flex items-center justify-center font-mono text-[9px] font-bold uppercase tracking-wider select-none transition-colors ${
              view === "summary" ? "text-noc-bg" : "text-noc-text-dim"
            }`}>endpoints</div>
            <div className={`w-1/2 flex items-center justify-center font-mono text-[9px] font-bold uppercase tracking-wider select-none transition-colors ${
              view === "detail" ? "text-noc-bg" : "text-noc-text-dim"
            }`}>registrations</div>
          </div>
        </button>

        {view === "detail" && serverStats.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveServer(null)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[10px] transition-all cursor-pointer ${
                activeServer === null
                  ? "border-noc-cyan/40 bg-noc-cyan/8 text-noc-cyan"
                  : "border-noc-border/50 bg-noc-bg text-noc-text-dim hover:border-noc-border-bright hover:text-noc-text"
              }`}
            >
              All
            </button>
            {Array.from(serverStats.entries()).map(([server, counts]) => {
              const isActive = activeServer === server;
              const allGood = counts.unregistered === 0 && counts.unknown === 0;
              const statusColor = allGood ? "bg-noc-green" : counts.unknown > 0 ? "bg-noc-red" : "bg-noc-amber";
              return (
                <button
                  key={server}
                  onClick={() => setActiveServer(isActive ? null : server)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[10px] transition-all cursor-pointer ${
                    isActive
                      ? "border-noc-cyan/40 bg-noc-cyan/8 text-noc-cyan"
                      : "border-noc-border/50 bg-noc-bg text-noc-text-dim hover:border-noc-border-bright hover:text-noc-text"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 shrink-0 ${statusColor}`} />
                  {server.split(".")[0]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary View — one row per gateway */}
      {view === "summary" && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
          <div className="tmux-title text-noc-cyan">
            MGCP Endpoints ({summary.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                  <ColHeader label="Endpoint" sortKey="gw" sort={gwSort} onSort={toggleGwSort} className="w-[18%]" />
                  <ColHeader label="Description" sortKey="desc" sort={gwSort} onSort={toggleGwSort} className="w-[15%]" />
                  <ColHeader label="Domain" sortKey="domain" sort={gwSort} onSort={toggleGwSort} className="w-[15%]" />
                  <ColHeader label="Device Pool" sortKey="pool" sort={gwSort} onSort={toggleGwSort} className="w-[13%]" />
                  <ColHeader label="CMG" sortKey="cmg" sort={gwSort} onSort={toggleGwSort} className="w-[12%]" />
                  <ColHeader label="Reg" sortKey="count" sort={gwSort} onSort={toggleGwSort} className="w-[6%]" />
                  <ColHeader label="Registered Servers" sortKey="servers" sort={gwSort} onSort={toggleGwSort} className="w-[21%]" />
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-noc-text-dim">
                      No MGCP endpoints found. Run a sync to discover endpoints.
                    </td>
                  </tr>
                ) : (
                  sortedGw(summary, (r, k) => {
                    switch (k) {
                      case "gw": return r.gateway_name;
                      case "desc": return r.description || "";
                      case "domain": return r.domain_name || "";
                      case "pool": return r.device_pool_name || "";
                      case "cmg": return r.cm_group_name || "";
                      case "count": return r.registered_count;
                      case "servers": return r.registered_servers || "";
                    }
                  }).map((g) => {
                    const statusColor = g.registered_count >= 3
                      ? "text-noc-green"
                      : g.registered_count > 0
                        ? "text-noc-amber"
                        : "text-noc-red";
                    const statusBg = g.registered_count >= 3
                      ? "bg-noc-green/10"
                      : g.registered_count > 0
                        ? "bg-noc-amber/10"
                        : "bg-noc-red/10";
                    return (
                      <tr key={g.id} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                        <td className="px-4 py-2.5 text-noc-text-bright truncate">{g.gateway_name}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{g.description || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{g.domain_name || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{g.device_pool_name || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {g.cm_group_name || "—"}
                            {g.cm_group_name && cmgToAg.get(g.cm_group_name) && (
                              <AgBadge label={cmgToAg.get(g.cm_group_name)!} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold ${statusBg} ${statusColor}`}>
                            {g.registered_count}/3
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-noc-text truncate">
                          {g.registered_servers
                            ? g.registered_servers.split(", ").map((s) => s.split(".")[0]).join(", ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail View — one row per gateway-server registration */}
      {view === "detail" && (() => {
        const filtered = activeServer
          ? registrations.filter((r) => r.server_name === activeServer)
          : registrations;
        return (
          <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
            <div className="tmux-title text-noc-cyan">
              Registrations ({filtered.length}{activeServer ? ` on ${activeServer.split(".")[0]}` : ""})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                    <ColHeader label="Endpoint" sortKey="gw" sort={detSort} onSort={toggleDetSort} className="w-[18%]" />
                    <ColHeader label="Description" sortKey="desc" sort={detSort} onSort={toggleDetSort} className="w-[15%]" />
                    <ColHeader label="Server" sortKey="server" sort={detSort} onSort={toggleDetSort} />
                    <ColHeader label="Device Pool" sortKey="pool" sort={detSort} onSort={toggleDetSort} />
                    <ColHeader label="CMG" sortKey="cmg" sort={detSort} onSort={toggleDetSort} />
                    <ColHeader label="IP Address" sortKey="ip" sort={detSort} onSort={toggleDetSort} />
                    <ColHeader label="Status" sortKey="status" sort={detSort} onSort={toggleDetSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-noc-text-dim">
                        {activeServer ? "No endpoints registered on this server." : "No registration data yet."}
                      </td>
                    </tr>
                  ) : (
                    sortedDet(filtered, (r, k) => {
                      switch (k) {
                        case "gw": return r.gateway_name;
                        case "desc": return r.description || "";
                        case "server": return r.server_name || "";
                        case "pool": return r.device_pool_name || "";
                        case "cmg": return r.cm_group_name || "";
                        case "ip": return r.ip_address || "";
                        case "status": return r.status;
                      }
                    }).map((r, i) => (
                      <tr key={i} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                        <td className="px-4 py-2.5 text-noc-text-bright truncate">{r.gateway_name}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{r.description || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{r.server_name || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{r.device_pool_name || "—"}</td>
                        <td className="px-4 py-2.5 text-noc-text truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {r.cm_group_name || "—"}
                            {r.cm_group_name && cmgToAg.get(r.cm_group_name) && (
                              <AgBadge label={cmgToAg.get(r.cm_group_name)!} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-noc-text truncate">{r.ip_address || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold ${
                              r.status === "Registered"
                                ? "bg-noc-green/10 text-noc-green"
                                : r.status === "UnRegistered"
                                  ? "bg-noc-amber/10 text-noc-amber"
                                  : "bg-noc-red/10 text-noc-red"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 ${
                                r.status === "Registered"
                                  ? "bg-noc-green"
                                  : r.status === "UnRegistered"
                                    ? "bg-noc-amber"
                                    : "bg-noc-red"
                              }`}
                            />
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
