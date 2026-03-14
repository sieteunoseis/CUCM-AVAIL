import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Trunk, TrunkRegistration } from "../api/client";

export default function Trunks() {
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [registrations, setRegistrations] = useState<TrunkRegistration[]>([]);
  const [stats, setStats] = useState<{ server_name: string; status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Group stats by server
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
    <div className="space-y-10 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-noc-text-bright">
          SIP Trunk Monitor
        </h1>
        <p className="text-xs font-mono text-noc-text-dim mt-1">
          Real-time SIP trunk registration status from RISPort
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <StatBox label="Total Trunks" value={trunks.length} color="amber" />
        <StatBox label="Full Service" value={registeredCount} color="green" />
        <StatBox label="Partial Service" value={unregisteredCount} color="yellow" />
        <StatBox label="No Service" value={unknownCount} color="red" />
        <StatBox label="Servers" value={serverStats.size} color="cyan" />
      </div>

      {/* Per-Server Breakdown */}
      {serverStats.size > 0 && (
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-4">
            Registration by Server
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from(serverStats.entries()).map(([server, counts]) => (
              <div
                key={server}
                className="rounded-lg border border-noc-border bg-noc-surface p-5"
              >
                <div className="font-mono text-xs font-semibold text-noc-text-bright mb-3 truncate">
                  {server}
                </div>
                <div className="flex gap-6">
                  <div>
                    <span className="font-mono text-2xl font-bold text-noc-green">
                      {counts.registered}
                    </span>
                    <span className="text-[10px] font-mono text-noc-text-dim ml-2 uppercase">
                      Full
                    </span>
                  </div>
                  {counts.unregistered > 0 && (
                    <div>
                      <span className="font-mono text-2xl font-bold text-noc-amber">
                        {counts.unregistered}
                      </span>
                      <span className="text-[10px] font-mono text-noc-text-dim ml-2 uppercase">
                        Partial
                      </span>
                    </div>
                  )}
                  {counts.unknown > 0 && (
                    <div>
                      <span className="font-mono text-2xl font-bold text-noc-red">
                        {counts.unknown}
                      </span>
                      <span className="text-[10px] font-mono text-noc-text-dim ml-2 uppercase">
                        No Svc
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trunk Registration Table */}
      <div>
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-4">
          Trunk Registrations ({registrations.length})
        </h2>
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50">
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Trunk</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Description</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Server</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Device Pool</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">CMG</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">IP Address</th>
                  <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody>
                {registrations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-noc-text-dim">
                      No trunk registration data yet. Run a sync and wait for the next poll cycle.
                    </td>
                  </tr>
                ) : (
                  registrations.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors"
                    >
                      <td className="px-5 py-3 text-noc-text-bright">{r.trunk_name}</td>
                      <td className="px-5 py-3 text-noc-text">{r.description || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{r.server_name || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{r.device_pool_name || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{r.cm_group_name || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{r.ip_address || "—"}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-semibold ${
                            r.status === "Registered"
                              ? "bg-noc-green/10 text-noc-green"
                              : r.status === "UnRegistered"
                                ? "bg-noc-amber/10 text-noc-amber"
                                : "bg-noc-red/10 text-noc-red"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
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
      </div>

      {/* All Trunks Config Table */}
      {trunks.length > 0 && registrations.length === 0 && (
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-4">
            Configured Trunks ({trunks.length})
          </h2>
          <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-noc-border bg-noc-panel/50">
                    <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Name</th>
                    <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Description</th>
                    <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">Device Pool</th>
                    <th className="text-left px-5 py-3 text-noc-text-dim uppercase tracking-widest">CMG</th>
                  </tr>
                </thead>
                <tbody>
                  {trunks.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors"
                    >
                      <td className="px-5 py-3 text-noc-text-bright">{t.name}</td>
                      <td className="px-5 py-3 text-noc-text">{t.description || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{t.device_pool_name || "—"}</td>
                      <td className="px-5 py-3 text-noc-text">{t.cm_group_name || "—"}</td>
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

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "amber" | "green" | "red" | "cyan" | "yellow";
}) {
  const colors = {
    amber: "text-noc-amber border-noc-amber/15",
    green: "text-noc-green border-noc-green/15",
    red: "text-noc-red border-noc-red/15",
    cyan: "text-noc-cyan border-noc-cyan/15",
    yellow: "text-noc-amber border-noc-amber/15",
  };

  return (
    <div className={`rounded-lg border bg-noc-surface p-6 text-center ${colors[color]}`}>
      <div className="font-mono text-4xl font-bold">{value}</div>
      <div className="font-mono text-[11px] uppercase tracking-widest mt-3 text-noc-text-dim">
        {label}
      </div>
    </div>
  );
}
