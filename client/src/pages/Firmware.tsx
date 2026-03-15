import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { DevicePoolInfo, DevicePoolBreakdown } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function Firmware() {
  const [pools, setPools] = useState<DevicePoolInfo[]>([]);
  const [models, setModels] = useState<{ model: string; count: number }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [breakdowns, setBreakdowns] = useState<Map<number, DevicePoolBreakdown>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingBreakdown, setLoadingBreakdown] = useState<number | null>(null);
  const { sort: poolSort, toggle: togglePoolSort, sorted: sortedPools } = useSort<"name" | "cmg" | "phones">();
  const { cmgToAg } = useAvailabilityGroups();

  useEffect(() => {
    api.getPhoneModels().then(setModels).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    setBreakdowns(new Map());
    api
      .getDevicePools(selectedModel || undefined)
      .then(setPools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedModel]);

  const togglePool = async (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!breakdowns.has(id)) {
        setLoadingBreakdown(id);
        try {
          const bd = await api.getDevicePoolBreakdown(id, selectedModel || undefined);
          setBreakdowns((prev) => new Map(prev).set(id, bd));
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingBreakdown(null);
        }
      }
    }
    setSelected(next);
  };

  const totalSelected = pools
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + p.phone_count, 0);

  const selectedPools = pools.filter((p) => selected.has(p.id));

  const aggServers = new Map<string, number>();
  const aggSubnets = new Map<string, { name: string; cidr: string; count: number }>();
  const aggModels = new Map<string, number>();
  const aggFailover = new Map<string, { currentServer: string; backupServer: string | null; phoneCount: number }>();
  for (const pool of selectedPools) {
    const bd = breakdowns.get(pool.id);
    if (!bd) continue;
    for (const s of bd.serverDistribution) {
      aggServers.set(s.server_name, (aggServers.get(s.server_name) || 0) + s.count);
    }
    for (const s of bd.subnetDistribution) {
      const existing = aggSubnets.get(s.cidr);
      if (existing) {
        existing.count += s.count;
      } else {
        aggSubnets.set(s.cidr, { ...s });
      }
    }
    for (const m of bd.modelDistribution) {
      aggModels.set(m.model, (aggModels.get(m.model) || 0) + m.count);
    }
    for (const f of bd.failoverMovements) {
      const key = `${f.currentServer}→${f.backupServer || "none"}`;
      const existing = aggFailover.get(key);
      if (existing) {
        existing.phoneCount += f.phoneCount;
      } else {
        aggFailover.set(key, { ...f });
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading device pools...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="mb-4">
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          Firmware Upgrade Planner
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          Select device pools to see the blast radius of a firmware push.
        </p>
      </div>

      {/* Model Filter */}
      <div className="border border-noc-border bg-noc-surface p-4">
        <div className="flex items-center gap-3">
          <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
            Phone Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="flex-1 max-w-md px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50 cursor-pointer"
          >
            <option value="">All Models ({models.reduce((s, m) => s + m.count, 0).toLocaleString()} phones)</option>
            {models.map((m) => (
              <option key={m.model} value={m.model}>
                {m.model} ({m.count.toLocaleString()})
              </option>
            ))}
          </select>
          {selectedModel && (
            <button
              onClick={() => setSelectedModel("")}
              className="px-3 py-1.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Impact Summary */}
      {selected.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
          <ImpactBox label="Pools Selected" value={selected.size} color="cyan" />
          <ImpactBox label="Phones Restarting" value={totalSelected} color="amber" />
          <ImpactBox label="Servers Affected" value={aggServers.size} color="blue" />
          <ImpactBox label="Models" value={aggModels.size} color="green" />
        </div>
      )}

      {/* Device Pool Selection */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
        <div className="tmux-title text-noc-amber flex items-center justify-between">
          <span>Device Pools ({pools.length})</span>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer ml-auto normal-case tracking-normal"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-noc-border text-noc-text-dim">
                <th className="py-2.5" style={{ width: 56, minWidth: 56, paddingLeft: 20 }} />
                <ColHeader label="Device Pool" sortKey="name" sort={poolSort} onSort={togglePoolSort} />
                <ColHeader label="CM Group" sortKey="cmg" sort={poolSort} onSort={togglePoolSort} />
                <ColHeader label="Phones" sortKey="phones" sort={poolSort} onSort={togglePoolSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedPools(pools, (p, k) => k === "name" ? p.name : k === "cmg" ? (p.cm_group_name || "") : p.phone_count).map((pool, i) => {
                const isSelected = selected.has(pool.id);
                return (
                  <tr
                    key={pool.id}
                    onClick={() => togglePool(pool.id)}
                    className={`border-b border-noc-border/50 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-noc-amber/5"
                        : i % 2 === 0
                          ? "bg-noc-surface hover:bg-noc-panel/50"
                          : "bg-noc-bg/30 hover:bg-noc-panel/50"
                    }`}
                  >
                    <td className="py-2.5" style={{ paddingLeft: 20 }}>
                      <div
                        className={`w-4 h-4 border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? "border-noc-amber bg-noc-amber"
                            : "border-noc-border"
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-noc-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-medium text-noc-text-bright">{pool.name}</td>
                    <td className="px-4 py-2.5 font-mono text-noc-text-dim text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {pool.cm_group_name || "—"}
                        {pool.cm_group_name && cmgToAg.get(pool.cm_group_name) && (
                          <AgBadge label={cmgToAg.get(pool.cm_group_name)!} />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-noc-amber font-semibold">{pool.phone_count.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aggregated Breakdown */}
      {selected.size > 0 && aggServers.size > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Server Distribution */}
          <div className="border border-noc-border bg-noc-surface overflow-hidden">
            <div className="tmux-title text-noc-cyan">Phones by Server</div>
            <div className="p-4 space-y-2">
              {Array.from(aggServers.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([server, count]) => (
                  <div key={server} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-noc-text truncate">{server.split(".")[0]}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-1.5 bg-noc-bg overflow-hidden">
                        <div className="h-full bg-noc-cyan" style={{ width: `${(count / totalSelected) * 100}%` }} />
                      </div>
                      <span className="font-mono text-xs text-noc-amber font-semibold w-12 text-right">{count.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Model Distribution */}
          <div className="border border-noc-border bg-noc-surface overflow-hidden">
            <div className="tmux-title text-noc-green">Phones by Model</div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
              {Array.from(aggModels.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([model, count]) => (
                  <div key={model} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-noc-text truncate max-w-[200px]" title={model}>{model}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-noc-bg overflow-hidden">
                        <div className="h-full bg-noc-green" style={{ width: `${(count / totalSelected) * 100}%` }} />
                      </div>
                      <span className="font-mono text-xs text-noc-amber font-semibold w-12 text-right">{count.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Failover Movement */}
          {aggFailover.size > 0 && (
            <div className="border border-noc-border bg-noc-surface overflow-hidden md:col-span-2">
              <div className="tmux-title text-noc-red">Failover Movement (if server goes down)</div>
              <div className="p-4 space-y-2">
                {Array.from(aggFailover.values())
                  .sort((a, b) => b.phoneCount - a.phoneCount)
                  .map((f) => (
                    <div key={`${f.currentServer}→${f.backupServer}`} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-noc-text-bright w-28 text-right truncate" title={f.currentServer}>
                        {f.currentServer.split(".")[0]}
                      </span>
                      <span className="text-noc-text-dim text-xs">→</span>
                      <span className={`font-mono text-xs w-28 truncate ${f.backupServer ? "text-noc-amber" : "text-noc-red"}`} title={f.backupServer || "no backup"}>
                        {f.backupServer ? f.backupServer.split(".")[0] : "NO BACKUP"}
                      </span>
                      <div className="flex-1 h-1.5 bg-noc-bg overflow-hidden">
                        <div className="h-full bg-noc-red/60" style={{ width: `${(f.phoneCount / totalSelected) * 100}%` }} />
                      </div>
                      <span className="font-mono text-xs text-noc-amber font-semibold w-12 text-right">{f.phoneCount.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Subnet Distribution */}
          {aggSubnets.size > 0 && (
            <div className="border border-noc-border bg-noc-surface overflow-hidden md:col-span-2">
              <div className="tmux-title text-noc-amber">Phones by Subnet / Location</div>
              <div className="p-4">
                <div className="flex flex-wrap gap-px">
                  {Array.from(aggSubnets.values())
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <div key={s.cidr} className="px-3 py-2 border border-noc-border bg-noc-bg">
                        <div className="font-mono text-xs font-semibold text-noc-text-bright">{s.name}</div>
                        <div className="font-mono text-[10px] text-noc-text-dim">{s.cidr}</div>
                        <div className="font-mono text-sm text-noc-amber font-bold mt-1">{s.count.toLocaleString()}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loadingBreakdown !== null && (
        <div className="text-center py-4">
          <div className="inline-block w-5 h-5 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <span className="text-noc-text-dim text-xs font-mono ml-2">Loading breakdown...</span>
        </div>
      )}
    </div>
  );
}

function ImpactBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "amber" | "blue" | "cyan" | "green";
}) {
  const colors = {
    amber: "text-noc-amber",
    blue: "text-noc-blue",
    cyan: "text-noc-cyan",
    green: "text-noc-green",
  };

  return (
    <div className="bg-noc-surface p-4 text-center">
      <div className={`font-mono text-3xl font-bold ${colors[color]}`}>{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">{label}</div>
    </div>
  );
}
