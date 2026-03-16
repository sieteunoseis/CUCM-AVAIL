import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { ServiceStatusEntry, ServiceSummary, ServiceGroup } from "../api/client";
import { SgBadge } from "../components/SgBadge";

type SortKey = "name" | "active" | "sg";
type SortDir = "asc" | "desc";

export default function Services() {
  const [statuses, setStatuses] = useState<ServiceStatusEntry[]>([]);
  const [summary, setSummary] = useState<ServiceSummary[]>([]);
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "active" ? "desc" : "asc");
    }
  };

  useEffect(() => {
    Promise.all([
      api.getServiceStatuses().catch(() => []),
      api.getServiceSummary().catch(() => []),
      api.getServiceGroups().catch(() => []),
    ]).then(([s, sm, sg]) => {
      setStatuses(s);
      setSummary(sm);
      setServiceGroups(sg);
      setLoading(false);
    });
  }, []);

  // Build service → SG label map
  const serviceToSg = new Map<string, string>();
  for (const sg of serviceGroups) {
    for (const svc of sg.services) {
      serviceToSg.set(svc, sg.label);
    }
  }

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
  const serviceNamesRaw = [...new Set(statuses.map((s) => s.service_name))];
  const serverNames = [...new Set(statuses.map((s) => s.server_name))].sort();

  // Build lookup: service_name → server_name → status
  const statusLookup = new Map<string, Map<string, ServiceStatusEntry>>();
  for (const s of statuses) {
    if (!statusLookup.has(s.service_name)) statusLookup.set(s.service_name, new Map());
    statusLookup.get(s.service_name)!.set(s.server_name, s);
  }

  // Sort services
  const serviceNames = [...serviceNamesRaw].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return a.localeCompare(b) * dir;
    if (sortKey === "active") {
      const aActive = summary.find((s) => s.service_name === a)?.active_count || 0;
      const bActive = summary.find((s) => s.service_name === b)?.active_count || 0;
      return (aActive - bActive) * dir;
    }
    if (sortKey === "sg") {
      const aSg = serviceToSg.get(a) || "ZZ";
      const bSg = serviceToSg.get(b) || "ZZ";
      return aSg.localeCompare(bSg) * dir;
    }
    return 0;
  });

  const totalServices = summary.length;
  const operational = summary.filter((s) => s.active_count > 0).length;
  const outage = summary.filter((s) => s.active_count === 0 && s.total_servers > 0).length;

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
      <div className="grid grid-cols-3 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-cyan">{totalServices}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Services Tracked</div>
        </div>
        <div className={`p-4 text-center ${operational > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${operational > 0 ? "text-noc-green" : "text-noc-text-dim"}`}>
            {operational}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Operational</div>
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
          <div className="tmux-title text-noc-cyan flex items-center justify-between">
            <span>Service Status Matrix</span>
            <div className="flex items-center gap-2 text-[10px] font-mono normal-case tracking-normal">
              <span className="text-noc-text-dim">Sort:</span>
              {(["name", "active", "sg"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`px-1.5 py-0.5 cursor-pointer transition-colors ${
                    sortKey === key ? "text-noc-cyan bg-noc-cyan/10" : "text-noc-text-dim hover:text-noc-text"
                  }`}
                >
                  {key === "name" ? "Name" : key === "active" ? "Active" : "SG"}
                  {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                  <th
                    className="text-left px-4 py-2.5 font-medium text-[10px] uppercase tracking-widest sticky left-0 bg-noc-panel/50 z-10 cursor-pointer hover:text-noc-text transition-colors select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Service {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
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
                  const summaryRow = summary.find((s) => s.service_name === service);
                  const activeCount = summaryRow?.active_count || 0;
                  const totalCount = summaryRow?.total_servers || 0;

                  return (
                    <tr key={service} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                      <td className="px-4 py-2.5 sticky left-0 bg-noc-surface z-10">
                        <div className="flex items-center gap-2">
                          <span className="text-noc-text-bright text-xs">{service}</span>
                          {serviceToSg.has(service) && (
                            <SgBadge label={serviceToSg.get(service)!} />
                          )}
                          <span className={`text-[10px] font-mono ${
                            activeCount === 0 && totalCount > 0 ? "text-noc-red" : "text-noc-text-dim"
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
                                title={`${service} on ${server.split(".")[0]}: ${entry.status}`}
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

      {/* Service Groups — services grouped by identical server set */}
      {serviceGroups.length > 0 && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-amber">
            Service Groups ({serviceGroups.length})
          </div>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {serviceGroups.map((sg) => (
              <div key={sg.label} className="border border-noc-border bg-noc-bg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <SgBadge label={sg.label} />
                  <span className="font-mono text-[10px] text-noc-text-dim">
                    {sg.serviceCount} service{sg.serviceCount !== 1 ? "s" : ""} on {sg.serverCount} server{sg.serverCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mb-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Servers</div>
                  <div className="flex flex-wrap gap-1">
                    {sg.servers.map((server) => (
                      <span key={server} className="px-1.5 py-0.5 bg-noc-green/10 text-noc-green text-[10px] font-mono">
                        {server.split(".")[0]}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Services</div>
                  <div className="flex flex-wrap gap-1">
                    {sg.services.map((svc) => (
                      <span key={svc} className="px-1.5 py-0.5 bg-noc-surface text-noc-text text-[10px] font-mono">
                        {svc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
