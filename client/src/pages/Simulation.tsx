import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { Server, SimulationResult, TrunkImpact, GatewayImpact, ServiceImpact, PhoneStatus } from "../api/client";
import { SgBadge } from "../components/SgBadge";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

interface SimulationProps {
  /** Deep-link: preselect these servers (matched by name/hostname, case-insensitive) as offline and auto-run. */
  initialServerNames?: string[];
  /** Deep-link: prefill the phone filter and auto-expand the CMG group containing it. */
  initialPhone?: string;
}

export default function Simulation({ initialServerNames, initialPhone }: SimulationProps = {}) {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [phoneFilter, setPhoneFilter] = useState(initialPhone || "");
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null | undefined>(undefined);
  const [phoneStatusLoading, setPhoneStatusLoading] = useState(false);
  const { cmgToAg, serverToAgs } = useAvailabilityGroups();

  useEffect(() => {
    api.getServers()
      .then(setServers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Exact-name lookup for the phone filter, so landing on ?phone=<name>
  // (with no servers toggled) still shows something immediately instead of
  // an empty page -- current server, CMG chain, live health -- rather than
  // only filtering rows in a simulation result that may not exist yet.
  // undefined = not looked up / empty input, null = looked up, no match.
  useEffect(() => {
    const needle = phoneFilter.trim();
    if (!needle) {
      setPhoneStatus(undefined);
      return;
    }
    let cancelled = false;
    setPhoneStatusLoading(true);
    const t = setTimeout(() => {
      api
        .getPhoneStatus(needle)
        .then((s) => {
          if (!cancelled) setPhoneStatus(s);
        })
        .catch(() => {
          if (!cancelled) setPhoneStatus(null);
        })
        .finally(() => {
          if (!cancelled) setPhoneStatusLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phoneFilter]);

  const ccmServers = servers.filter((s) => s.ccm_service_active === 1);
  const nonCcmCount = servers.length - ccmServers.length;

  const runSimulation = useCallback(async (disabledIds: Set<number>) => {
    if (disabledIds.size === 0) {
      setResult(null);
      return;
    }
    setSimLoading(true);
    try {
      const r = await api.simulate(Array.from(disabledIds));
      setResult(r);
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimLoading(false);
    }
  }, []);

  // Resolve a deep-linked server name list to ids once servers have loaded,
  // then run the simulation automatically. Runs once.
  useEffect(() => {
    if (!initialServerNames || initialServerNames.length === 0 || servers.length === 0) return;
    const wanted = new Set(initialServerNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const ids = servers
      .filter((s) => wanted.has(s.name.toLowerCase()) || wanted.has(s.name.split(".")[0].toLowerCase()) || wanted.has(s.hostname.toLowerCase()))
      .map((s) => s.id);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setDisabled(idSet);
    runSimulation(idSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  const toggle = (id: number) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      runSimulation(next);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading servers...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
            Failover Simulation
          </h1>
          <p className="text-xs text-noc-text-dim mt-1 font-mono">
            Model the impact of server failures on phone registrations across CMG groups.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="phone-filter" className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim">
            Phone
          </label>
          <input
            id="phone-filter"
            type="text"
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            placeholder="filter by name…"
            className="bg-noc-bg border border-noc-border px-2 py-1 text-xs font-mono text-noc-text-bright placeholder:text-noc-text-dim focus:outline-none focus:border-noc-cyan/50 w-40"
          />
          {phoneFilter && (
            <button
              onClick={() => setPhoneFilter("")}
              className="px-1.5 py-1 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Phone Lookup — shows immediately for ?phone=<name> deep links, before
          any servers are toggled / a simulation has actually run. */}
      {phoneFilter.trim() && (
        <div className="border border-noc-border bg-noc-surface px-4 py-3">
          {phoneStatusLoading && phoneStatus === undefined ? (
            <div className="text-xs font-mono text-noc-text-dim uppercase tracking-widest">
              Looking up "{phoneFilter}"…
            </div>
          ) : phoneStatus === null ? (
            <div className="text-xs font-mono text-noc-text-dim">
              No exact match for <span className="text-noc-text-bright">{phoneFilter}</span>. Once you run a
              simulation below, rows containing this text will be highlighted.
            </div>
          ) : phoneStatus ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-sm text-noc-text-bright">{phoneStatus.phoneName}</span>
                <span
                  className={`font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 ${
                    phoneStatus.health === "ok"
                      ? "bg-noc-green/10 text-noc-green"
                      : phoneStatus.health === "on_backup"
                        ? "bg-noc-amber/10 text-noc-amber"
                        : "bg-noc-red/10 text-noc-red"
                  }`}
                >
                  {phoneStatus.health === "ok" ? "ON PRIMARY" : phoneStatus.health === "on_backup" ? "ON BACKUP" : "DOWN"}
                </span>
                <span className="text-xs font-mono text-noc-text-dim">{phoneStatus.cmGroupName}</span>
                <span className="text-xs font-mono text-noc-text-dim">{phoneStatus.devicePoolName}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {phoneStatus.members.map((m) => (
                  <div
                    key={m.serverId}
                    className={`flex items-center gap-1.5 px-2 py-1 border text-xs font-mono ${
                      phoneStatus.registeredServer === m.serverName ? "border-noc-cyan/40 bg-noc-cyan/5" : "border-noc-border"
                    }`}
                  >
                    <span className="text-noc-text-dim">P{m.priority}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${m.ccmServiceActive ? "bg-noc-green" : "bg-noc-red"}`}
                      title={m.ccmServiceActive ? "CCM service running" : "CCM service down"}
                    />
                    <span className="text-noc-text-bright">{m.serverName.split(".")[0]}</span>
                    {phoneStatus.registeredServer === m.serverName && (
                      <span className="text-noc-cyan text-[10px]">current</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] font-mono text-noc-text-dim uppercase tracking-widest">
                Toggle a server below to preview what happens if it goes down.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Impact Summary — always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className={`font-mono text-3xl font-bold ${result ? "text-noc-cyan" : "text-noc-text-dim"}`}>
            {result ? result.totalPhones.toLocaleString() : "—"}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Total Phones</div>
        </div>
        <div className={`p-4 text-center ${result && result.noImpact > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${result ? "text-noc-green" : "text-noc-text-dim"}`}>
            {result ? result.noImpact.toLocaleString() : "—"}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            No Impact
            {result?.trunkImpact && <span className="normal-case tracking-normal text-noc-text-dim"> / {result.trunkImpact.noImpact} trunks</span>}
            {result?.gatewayImpact && <span className="normal-case tracking-normal text-noc-text-dim"> / {result.gatewayImpact.noImpact} gw</span>}
          </div>
        </div>
        <div className={`p-4 text-center ${result && result.willReRegister > 0 ? "bg-noc-amber/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${result && result.willReRegister > 0 ? "text-noc-amber" : "text-noc-text-dim"}`}>
            {result ? result.willReRegister.toLocaleString() : "—"}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Re-Register
            {result?.trunkImpact && result.trunkImpact.willReRegister > 0 && <span className="normal-case tracking-normal text-noc-amber"> / {result.trunkImpact.willReRegister} trunks</span>}
            {result?.gatewayImpact && result.gatewayImpact.degraded > 0 && <span className="normal-case tracking-normal text-noc-amber"> / {result.gatewayImpact.degraded} gw degraded</span>}
          </div>
        </div>
        <div className={`p-4 text-center ${result && result.unregistered > 0 ? "bg-noc-red/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${result && result.unregistered > 0 ? "text-noc-red" : "text-noc-text-dim"}`}>
            {result ? result.unregistered.toLocaleString() : "—"}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Unregistered
            {result?.trunkImpact && result.trunkImpact.noService > 0 && <span className="normal-case tracking-normal text-noc-red"> / {result.trunkImpact.noService} trunks</span>}
            {result?.gatewayImpact && result.gatewayImpact.noService > 0 && <span className="normal-case tracking-normal text-noc-red"> / {result.gatewayImpact.noService} gw</span>}
          </div>
        </div>
      </div>

      {/* Server Toggles — AG cards with toggle switches */}
      <div className="space-y-0">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim">
            Servers ({ccmServers.length}){disabled.size > 0 && <span className="text-noc-red ml-2">{disabled.size} offline</span>}
          </div>
          {disabled.size > 0 && (
            <button
              onClick={() => {
                setDisabled(new Set());
                setResult(null);
              }}
              className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(() => {
            // Group servers by AG
            const agGroups = new Map<string, Server[]>();
            const ungrouped: Server[] = [];
            for (const server of ccmServers) {
              const ags = serverToAgs.get(server.name.split(".")[0]) || [];
              if (ags.length > 0) {
                for (const ag of ags) {
                  if (!agGroups.has(ag)) agGroups.set(ag, []);
                  if (!agGroups.get(ag)!.some((s) => s.id === server.id)) {
                    agGroups.get(ag)!.push(server);
                  }
                }
              } else {
                ungrouped.push(server);
              }
            }
            const sortedAgs = Array.from(agGroups.entries()).sort((a, b) => {
              const numA = parseInt(a[0].replace(/\D/g, "")) || 0;
              const numB = parseInt(b[0].replace(/\D/g, "")) || 0;
              return numA - numB;
            });
            if (ungrouped.length > 0) sortedAgs.push(["Other", ungrouped]);
            return sortedAgs.map(([agLabel, agServers]) => {
              const offlineCount = agServers.filter((s) => disabled.has(s.id)).length;
              return (
                <div key={agLabel} className="border border-noc-border bg-noc-surface overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-noc-panel border-b border-noc-border">
                    {agLabel !== "Other" ? (
                      <AgBadge label={agLabel} />
                    ) : (
                      <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-noc-text-dim">Other</span>
                    )}
                    {offlineCount > 0 && (
                      <span className="font-mono text-[10px] text-noc-red font-semibold">
                        {offlineCount}/{agServers.length} down
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-noc-border/30">
                    {agServers.map((server) => {
                      const isDisabled = disabled.has(server.id);
                      const isPublisher = server.node_type === "Publisher";
                      return (
                        <button
                          key={server.id}
                          onClick={() => toggle(server.id)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-noc-panel/40 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono text-xs text-noc-text-bright truncate">
                              {server.name.split(".")[0]}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-noc-text-dim">
                              {isPublisher ? "pub" : "sub"}
                            </span>
                          </div>
                          {/* Toggle switch */}
                          <div
                            className={`relative w-16 h-6 shrink-0 rounded border transition-colors ${
                              isDisabled ? "bg-noc-bg border-noc-red/30" : "bg-noc-bg border-noc-green/30"
                            }`}
                          >
                            <div
                              className={`absolute top-0.5 bottom-0.5 w-[30px] rounded-sm transition-all duration-200 ease-in-out ${
                                isDisabled
                                  ? "left-0.5 bg-noc-red"
                                  : "left-[31px] bg-noc-green"
                              }`}
                            />
                            <div className="relative z-10 flex h-full">
                              <div className={`w-1/2 flex items-center justify-center font-mono text-[8px] font-bold uppercase tracking-wider select-none transition-colors ${
                                isDisabled ? "text-noc-bg" : "text-noc-text-dim"
                              }`}>
                                off
                              </div>
                              <div className={`w-1/2 flex items-center justify-center font-mono text-[8px] font-bold uppercase tracking-wider select-none transition-colors ${
                                !isDisabled ? "text-noc-bg" : "text-noc-text-dim"
                              }`}>
                                on
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
        {nonCcmCount > 0 && (
          <p className="text-[10px] font-mono text-noc-text-dim uppercase tracking-widest mt-2">
            {nonCcmCount} non-CCM nodes hidden (no impact on phone registration)
          </p>
        )}
      </div>

      {/* Results */}
      {simLoading && (
        <div className="flex items-center justify-center py-4">
          <div className="inline-block w-4 h-4 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <span className="text-noc-text-dim text-xs font-mono ml-2 uppercase tracking-widest">
            Calculating...
          </span>
        </div>
      )}
      {result && !simLoading && (
        <>
          {/* Per-CMG Breakdown */}
          <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
            <div className="tmux-title text-noc-cyan">
              Phone Impact by CMG ({result.details.length} groups)
            </div>
            <div className="divide-y divide-noc-border/50">
              {result.details.map((d) => (
                <CmgImpactRow key={d.cmGroupId} detail={d} cmgToAg={cmgToAg} phoneFilter={phoneFilter} />
              ))}
            </div>
          </div>

          {/* Trunk Impact — same accordion style as CMG rows */}
          {result.trunkImpact && result.trunkImpact.totalTrunks > 0 && (
            <TrunkImpactSection trunkImpact={result.trunkImpact} cmgToAg={cmgToAg} />
          )}

          {result.gatewayImpact && result.gatewayImpact.totalGateways > 0 && (
            <GatewayImpactSection gatewayImpact={result.gatewayImpact} cmgToAg={cmgToAg} />
          )}

          {result.serviceImpacts && result.serviceImpacts.length > 0 && (
            <ServiceImpactSection serviceImpacts={result.serviceImpacts} />
          )}
        </>
      )}

    </div>
  );
}

function CmgImpactRow({
  detail,
  cmgToAg,
  phoneFilter,
}: {
  detail: SimulationResult["details"][0];
  cmgToAg: Map<string, string>;
  phoneFilter?: string;
}) {
  const needle = (phoneFilter || "").trim().toLowerCase();
  const hasMatch = needle.length > 0 && detail.movements.some((m) => m.phoneName.toLowerCase().includes(needle));
  const [expanded, setExpanded] = useState(false);

  // Auto-expand once when a deep-linked/typed phone filter matches a phone in this group.
  useEffect(() => {
    if (hasMatch) setExpanded(true);
  }, [hasMatch]);

  const hasImpact = detail.willReRegister > 0 || detail.unregistered > 0;
  const agLabel = cmgToAg.get(detail.cmGroupName);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-noc-panel/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 ${
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
          {agLabel && <AgBadge label={agLabel} />}
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-noc-text-dim">{detail.totalPhones.toLocaleString()} phones</span>
          {detail.willReRegister > 0 && (
            <span className="text-noc-amber">
              {detail.willReRegister.toLocaleString()} re-reg
            </span>
          )}
          {detail.unregistered > 0 && (
            <span className="text-noc-red">{detail.unregistered.toLocaleString()} down</span>
          )}
          {!hasImpact && <span className="text-noc-green">no impact</span>}
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
        <div className="px-4 pb-4 space-y-4">
          {/* Subnet Impact Summary */}
          {detail.subnetImpacts && detail.subnetImpacts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {[...detail.subnetImpacts]
                .sort((a, b) => b.totalPhones - a.totalPhones)
                .map((si) => {
                  const affected = si.willReRegister + si.unregistered;
                  const pct = si.totalPhones > 0 ? Math.round((affected / si.totalPhones) * 100) : 0;
                  const reRegPct = si.totalPhones > 0 ? (si.willReRegister / si.totalPhones) * 100 : 0;
                  const unregPct = si.totalPhones > 0 ? (si.unregistered / si.totalPhones) * 100 : 0;
                  const okPct = si.totalPhones > 0 ? (si.noImpact / si.totalPhones) * 100 : 0;
                  const borderColor = pct === 0 ? "border-noc-green/20" : pct === 100 ? "border-noc-red/30" : "border-noc-amber/30";
                  return (
                    <div key={si.subnetName} className={`border ${borderColor} bg-noc-bg px-4 py-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-medium text-noc-text-bright truncate">{si.subnetName}</div>
                          <div className="font-mono text-[10px] text-noc-text-dim">{si.cidr}</div>
                        </div>
                        <span className={`font-mono text-lg font-bold shrink-0 ml-3 ${
                          pct === 0 ? "text-noc-green" : pct === 100 ? "text-noc-red" : "text-noc-amber"
                        }`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 bg-noc-panel flex overflow-hidden mb-2">
                        {okPct > 0 && <div className="h-full bg-noc-green/40" style={{ width: `${okPct}%` }} />}
                        {reRegPct > 0 && <div className="h-full bg-noc-amber" style={{ width: `${reRegPct}%` }} />}
                        {unregPct > 0 && <div className="h-full bg-noc-red" style={{ width: `${unregPct}%` }} />}
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[10px]">
                        <span className="text-noc-green">{si.noImpact} ok</span>
                        {si.willReRegister > 0 && <span className="text-noc-amber">{si.willReRegister} re-reg</span>}
                        {si.unregistered > 0 && <span className="text-noc-red">{si.unregistered} down</span>}
                        <span className="text-noc-text-dim ml-auto">{si.totalPhones} total</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Phone Movement Table */}
          <div className="overflow-x-auto border border-noc-border/50">
            <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-noc-border/50 bg-noc-panel/50 text-noc-text-dim">
                  <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Phone</th>
                  <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Current</th>
                  <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">New Server</th>
                  <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Subnet</th>
                  <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Impact</th>
                </tr>
              </thead>
              <tbody>
                {detail.movements.map((m) => {
                  const isMatch = needle.length > 0 && m.phoneName.toLowerCase().includes(needle);
                  return (
                  <tr
                    key={m.phoneName}
                    className={`border-b border-noc-border/30 hover:bg-noc-panel/30 transition-colors ${isMatch ? "bg-noc-cyan/10 outline outline-1 outline-noc-cyan/40 -outline-offset-1" : ""}`}
                  >
                    <td className="px-4 py-2 text-noc-text-bright truncate">{m.phoneName}</td>
                    <td className="px-4 py-2 text-noc-text-dim truncate">
                      {m.currentServer ? m.currentServer.split(".")[0] : "—"}
                    </td>
                    <td className="px-4 py-2 text-noc-text-dim truncate">
                      {m.newServer ? m.newServer.split(".")[0] : "—"}
                    </td>
                    <td className="px-4 py-2 text-noc-cyan truncate">{m.subnetName || "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                          m.impact === "no_change"
                            ? "bg-noc-green/10 text-noc-green"
                            : m.impact === "re_register"
                              ? "bg-noc-amber/10 text-noc-amber"
                              : "bg-noc-red/10 text-noc-red"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 ${
                          m.impact === "no_change"
                            ? "bg-noc-green"
                            : m.impact === "re_register"
                              ? "bg-noc-amber"
                              : "bg-noc-red"
                        }`} />
                        {m.impact === "no_change"
                          ? "OK"
                          : m.impact === "re_register"
                            ? "RE-REG"
                            : "DOWN"}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TrunkImpactSection({ trunkImpact, cmgToAg }: { trunkImpact: TrunkImpact; cmgToAg: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full tmux-title text-noc-cyan flex items-center justify-between cursor-pointer hover:bg-noc-panel/80 transition-colors"
      >
        <span>SIP Trunk Impact ({trunkImpact.totalTrunks} trunks)</span>
        <div className="flex items-center gap-4 text-xs font-mono normal-case tracking-normal">
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
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-px bg-noc-border">
            <div className="bg-noc-green/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-green">{trunkImpact.noImpact}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Full Service</div>
            </div>
            <div className="bg-noc-amber/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-amber">{trunkImpact.willReRegister}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Will Re-Register</div>
            </div>
            <div className="bg-noc-red/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-red">{trunkImpact.noService}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">No Service</div>
            </div>
          </div>

          {(trunkImpact.willReRegister > 0 || trunkImpact.noService > 0) && (
            <div className="overflow-x-auto border border-noc-border/50">
              <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="border-b border-noc-border/50 bg-noc-panel/50 text-noc-text-dim">
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Trunk</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Description</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">CMG</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Current</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">New Server</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {trunkImpact.movements
                    .filter((m) => m.impact !== "no_change")
                    .map((m) => (
                      <tr key={m.trunkName} className="border-b border-noc-border/30 hover:bg-noc-panel/30 transition-colors">
                        <td className="px-4 py-2 text-noc-text-bright truncate">{m.trunkName}</td>
                        <td className="px-4 py-2 text-noc-text-dim truncate">{m.description || "—"}</td>
                        <td className="px-4 py-2 text-noc-text truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {m.cmGroupName}
                            {cmgToAg.get(m.cmGroupName) && <AgBadge label={cmgToAg.get(m.cmGroupName)!} />}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-noc-text-dim truncate">
                          {m.currentServer ? m.currentServer.split(".")[0] : "—"}
                        </td>
                        <td className="px-4 py-2 text-noc-text-dim truncate">
                          {m.newServer ? m.newServer.split(".")[0] : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                            m.impact === "re_register"
                              ? "bg-noc-amber/10 text-noc-amber"
                              : "bg-noc-red/10 text-noc-red"
                          }`}>
                            <span className={`w-1.5 h-1.5 ${
                              m.impact === "re_register" ? "bg-noc-amber" : "bg-noc-red"
                            }`} />
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

function GatewayImpactSection({ gatewayImpact, cmgToAg }: { gatewayImpact: GatewayImpact; cmgToAg: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full tmux-title text-noc-cyan flex items-center justify-between cursor-pointer hover:bg-noc-panel/80 transition-colors"
      >
        <span>MGCP Gateway Impact ({gatewayImpact.totalGateways} gateways)</span>
        <div className="flex items-center gap-4 text-xs font-mono normal-case tracking-normal">
          {gatewayImpact.noImpact > 0 && (
            <span className="text-noc-green">{gatewayImpact.noImpact} ok</span>
          )}
          {gatewayImpact.degraded > 0 && (
            <span className="text-noc-amber">{gatewayImpact.degraded} degraded</span>
          )}
          {gatewayImpact.noService > 0 && (
            <span className="text-noc-red">{gatewayImpact.noService} no service</span>
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
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-px bg-noc-border">
            <div className="bg-noc-green/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-green">{gatewayImpact.noImpact}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Full Service</div>
            </div>
            <div className="bg-noc-amber/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-amber">{gatewayImpact.degraded}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">Degraded</div>
            </div>
            <div className="bg-noc-red/5 p-4 text-center">
              <div className="font-mono text-2xl font-bold text-noc-red">{gatewayImpact.noService}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1 text-noc-text-dim">No Service</div>
            </div>
          </div>

          {(gatewayImpact.degraded > 0 || gatewayImpact.noService > 0) && (
            <div className="overflow-x-auto border border-noc-border/50">
              <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="border-b border-noc-border/50 bg-noc-panel/50 text-noc-text-dim">
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Gateway</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Domain</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">CMG</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Endpoints</th>
                    <th className="text-left px-4 py-2 font-medium text-[10px] uppercase tracking-widest">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {gatewayImpact.movements
                    .filter((m) => m.impact !== "no_change")
                    .map((m) => (
                      <tr key={m.gatewayName} className="border-b border-noc-border/30 hover:bg-noc-panel/30 transition-colors">
                        <td className="px-4 py-2 text-noc-text-bright truncate">{m.gatewayName}</td>
                        <td className="px-4 py-2 text-noc-text-dim truncate">{m.domainName || "—"}</td>
                        <td className="px-4 py-2 text-noc-text truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {m.cmGroupName}
                            {cmgToAg.get(m.cmGroupName) && <AgBadge label={cmgToAg.get(m.cmGroupName)!} />}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`font-bold ${
                            m.newCount === 0 ? "text-noc-red" : m.newCount < m.currentCount ? "text-noc-amber" : "text-noc-green"
                          }`}>
                            {m.currentCount}/3 → {m.newCount}/3
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                            m.impact === "degraded"
                              ? "bg-noc-amber/10 text-noc-amber"
                              : "bg-noc-red/10 text-noc-red"
                          }`}>
                            <span className={`w-1.5 h-1.5 ${
                              m.impact === "degraded" ? "bg-noc-amber" : "bg-noc-red"
                            }`} />
                            {m.impact === "degraded" ? "DEGRADED" : "NO SVC"}
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

function ServiceImpactSection({ serviceImpacts }: { serviceImpacts: ServiceImpact[] }) {
  const outageCount = serviceImpacts.filter((s) => s.impact === "outage").length;

  return (
    <div className={`border bg-noc-surface overflow-hidden ${
      outageCount > 0 ? "border-noc-red/50" : "border-noc-border"
    }`}>
      <div className="tmux-title text-noc-cyan flex items-center justify-between">
        <span>Service Impact ({serviceImpacts.length} services)</span>
        <div className="flex items-center gap-4 text-xs font-mono normal-case tracking-normal">
          {outageCount > 0 && (
            <span className="text-noc-red font-bold">{outageCount} OUTAGE</span>
          )}
          {outageCount === 0 && (
            <span className="text-noc-green">all operational</span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {serviceImpacts.map((s) => (
            <div
              key={s.serviceName}
              className={`border p-3 ${
                s.impact === "outage"
                  ? "border-noc-red/40 bg-noc-red/5"
                  : "border-noc-border bg-noc-bg"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-noc-text-bright">
                  {s.displayName}
                  {s.sgLabel && <SgBadge label={s.sgLabel} />}
                </span>
                <span className={`font-mono text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 ${
                  s.impact === "outage"
                    ? "bg-noc-red/20 text-noc-red"
                    : "text-noc-green"
                }`}>
                  {s.impact === "outage" ? "OUTAGE" : "OK"}
                </span>
              </div>
              <div className="font-mono text-[10px] text-noc-text-dim">
                {s.currentActive}/{s.totalServers} active → {s.newActive}/{s.totalServers}
              </div>
              {/* Mini bar */}
              <div className="flex gap-0.5 mt-2">
                {Array.from({ length: s.totalServers }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 ${
                      i < s.newActive
                        ? "bg-noc-green"
                        : i < s.currentActive
                          ? "bg-noc-red/60"
                          : "bg-noc-text-dim/20"
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
