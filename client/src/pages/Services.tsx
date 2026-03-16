import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { ServiceStatusEntry, ServiceSummary } from "../api/client";

const DISPLAY_NAMES: Record<string, string> = {
  "Cisco CallManager": "CallManager",
  "Cisco Extension Mobility": "Extension Mobility",
  "Cisco CTIManager": "CTI Manager",
  "Cisco Tftp": "TFTP",
  "Cisco IP Voice Media Streaming App": "Media Resources",
};

export default function Services() {
  const [statuses, setStatuses] = useState<ServiceStatusEntry[]>([]);
  const [summary, setSummary] = useState<ServiceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getServiceStatuses().catch(() => []),
      api.getServiceSummary().catch(() => []),
    ]).then(([s, sm]) => {
      setStatuses(s);
      setSummary(sm);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading service data...
          </p>
        </div>
      </div>
    );
  }

  // Get unique service names and server names
  const serviceNames = [...new Set(statuses.map((s) => s.service_name))].sort();
  const serverNames = [...new Set(statuses.map((s) => s.server_name))].sort();

  // Build lookup: service_name → server_name → status
  const statusLookup = new Map<string, Map<string, ServiceStatusEntry>>();
  for (const s of statuses) {
    if (!statusLookup.has(s.service_name)) statusLookup.set(s.service_name, new Map());
    statusLookup.get(s.service_name)!.set(s.server_name, s);
  }

  const totalServices = summary.length;
  const allHealthy = summary.filter((s) => s.stopped_count === 0 && s.error_count === 0).length;
  const degraded = summary.filter((s) => s.active_count > 0 && (s.stopped_count > 0 || s.error_count > 0)).length;
  const outage = summary.filter((s) => s.active_count === 0).length;

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-noc-text-bright">
          Service Monitor
        </h1>
        <p className="text-xs font-mono text-noc-text-dim mt-1">
          Customer-facing CUCM services across all subscribers
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-cyan">{totalServices}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Services Tracked</div>
        </div>
        <div className={`p-4 text-center ${allHealthy > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${allHealthy > 0 ? "text-noc-green" : "text-noc-text-dim"}`}>
            {allHealthy}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Fully Active</div>
        </div>
        <div className={`p-4 text-center ${degraded > 0 ? "bg-noc-amber/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${degraded > 0 ? "text-noc-amber" : "text-noc-text-dim"}`}>
            {degraded}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Degraded</div>
        </div>
        <div className={`p-4 text-center ${outage > 0 ? "bg-noc-red/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${outage > 0 ? "text-noc-red" : "text-noc-text-dim"}`}>
            {outage}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Outage</div>
        </div>
      </div>

      {/* Service × Server Matrix */}
      {statuses.length > 0 ? (
        <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
          <div className="tmux-title text-noc-cyan">
            Service Status Matrix
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                  <th className="text-left px-4 py-2.5 font-medium text-[10px] uppercase tracking-widest sticky left-0 bg-noc-panel/50 z-10">
                    Service
                  </th>
                  {serverNames.map((server) => (
                    <th key={server} className="text-center px-3 py-2.5 font-medium text-[10px] uppercase tracking-widest whitespace-nowrap">
                      {server.split(".")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serviceNames.map((service) => {
                  const row = statusLookup.get(service);
                  const displayName = DISPLAY_NAMES[service] || service;
                  const summaryRow = summary.find((s) => s.service_name === service);
                  const activeCount = summaryRow?.active_count || 0;
                  const totalCount = summaryRow?.total_servers || 0;

                  return (
                    <tr key={service} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                      <td className="px-4 py-2.5 text-noc-text-bright font-semibold sticky left-0 bg-noc-surface z-10">
                        <div className="flex items-center gap-2">
                          <span>{displayName}</span>
                          <span className={`text-[10px] font-mono ${
                            activeCount === totalCount ? "text-noc-green" : activeCount === 0 ? "text-noc-red" : "text-noc-amber"
                          }`}>
                            {activeCount}/{totalCount}
                          </span>
                        </div>
                      </td>
                      {serverNames.map((server) => {
                        const entry = row?.get(server);
                        const isActive = entry?.status === "Started" || entry?.status === "started";
                        const isStopped = entry?.status === "Stopped" || entry?.status === "stopped";
                        return (
                          <td key={server} className="text-center px-3 py-2.5">
                            {entry ? (
                              <span
                                className={`inline-block w-3 h-3 rounded-sm ${
                                  isActive
                                    ? "bg-noc-green"
                                    : isStopped
                                      ? "bg-noc-text-dim/30"
                                      : "bg-noc-red"
                                }`}
                                title={`${displayName} on ${server.split(".")[0]}: ${entry.status}`}
                              />
                            ) : (
                              <span className="text-noc-text-dim/30">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-noc-border bg-noc-surface p-8 text-center">
          <p className="text-noc-text-dim text-xs font-mono">
            No service data yet. Run a sync to check service statuses across all servers.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono text-noc-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-noc-green" /> Started
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-noc-text-dim/30" /> Stopped / Not Activated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-noc-red" /> Error
        </span>
      </div>
    </div>
  );
}
