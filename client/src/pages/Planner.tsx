import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { PlannerResult } from "../api/client";

export default function Planner() {
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPlanner()
      .then(setResult)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
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

  return (
    <div className="space-y-10 animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold text-noc-text-bright">
          Geo Device Pool Planner
        </h1>
        <p className="text-sm text-noc-text-dim mt-1">
          Plan device pool reorganization by geographic subnet. Balances CMG assignments to even out server load.
        </p>
        {result.unmappedPhones > 0 && (
          <p className="text-xs text-noc-amber font-mono mt-2">
            {result.unmappedPhones.toLocaleString()} of {result.totalPhones.toLocaleString()} phones
            have no subnet mapping — define more subnets for better planning accuracy.
          </p>
        )}
      </div>

      {/* Imbalance Comparison */}
      <div className="grid grid-cols-2 gap-6">
        <div className={`rounded-lg border p-6 text-center ${
          result.currentState.imbalanceRatio > 3
            ? "border-noc-red/20 bg-noc-red/5"
            : result.currentState.imbalanceRatio > 2
              ? "border-noc-amber/20 bg-noc-amber/5"
              : "border-noc-green/20 bg-noc-green/5"
        }`}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
            Current Imbalance
          </div>
          <div className={`font-mono text-4xl font-bold ${
            result.currentState.imbalanceRatio > 3
              ? "text-noc-red"
              : result.currentState.imbalanceRatio > 2
                ? "text-noc-amber"
                : "text-noc-green"
          }`}>
            {result.currentState.imbalanceRatio}x
          </div>
          <div className="font-mono text-[10px] text-noc-text-dim mt-1">max / min server load</div>
        </div>

        <div className={`rounded-lg border p-6 text-center ${
          result.proposedState.imbalanceRatio > 3
            ? "border-noc-red/20 bg-noc-red/5"
            : result.proposedState.imbalanceRatio > 2
              ? "border-noc-amber/20 bg-noc-amber/5"
              : "border-noc-green/20 bg-noc-green/5"
        }`}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
            Proposed Imbalance
          </div>
          <div className={`font-mono text-4xl font-bold ${
            result.proposedState.imbalanceRatio > 3
              ? "text-noc-red"
              : result.proposedState.imbalanceRatio > 2
                ? "text-noc-amber"
                : "text-noc-green"
          }`}>
            {result.proposedState.imbalanceRatio}x
          </div>
          <div className="font-mono text-[10px] text-noc-text-dim mt-1">max / min server load</div>
        </div>
      </div>

      {/* Side-by-side Server Load */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current */}
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-red">
              Current Server Load
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {result.currentState.serverLoads.map((s) => (
              <div key={s.serverName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-noc-text truncate">
                    {s.serverName.split(".")[0]}
                  </span>
                  <span className="font-mono text-xs text-noc-amber font-semibold">
                    {s.phoneCount.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-noc-bg overflow-hidden">
                  <div
                    className="h-full rounded-full bg-noc-red/70 transition-all"
                    style={{ width: `${(s.phoneCount / maxLoad) * 100}%` }}
                  />
                </div>
                <div className="font-mono text-[9px] text-noc-text-dim mt-0.5">
                  {s.cmgs.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proposed */}
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-green">
              Proposed Server Load
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {result.proposedState.serverLoads.map((s) => (
              <div key={s.serverName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-noc-text truncate">
                    {s.serverName.split(".")[0]}
                  </span>
                  <span className="font-mono text-xs text-noc-amber font-semibold">
                    {s.phoneCount.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-noc-bg overflow-hidden">
                  <div
                    className="h-full rounded-full bg-noc-green/70 transition-all"
                    style={{ width: `${(s.phoneCount / maxLoad) * 100}%` }}
                  />
                </div>
                <div className="font-mono text-[9px] text-noc-text-dim mt-0.5">
                  {s.cmgs.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Geo Zone → CMG Assignments */}
      {result.geoZones.length > 0 && (
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
              Proposed Subnet → CMG Assignments ({result.geoZones.length} zones)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-noc-text-dim">
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                    Subnet / Zone
                  </th>
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                    CIDR
                  </th>
                  <th className="text-right px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                    Phones
                  </th>
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                    Assigned CMG
                  </th>
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                    Primary Server
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.geoZones.map((zone, i) => (
                  <tr
                    key={zone.name}
                    className={`border-b border-noc-border/50 ${
                      i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                    }`}
                  >
                    <td className="px-6 py-3.5 font-mono font-medium text-noc-text-bright">
                      {zone.name}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-noc-cyan text-xs">
                      {zone.subnetCidrs.join(", ")}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-noc-amber font-semibold">
                      {zone.phoneCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-noc-text text-xs">
                      {zone.assignedCmg}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-noc-text-dim text-xs">
                      {zone.primaryServer.split(".")[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
