import { useState, useCallback } from "react";
import type { Server, SimulationResult, TrunkImpact } from "../api/client";
import { api } from "../api/client";

interface Props {
  servers: Server[];
}

export default function SimulationPanel({ servers }: Props) {
  const [disabled, setDisabled] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Only show CCM-active servers — non-CCM servers don't affect phone registration
  const ccmServers = servers.filter((s) => s.ccm_service_active === 1);

  const runSimulation = useCallback(async (disabledIds: Set<number>) => {
    if (disabledIds.size === 0) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.simulate(Array.from(disabledIds));
      setResult(r);
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = (id: number) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      runSimulation(next);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* Server Toggles */}
      <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-noc-border bg-noc-panel flex items-center justify-between">
          <div>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
              Server Failure Simulation
            </h2>
            <p className="text-xs text-noc-text-dim mt-1">
              Toggle CCM servers offline to model failover impact
            </p>
          </div>
          {disabled.size > 0 && (
            <button
              onClick={() => {
                setDisabled(new Set());
                setResult(null);
              }}
              className="px-3 py-1.5 rounded border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
            >
              Reset All
            </button>
          )}
        </div>
        <div className="p-6">
          <div className={`grid gap-4 ${
            ccmServers.length > 4
              ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2"
          }`}>
            {ccmServers.map((server) => {
              const isDisabled = disabled.has(server.id);
              const isPublisher = server.node_type === "Publisher";
              return (
                <button
                  key={server.id}
                  onClick={() => toggle(server.id)}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                    isDisabled
                      ? "border-noc-red/40 bg-noc-red/5"
                      : "border-noc-border hover:border-noc-green/30 bg-noc-panel"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 transition-colors ${
                        isDisabled ? "bg-noc-red animate-pulse-red" : "bg-noc-green"
                      }`}
                    />
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-noc-text-bright truncate">
                          {server.name.split(".")[0]}
                        </span>
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {isPublisher ? "PUB" : "SUB"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 ml-3 px-3 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-widest ${
                      isDisabled
                        ? "bg-noc-red/20 text-noc-red"
                        : "bg-noc-green/10 text-noc-green"
                    }`}
                  >
                    {isDisabled ? "OFFLINE" : "ONLINE"}
                  </span>
                </button>
              );
            })}
          </div>
          {servers.length > ccmServers.length && (
            <p className="text-[10px] font-mono text-noc-text-dim mt-4 text-center uppercase tracking-widest">
              {servers.length - ccmServers.length} non-CCM nodes hidden (no impact on phone registration)
            </p>
          )}
        </div>
      </div>

      {/* Impact Results */}
      {loading && (
        <div className="text-center py-8">
          <div className="inline-block w-6 h-6 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-2">
            CALCULATING IMPACT...
          </p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-5">
            <SummaryCard
              label="NO IMPACT"
              value={result.noImpact}
              color="green"
            />
            <SummaryCard
              label="WILL RE-REGISTER"
              value={result.willReRegister}
              color="amber"
            />
            <SummaryCard
              label="UNREGISTERED"
              value={result.unregistered}
              color="red"
            />
          </div>

          {/* Trunk Impact */}
          {result.trunkImpact && result.trunkImpact.totalTrunks > 0 && (
            <TrunkImpactSection trunkImpact={result.trunkImpact} />
          )}

          {/* Per-CMG Breakdown */}
          <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
                Phone Impact by CMG ({result.details.length} groups)
              </h3>
            </div>
            <div className="divide-y divide-noc-border/50">
              {result.details.map((d) => (
                <CmgImpactRow key={d.cmGroupId} detail={d} />
              ))}
            </div>
          </div>
        </div>
      )}

      {!result && !loading && disabled.size === 0 && (
        <div className="text-center py-12 border border-dashed border-noc-border rounded-lg">
          <p className="font-mono text-sm text-noc-text-dim">
            Toggle a server offline to begin simulation
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "amber" | "red";
}) {
  const colors = {
    green: "border-noc-green/20 text-noc-green",
    amber: "border-noc-amber/20 text-noc-amber",
    red: "border-noc-red/20 text-noc-red",
  };
  const bgColors = {
    green: "bg-noc-green/5",
    amber: "bg-noc-amber/5",
    red: "bg-noc-red/5",
  };

  return (
    <div
      className={`rounded-lg border p-6 text-center ${colors[color]} ${bgColors[color]}`}
    >
      <div className="font-mono text-3xl font-bold">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 opacity-70">
        {label}
      </div>
    </div>
  );
}

function CmgImpactRow({
  detail,
}: {
  detail: SimulationResult["details"][0];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasImpact = detail.willReRegister > 0 || detail.unregistered > 0;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-noc-panel/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 rounded-full ${
              detail.unregistered > 0
                ? "bg-noc-red"
                : detail.willReRegister > 0
                  ? "bg-noc-amber"
                  : "bg-noc-green"
            }`}
          />
          <span className="font-mono text-sm text-noc-text-bright">
            {detail.cmGroupName}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-noc-text-dim">{detail.totalPhones} phones</span>
          {detail.willReRegister > 0 && (
            <span className="text-noc-amber">
              {detail.willReRegister} re-reg
            </span>
          )}
          {detail.unregistered > 0 && (
            <span className="text-noc-red">{detail.unregistered} down</span>
          )}
          {!hasImpact && <span className="text-noc-green">no impact</span>}
          <svg
            className={`w-4 h-4 text-noc-text-dim transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-4 space-y-4">
          {/* Subnet Impact Summary */}
          {detail.subnetImpacts && detail.subnetImpacts.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {detail.subnetImpacts.map((si) => (
                <div
                  key={si.subnetName}
                  className={`px-3 py-2 rounded-lg border font-mono text-[10px] ${
                    si.unregistered > 0
                      ? "border-noc-red/30 bg-noc-red/5"
                      : si.willReRegister > 0
                        ? "border-noc-amber/30 bg-noc-amber/5"
                        : "border-noc-green/30 bg-noc-green/5"
                  }`}
                >
                  <div className="font-semibold text-noc-text-bright text-xs mb-0.5">
                    {si.subnetName}
                  </div>
                  <div className="text-noc-text-dim">{si.cidr}</div>
                  <div className="flex gap-3 mt-1">
                    {si.noImpact > 0 && (
                      <span className="text-noc-green">{si.noImpact} ok</span>
                    )}
                    {si.willReRegister > 0 && (
                      <span className="text-noc-amber">{si.willReRegister} re-reg</span>
                    )}
                    {si.unregistered > 0 && (
                      <span className="text-noc-red">{si.unregistered} down</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phone Movement Table */}
          <div className="overflow-x-auto rounded-lg border border-noc-border/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-noc-border/50 text-noc-text-dim">
                  <th className="text-left px-4 py-2.5 font-mono font-medium">
                    Phone
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono font-medium">
                    Current Server
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono font-medium">
                    New Server
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono font-medium">
                    Subnet
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono font-medium">
                    Impact
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.movements.map((m) => (
                  <tr
                    key={m.phoneName}
                    className="border-b border-noc-border/30 hover:bg-noc-panel/30"
                  >
                    <td className="px-4 py-2 font-mono text-noc-text">
                      {m.phoneName}
                    </td>
                    <td className="px-4 py-2 font-mono text-noc-text-dim">
                      {m.currentServer
                        ? m.currentServer.split(".")[0]
                        : "---"}
                    </td>
                    <td className="px-4 py-2 font-mono text-noc-text-dim">
                      {m.newServer ? m.newServer.split(".")[0] : "---"}
                    </td>
                    <td className="px-4 py-2 font-mono text-noc-cyan">
                      {m.subnetName || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                          m.impact === "no_change"
                            ? "bg-noc-green/10 text-noc-green"
                            : m.impact === "re_register"
                              ? "bg-noc-amber/10 text-noc-amber"
                              : "bg-noc-red/10 text-noc-red"
                        }`}
                      >
                        {m.impact === "no_change"
                          ? "OK"
                          : m.impact === "re_register"
                            ? "RE-REG"
                            : "DOWN"}
                      </span>
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

function TrunkImpactSection({ trunkImpact }: { trunkImpact: TrunkImpact }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 border-b border-noc-border bg-noc-panel flex items-center justify-between cursor-pointer hover:bg-noc-panel/80 transition-colors"
      >
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
          SIP Trunk Impact ({trunkImpact.totalTrunks} trunks)
        </h3>
        <div className="flex items-center gap-4 text-xs font-mono">
          {trunkImpact.noImpact > 0 && (
            <span className="text-noc-green">{trunkImpact.noImpact} ok</span>
          )}
          {trunkImpact.willReRegister > 0 && (
            <span className="text-noc-amber">{trunkImpact.willReRegister} re-reg</span>
          )}
          {trunkImpact.noService > 0 && (
            <span className="text-noc-red">{trunkImpact.noService} no service</span>
          )}
          <svg
            className={`w-4 h-4 text-noc-text-dim transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="p-6 space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-noc-green/20 bg-noc-green/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-green">{trunkImpact.noImpact}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Full Service</div>
            </div>
            <div className="rounded-lg border border-noc-amber/20 bg-noc-amber/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-amber">{trunkImpact.willReRegister}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Will Re-Register</div>
            </div>
            <div className="rounded-lg border border-noc-red/20 bg-noc-red/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-red">{trunkImpact.noService}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">No Service</div>
            </div>
          </div>

          {/* Affected trunks table */}
          {(trunkImpact.willReRegister > 0 || trunkImpact.noService > 0) && (
            <div className="overflow-x-auto rounded-lg border border-noc-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-noc-border/50 text-noc-text-dim">
                    <th className="text-left px-4 py-2.5 font-mono font-medium">Trunk</th>
                    <th className="text-left px-4 py-2.5 font-mono font-medium">Description</th>
                    <th className="text-left px-4 py-2.5 font-mono font-medium">CMG</th>
                    <th className="text-left px-4 py-2.5 font-mono font-medium">Current Server</th>
                    <th className="text-left px-4 py-2.5 font-mono font-medium">New Server</th>
                    <th className="text-left px-4 py-2.5 font-mono font-medium">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {trunkImpact.movements
                    .filter((m) => m.impact !== "no_change")
                    .map((m) => (
                      <tr key={m.trunkName} className="border-b border-noc-border/30 hover:bg-noc-panel/30">
                        <td className="px-4 py-2 font-mono text-noc-text-bright">{m.trunkName}</td>
                        <td className="px-4 py-2 font-mono text-noc-text-dim truncate max-w-48">{m.description || "—"}</td>
                        <td className="px-4 py-2 font-mono text-noc-text">{m.cmGroupName}</td>
                        <td className="px-4 py-2 font-mono text-noc-text-dim">
                          {m.currentServer ? m.currentServer.split(".")[0] : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-noc-text-dim">
                          {m.newServer ? m.newServer.split(".")[0] : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                            m.impact === "re_register"
                              ? "bg-noc-amber/10 text-noc-amber"
                              : "bg-noc-red/10 text-noc-red"
                          }`}>
                            {m.impact === "re_register" ? "RE-REG" : "NO SVC"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
