import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { DevicePoolInfo, DevicePoolBreakdown } from "../api/client";

export default function Firmware() {
  const [pools, setPools] = useState<DevicePoolInfo[]>([]);
  const [models, setModels] = useState<{ model: string; count: number }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [breakdowns, setBreakdowns] = useState<Map<number, DevicePoolBreakdown>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingBreakdown, setLoadingBreakdown] = useState<number | null>(null);

  // Load models on mount
  useEffect(() => {
    api.getPhoneModels().then(setModels).catch(console.error);
  }, []);

  // Load device pools (filtered by model if selected)
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
          const bd = await api.getDevicePoolBreakdown(id);
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

  // Aggregate impact of all selected pools
  const totalSelected = pools
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + p.phone_count, 0);

  const selectedPools = pools.filter((p) => selected.has(p.id));

  // Aggregate server distribution across selected pools
  const aggServers = new Map<string, number>();
  const aggSubnets = new Map<string, { name: string; cidr: string; count: number }>();
  const aggModels = new Map<string, number>();
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
    <div className="space-y-10 animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold text-noc-text-bright">
          Firmware Upgrade Planner
        </h1>
        <p className="text-sm text-noc-text-dim mt-1">
          Select device pools to see the blast radius of a firmware push — which phones restart, where they are, and what models are affected.
        </p>
      </div>

      {/* Model Filter */}
      <div className="rounded-lg border border-noc-border bg-noc-surface p-5">
        <div className="flex items-center gap-4">
          <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
            Phone Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="flex-1 max-w-md px-4 py-2.5 rounded-lg border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50 cursor-pointer"
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
              className="px-3 py-1.5 rounded border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Impact Summary (when pools selected) */}
      {selected.size > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <ImpactBox
            label="Pools Selected"
            value={selected.size}
            color="cyan"
          />
          <ImpactBox
            label="Phones Restarting"
            value={totalSelected}
            color="amber"
          />
          <ImpactBox
            label="Servers Affected"
            value={aggServers.size}
            color="blue"
          />
          <ImpactBox
            label="Models"
            value={aggModels.size}
            color="green"
          />
        </div>
      )}

      {/* Device Pool Selection */}
      <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-noc-border bg-noc-panel flex items-center justify-between">
          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
              Device Pools ({pools.length})
            </h2>
            <p className="text-[10px] font-mono text-noc-text-dim mt-1">
              Select pools to plan firmware rollout
            </p>
          </div>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border text-noc-text-dim">
                <th className="w-12 px-6 py-3.5" />
                <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                  Device Pool
                </th>
                <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                  CM Group
                </th>
                <th className="text-right px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                  Phones
                </th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool, i) => {
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
                    <td className="px-6 py-3">
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
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
                    <td className="px-6 py-3 font-mono font-medium text-noc-text-bright">
                      {pool.name}
                    </td>
                    <td className="px-6 py-3 font-mono text-noc-text-dim text-xs">
                      {pool.cm_group_name || "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-noc-amber font-semibold">
                      {pool.phone_count.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aggregated Breakdown */}
      {selected.size > 0 && aggServers.size > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Server Distribution */}
          <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
                Phones by Server
              </h3>
            </div>
            <div className="p-5 space-y-3">
              {Array.from(aggServers.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([server, count]) => (
                  <div key={server} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-noc-text truncate">
                      {server.split(".")[0]}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-1.5 rounded-full bg-noc-bg overflow-hidden">
                        <div
                          className="h-full rounded-full bg-noc-cyan"
                          style={{
                            width: `${(count / totalSelected) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-noc-amber font-semibold w-12 text-right">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Model Distribution */}
          <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-green">
                Phones by Model
              </h3>
            </div>
            <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
              {Array.from(aggModels.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([model, count]) => (
                  <div key={model} className="flex items-center justify-between">
                    <span className="font-mono text-xs text-noc-text truncate max-w-[200px]" title={model}>
                      {model}
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 rounded-full bg-noc-bg overflow-hidden">
                        <div
                          className="h-full rounded-full bg-noc-green"
                          style={{
                            width: `${(count / totalSelected) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-noc-amber font-semibold w-12 text-right">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Subnet Distribution */}
          {aggSubnets.size > 0 && (
            <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden md:col-span-2">
              <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
                  Phones by Subnet / Location
                </h3>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-3">
                  {Array.from(aggSubnets.values())
                    .sort((a, b) => b.count - a.count)
                    .map((s) => (
                      <div
                        key={s.cidr}
                        className="px-4 py-3 rounded-lg border border-noc-border bg-noc-bg"
                      >
                        <div className="font-mono text-xs font-semibold text-noc-text-bright">
                          {s.name}
                        </div>
                        <div className="font-mono text-[10px] text-noc-text-dim">{s.cidr}</div>
                        <div className="font-mono text-sm text-noc-amber font-bold mt-1">
                          {s.count.toLocaleString()}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading indicator for breakdown */}
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
    amber: "text-noc-amber border-noc-amber/15",
    blue: "text-noc-blue border-noc-blue/15",
    cyan: "text-noc-cyan border-noc-cyan/15",
    green: "text-noc-green border-noc-green/15",
  };

  return (
    <div className={`rounded-lg border bg-noc-surface p-5 text-center ${colors[color]}`}>
      <div className="font-mono text-3xl font-bold">{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
        {label}
      </div>
    </div>
  );
}
