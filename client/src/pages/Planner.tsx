import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { PlannerResult, PlannerGeoZone } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge } from "../components/AgBadge";

export default function Planner() {
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCmgs, setSelectedCmgs] = useState<Set<number> | null>(null); // null = initial load

  const fetchPlanner = useCallback(async (cmgIds?: number[]) => {
    setLoading(true);
    try {
      const data = await api.getPlanner(cmgIds);
      setResult(data);
      // On first load, initialize selection from server defaults
      if (selectedCmgs === null) {
        setSelectedCmgs(new Set(data.rebalanceCmgIds));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedCmgs]);

  useEffect(() => {
    fetchPlanner();
  }, []);

  const toggleCmg = (id: number) => {
    if (!selectedCmgs) return;
    const next = new Set(selectedCmgs);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedCmgs(next);
    fetchPlanner(Array.from(next));
  };

  const selectAll = () => {
    if (!result) return;
    const all = new Set(result.allCmgs.filter((c) => c.ccmActive).map((c) => c.id));
    setSelectedCmgs(all);
    fetchPlanner(Array.from(all));
  };

  const selectNone = () => {
    setSelectedCmgs(new Set());
    fetchPlanner([]);
  };

  if (loading && !result) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Analyzing distribution...
          </p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const maxLoad = Math.max(
    ...result.currentState.serverLoads.map((s) => s.phoneCount),
    ...result.proposedState.serverLoads.map((s) => s.phoneCount),
    1
  );

  const improved = result.proposedState.imbalanceRatio < result.currentState.imbalanceRatio;
  const delta = Math.round((result.currentState.imbalanceRatio - result.proposedState.imbalanceRatio) * 10) / 10;

  const rebalanceSet = selectedCmgs || new Set(result.rebalanceCmgIds);

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="mb-4">
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          CMG Rebalance Planner
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          Select which CMGs to rebalance. Subnets are distributed across selected CMGs to minimize server load imbalance.
        </p>
      </div>

      {/* Phone Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-noc-border">
        <StatBox label="Registered" value={result.phoneStats.registeredPhones} color="green" />
        <StatBox label="Unregistered" value={result.phoneStats.unregisteredPhones} color="amber" />
        <StatBox label="Never Seen" value={result.phoneStats.neverSeenPhones} color="red" />
        <StatBox label="Stale (7d+)" value={result.phoneStats.stalePhones} color="red" />
        <StatBox label="No Subnet" value={result.unmappedPhones} color="amber" />
      </div>

      {/* CMG Selection */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-cyan flex items-center justify-between">
          <span>CMG Selection — pick which to rebalance</span>
          <div className="flex items-center gap-2">
            {loading && (
              <div className="inline-block w-3 h-3 border border-noc-amber border-t-transparent rounded-full animate-spin" />
            )}
            <button
              onClick={selectAll}
              className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer normal-case tracking-normal"
            >
              All
            </button>
            <button
              onClick={selectNone}
              className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer normal-case tracking-normal"
            >
              None
            </button>
          </div>
        </div>
        <div className="p-3 flex flex-wrap gap-1.5">
          {result.allCmgs
            .sort((a, b) => b.phoneCount - a.phoneCount)
            .map((cmg) => {
              const isSelected = rebalanceSet.has(cmg.id);
              return (
                <button
                  key={cmg.id}
                  onClick={() => toggleCmg(cmg.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[10px] transition-all cursor-pointer ${
                    isSelected
                      ? "border-noc-cyan/40 bg-noc-cyan/8 text-noc-cyan"
                      : "border-noc-border/50 bg-noc-bg text-noc-text-dim hover:border-noc-border-bright hover:text-noc-text"
                  }`}
                >
                  <div
                    className={`w-3 h-3 border flex items-center justify-center transition-all ${
                      isSelected ? "border-noc-cyan bg-noc-cyan" : "border-noc-border"
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-2 h-2 text-noc-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {cmg.name}
                  <span className="text-noc-text-dim">({cmg.phoneCount.toLocaleString()})</span>
                  {!cmg.ccmActive && (
                    <span className="text-[8px] text-noc-text-dim uppercase">no-ccm</span>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      {/* Imbalance Comparison */}
      {rebalanceSet.size > 0 && (
        <>
          <div className="grid grid-cols-2 gap-px bg-noc-border">
            <div className={`p-5 text-center ${
              result.currentState.imbalanceRatio > 3 ? "bg-noc-red/5"
                : result.currentState.imbalanceRatio > 2 ? "bg-noc-amber/5"
                  : "bg-noc-green/5"
            }`}>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
                Current Imbalance
              </div>
              <div className={`font-mono text-4xl font-bold ${
                result.currentState.imbalanceRatio > 3 ? "text-noc-red"
                  : result.currentState.imbalanceRatio > 2 ? "text-noc-amber"
                    : "text-noc-green"
              }`}>
                {result.currentState.imbalanceRatio}x
              </div>
              <div className="font-mono text-[10px] text-noc-text-dim mt-1">max / min P1 server load</div>
            </div>

            <div className={`p-5 text-center ${
              result.proposedState.imbalanceRatio > 3 ? "bg-noc-red/5"
                : result.proposedState.imbalanceRatio > 2 ? "bg-noc-amber/5"
                  : "bg-noc-green/5"
            }`}>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
                Proposed Imbalance
              </div>
              <div className={`font-mono text-4xl font-bold ${
                result.proposedState.imbalanceRatio > 3 ? "text-noc-red"
                  : result.proposedState.imbalanceRatio > 2 ? "text-noc-amber"
                    : "text-noc-green"
              }`}>
                {result.proposedState.imbalanceRatio}x
              </div>
              <div className="font-mono text-[10px] text-noc-text-dim mt-1">
                max / min P1 server load
                {delta !== 0 && (
                  <span className={`ml-2 font-semibold ${improved ? "text-noc-green" : "text-noc-red"}`}>
                    {improved ? `↓ ${delta}x` : `↑ ${Math.abs(delta)}x`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Side-by-side Server Load */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ServerLoadPanel
              title="Current Server Load"
              color="red"
              loads={result.currentState.serverLoads}
              maxLoad={maxLoad}
            />
            <ServerLoadPanel
              title="Proposed Server Load"
              color="green"
              loads={result.proposedState.serverLoads}
              maxLoad={maxLoad}
            />
          </div>

          {/* Geo Zone → CMG Assignments */}
          {result.geoZones.length > 0 && (
            <GeoZoneTable zones={result.geoZones} />
          )}
        </>
      )}
    </div>
  );
}

function ServerLoadPanel({
  title,
  color,
  loads,
  maxLoad,
}: {
  title: string;
  color: "red" | "green";
  loads: { serverName: string; phoneCount: number; cmgs: string[]; agLabels: string[] }[];
  maxLoad: number;
}) {
  const barColor = color === "red" ? "bg-noc-red/70" : "bg-noc-green/70";
  const titleColor = color === "red" ? "text-noc-red" : "text-noc-green";

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <div className={`tmux-title ${titleColor}`}>{title}</div>
      <div className="p-4 space-y-3">
        {loads.map((s) => (
          <div key={s.serverName}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-xs text-noc-text truncate">{s.serverName.split(".")[0]}</span>
                {s.agLabels.map((label) => (
                  <AgBadge key={label} label={label} />
                ))}
              </div>
              <span className="font-mono text-xs text-noc-amber font-semibold shrink-0 ml-2">{s.phoneCount.toLocaleString()}</span>
            </div>
            <div className="w-full h-2 bg-noc-bg overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${(s.phoneCount / maxLoad) * 100}%` }} />
            </div>
            <div className="font-mono text-[9px] text-noc-text-dim mt-0.5">{s.cmgs.join(", ")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ZoneSortKey = "name" | "cidr" | "phones" | "current" | "proposed" | "server" | "ag";

function GeoZoneTable({ zones }: { zones: PlannerGeoZone[] }) {
  const { sort, toggle, sorted } = useSort<ZoneSortKey>({ key: "phones", dir: "desc" });

  const rows = sorted(zones, (z, k) => {
    switch (k) {
      case "name": return z.name;
      case "cidr": return z.subnetCidrs.join(", ");
      case "phones": return z.phoneCount;
      case "current": return z.currentCmg;
      case "proposed": return z.assignedCmg;
      case "server": return z.primaryServer;
      case "ag": return z.agLabel;
    }
  });

  const changedCount = zones.filter((z) => z.currentCmg !== z.assignedCmg).length;

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
      <div className="tmux-title text-noc-cyan flex items-center justify-between">
        <span>Proposed Subnet → CMG Assignments ({zones.length} subnets)</span>
        {changedCount > 0 && (
          <span className="font-mono text-[10px] text-noc-amber normal-case tracking-normal font-bold">
            {changedCount} subnet{changedCount !== 1 ? "s" : ""} would move
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-noc-border text-noc-text-dim">
              <ColHeader label="Subnet" sortKey="name" sort={sort} onSort={toggle} />
              <ColHeader label="Phones" sortKey="phones" sort={sort} onSort={toggle} />
              <ColHeader label="Current CMG" sortKey="current" sort={sort} onSort={toggle} />
              <ColHeader label="Proposed CMG" sortKey="proposed" sort={sort} onSort={toggle} />
              <ColHeader label="AG" sortKey="ag" sort={sort} onSort={toggle} />
              <ColHeader label="P1 Server" sortKey="server" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {rows.map((zone, i) => {
              const changed = zone.currentCmg !== zone.assignedCmg;
              return (
                <tr
                  key={zone.name}
                  className={`border-b border-noc-border/50 ${
                    changed ? "bg-noc-amber/5" : i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono font-medium text-noc-text-bright truncate">{zone.name}</td>
                  <td className="px-4 py-2.5 font-mono text-noc-amber font-semibold">{zone.phoneCount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-noc-text-dim text-xs truncate">{zone.currentCmg}</td>
                  <td className={`px-4 py-2.5 font-mono text-xs truncate ${changed ? "text-noc-amber font-semibold" : "text-noc-text"}`}>
                    {changed && <span className="mr-1 text-noc-amber">→</span>}
                    {zone.assignedCmg}
                  </td>
                  <td className="px-4 py-2.5">
                    {zone.agLabel && <AgBadge label={zone.agLabel} />}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-noc-text-dim text-xs truncate">{zone.primaryServer.split(".")[0]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  color: "amber" | "green" | "red" | "cyan";
}) {
  const colors = {
    amber: "text-noc-amber",
    green: "text-noc-green",
    red: "text-noc-red",
    cyan: "text-noc-cyan",
  };

  return (
    <div className="bg-noc-surface p-4 text-center">
      <div className={`font-mono text-3xl font-bold ${colors[color]}`}>{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">{label}</div>
    </div>
  );
}
