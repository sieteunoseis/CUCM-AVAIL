import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Trunk, TrunkRegistration } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function Trunks() {
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [registrations, setRegistrations] = useState<TrunkRegistration[]>([]);
  const [stats, setStats] = useState<{ server_name: string; status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeServer, setActiveServer] = useState<string | null>(null); // null = all servers
  const { sort: trunkSort, toggle: toggleTrunkSort, sorted: sortedTrunks } = useSort<"trunk" | "desc" | "server" | "pool" | "cmg" | "ip" | "status">();
  const { cmgToAg } = useAvailabilityGroups();

  useEffect(() => {
    Promise.all([
      api.getTrunks().catch(() => ({ trunks: [], total: 0 })),
      api.getTrunkRegistrations().catch(() => []),
      api.getTrunkStats().catch(() => []),
    ]).then(([t, r, s]) => {
      setTrunks(t.trunks);
      setRegistrations(r);
      setStats(s);
      setLoading(false);
    });
  }, []);

  const registeredCount = registrations.filter((r) => r.status === "Registered").length;
  const unregisteredCount = registrations.filter((r) => r.status === "UnRegistered").length;
  const unknownCount = registrations.filter((r) => r.status !== "Registered" && r.status !== "UnRegistered").length;

  const serverStats = new Map<string, { registered: number; unregistered: number; unknown: number }>();
  for (const s of stats) {
    const key = s.server_name || "Unknown";
    const entry = serverStats.get(key) || { registered: 0, unregistered: 0, unknown: 0 };
    if (s.status === "Registered") {
      entry.registered += s.count;
    } else if (s.status === "UnRegistered") {
      entry.unregistered += s.count;
    } else {
      entry.unknown += s.count;
    }
    serverStats.set(key, entry);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading trunk data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-noc-text-bright">
          SIP Trunk Monitor
        </h1>
        <p className="text-xs font-mono text-noc-text-dim mt-1">
          Real-time SIP trunk registration status from RISPort
        </p>
      </div>

      {/* Stats Row — updates based on selected server */}
      {(() => {
        const activeCounts = activeServer
          ? (serverStats.get(activeServer) || { registered: 0, unregistered: 0, unknown: 0 })
          : { registered: registeredCount, unregistered: unregisteredCount, unknown: unknownCount };
        const activeTotal = activeCounts.registered + activeCounts.unregistered + activeCounts.unknown;
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
              <div className="bg-noc-surface p-4 text-center">
                <div className="font-mono text-3xl font-bold text-noc-cyan">{activeTotal}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
                  {activeServer ? "Trunks on Server" : "Total Trunks"}
                </div>
              </div>
              <div className={`p-4 text-center ${activeCounts.registered > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
                <div className={`font-mono text-3xl font-bold ${activeCounts.registered > 0 ? "text-noc-green" : "text-noc-text-dim"}`}>
                  {activeCounts.registered}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Full Service</div>
              </div>
              <div className={`p-4 text-center ${activeCounts.unregistered > 0 ? "bg-noc-amber/5" : "bg-noc-surface"}`}>
                <div className={`font-mono text-3xl font-bold ${activeCounts.unregistered > 0 ? "text-noc-amber" : "text-noc-text-dim"}`}>
                  {activeCounts.unregistered}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Partial Service</div>
              </div>
              <div className={`p-4 text-center ${activeCounts.unknown > 0 ? "bg-noc-red/5" : "bg-noc-surface"}`}>
                <div className={`font-mono text-3xl font-bold ${activeCounts.unknown > 0 ? "text-noc-red" : "text-noc-text-dim"}`}>
                  {activeCounts.unknown}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">No Service</div>
              </div>
            </div>
            {activeTotal > 0 && (
              <div className="h-2 bg-noc-bg overflow-hidden flex -mt-2">
                {activeCounts.registered > 0 && (
                  <div className="h-full bg-noc-green" style={{ width: `${(activeCounts.registered / activeTotal) * 100}%` }} />
                )}
                {activeCounts.unregistered > 0 && (
                  <div className="h-full bg-noc-amber" style={{ width: `${(activeCounts.unregistered / activeTotal) * 100}%` }} />
                )}
                {activeCounts.unknown > 0 && (
                  <div className="h-full bg-noc-red" style={{ width: `${(activeCounts.unknown / activeTotal) * 100}%` }} />
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Server selector */}
      {serverStats.size > 0 && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-cyan">
            Servers ({serverStats.size})
          </div>
          <div className="p-3 flex flex-wrap gap-1.5">
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
        </div>
      )}

      {/* Trunk Registration Table */}
      {(() => {
        const filteredRegs = activeServer
          ? registrations.filter((r) => r.server_name === activeServer)
          : registrations;
        return (
        <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
          <div className="tmux-title text-noc-cyan">
            Trunk Registrations ({filteredRegs.length}{activeServer ? ` on ${activeServer.split(".")[0]}` : ""})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                  <ColHeader label="Trunk" sortKey="trunk" sort={trunkSort} onSort={toggleTrunkSort} className="w-[20%]" />
                  <ColHeader label="Description" sortKey="desc" sort={trunkSort} onSort={toggleTrunkSort} className="w-[20%]" />
                  <ColHeader label="Server" sortKey="server" sort={trunkSort} onSort={toggleTrunkSort} />
                  <ColHeader label="Device Pool" sortKey="pool" sort={trunkSort} onSort={toggleTrunkSort} />
                  <ColHeader label="CMG" sortKey="cmg" sort={trunkSort} onSort={toggleTrunkSort} />
                  <ColHeader label="IP Address" sortKey="ip" sort={trunkSort} onSort={toggleTrunkSort} />
                  <ColHeader label="Status" sortKey="status" sort={trunkSort} onSort={toggleTrunkSort} />
                </tr>
              </thead>
              <tbody>
                {filteredRegs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-noc-text-dim">
                      {activeServer ? "No trunks registered on this server." : "No trunk registration data yet. Run a sync and wait for the next poll cycle."}
                    </td>
                  </tr>
                ) : (
                  sortedTrunks(filteredRegs, (r, k) => {
                    switch (k) {
                      case "trunk": return r.trunk_name;
                      case "desc": return r.description || "";
                      case "server": return r.server_name || "";
                      case "pool": return r.device_pool_name || "";
                      case "cmg": return r.cm_group_name || "";
                      case "ip": return r.ip_address || "";
                      case "status": return r.status;
                    }
                  }).map((r, i) => (
                    <tr key={i} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                      <td className="px-4 py-2.5 text-noc-text-bright truncate">{r.trunk_name}</td>
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
                          {r.status === "Registered"
                            ? "Full Service"
                            : r.status === "UnRegistered"
                              ? "Partial Service"
                              : "No Service"}
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

      {/* All Trunks Config Table */}
      {trunks.length > 0 && registrations.length === 0 && (
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-3">
            Configured Trunks ({trunks.length})
          </h2>
          <div className="border border-noc-border bg-noc-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-noc-border bg-noc-panel/50">
                    <th className="text-left px-4 py-2.5 text-noc-text-dim uppercase tracking-widest">Name</th>
                    <th className="text-left px-4 py-2.5 text-noc-text-dim uppercase tracking-widest">Description</th>
                    <th className="text-left px-4 py-2.5 text-noc-text-dim uppercase tracking-widest">Device Pool</th>
                    <th className="text-left px-4 py-2.5 text-noc-text-dim uppercase tracking-widest">CMG</th>
                  </tr>
                </thead>
                <tbody>
                  {trunks.map((t) => (
                    <tr key={t.id} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                      <td className="px-4 py-2.5 text-noc-text-bright">{t.name}</td>
                      <td className="px-4 py-2.5 text-noc-text">{t.description || "—"}</td>
                      <td className="px-4 py-2.5 text-noc-text">{t.device_pool_name || "—"}</td>
                      <td className="px-4 py-2.5 text-noc-text">{t.cm_group_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

