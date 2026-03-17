import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { api } from "../api/client";
import type { Server, CmGroup, PhonesResponse, PollStatus, RegStat, FailoverEntry, FailoverDetail, ReportSummary } from "../api/client";
import ServerCard from "../components/ServerCard";
import CmGroupTable from "../components/CmGroupTable";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [groups, setGroups] = useState<CmGroup[]>([]);
  const [phones, setPhones] = useState<PhonesResponse | null>(null);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [regStats, setRegStats] = useState<RegStat[]>([]);
  const [failover, setFailover] = useState<FailoverEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [activeNodeIdx, setActiveNodeIdx] = useState(-1); // -1 = rollup view
  const { serverToAgs, cmgToAg } = useAvailabilityGroups();

  const fetchAll = async () => {
    try {
      const [s, g, p, ps, rs, fo, rpt] = await Promise.all([
        api.getServers(),
        api.getCmGroups(),
        api.getPhones(50000, 0),
        api.getPollStatus(),
        api.getRegStats().catch(() => []),
        api.getFailoverStatus().catch(() => []),
        api.getReportSummary().catch(() => null),
      ]);
      setServers(s);
      setGroups(g);
      setPhones(p);
      setPollStatus(ps);
      setRegStats(rs);
      setFailover(fo);
      setReportSummary(rpt);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const socket = io();
    socket.on("registration:updated", () => {
      setPolling(false);
      fetchAll();
    });
    return () => { socket.disconnect(); };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.sync();
      await fetchAll();
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setSyncing(false);
    }
  };

  // Count phones per CMG
  const phoneCounts = new Map<string, number>();
  if (phones) {
    for (const p of phones.phones) {
      phoneCounts.set(p.cm_group_name, (phoneCounts.get(p.cm_group_name) || 0) + 1);
    }
  }

  // Count phones per server from reg stats
  const serverPhoneCounts = new Map<string, number>();
  for (const rs of regStats) {
    if (rs.server_name && rs.status === "Registered") {
      serverPhoneCounts.set(
        rs.server_name,
        (serverPhoneCounts.get(rs.server_name) || 0) + rs.count
      );
    }
  }

  const ccmActiveCount = servers.filter((s) => s.ccm_service_active === 1).length;
  const totalRegistered = regStats.filter((r) => r.status === "Registered").reduce((s, r) => s + r.count, 0);

  // Separate CCM-active servers from others for display priority
  const ccmServers = servers.filter((s) => s.ccm_service_active === 1);
  const otherServers = servers.filter((s) => s.ccm_service_active !== 1);
  const allDisplayServers = [...ccmServers, ...otherServers];

  // -1 = rollup, 0+ = specific server
  const isRollup = activeNodeIdx === -1;
  const clampedIdx = isRollup ? -1 : Math.min(activeNodeIdx, allDisplayServers.length - 1);
  const activeServer = isRollup ? null : allDisplayServers[clampedIdx];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading telemetry...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          {isRollup ? (
            <>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 ${ccmActiveCount === ccmServers.length ? "bg-noc-green animate-pulse-green" : "bg-noc-amber animate-pulse-red"}`} />
                <span className="text-xs font-mono text-noc-text-dim uppercase tracking-widest">
                  {ccmActiveCount === ccmServers.length ? "All Systems Online" : `${ccmActiveCount}/${ccmServers.length} CCM Active`}
                </span>
              </div>
              {pollStatus?.lastPollTime && (
                <p className="text-[10px] font-mono text-noc-text-dim mt-1 ml-5">
                  Last poll: {new Date(pollStatus.lastPollTime).toLocaleString()}
                  {totalRegistered > 0 && <> — {totalRegistered.toLocaleString()} registered</>}
                </p>
              )}
            </>
          ) : activeServer && (
            <>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 ${activeServer.ccm_service_active === 1 ? "bg-noc-green animate-pulse-green" : "bg-noc-red animate-pulse-red"}`} />
                <span className="text-xs font-mono text-noc-text-bright uppercase tracking-widest">
                  {activeServer.name.split(".")[0]}
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                  {activeServer.node_type === "Publisher" ? "PUB" : "SUB"}
                </span>
                <span className={`text-[10px] font-mono font-semibold uppercase ${activeServer.ccm_service_active === 1 ? "text-noc-green" : "text-noc-red"}`}>
                  {activeServer.ccm_service_active === 1 ? "CCM Active" : "CCM Inactive"}
                </span>
                {(serverToAgs.get(activeServer.name.split(".")[0]) || []).map((label) => (
                  <AgBadge key={label} label={label} />
                ))}
              </div>
              <p className="text-[10px] font-mono text-noc-text-dim mt-1 ml-5">
                {activeServer.hostname}
                {serverPhoneCounts.get(activeServer.name) != null && (
                  <> — {serverPhoneCounts.get(activeServer.name)!.toLocaleString()} phones registered</>
                )}
                {activeServer.last_checked_at && (
                  <> — checked {new Date(activeServer.last_checked_at + "Z").toLocaleTimeString()}</>
                )}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setPolling(true);
              try {
                await api.triggerPoll();
              } catch (e: any) {
                if (e?.message?.includes("409")) {
                  // already in progress
                }
              } finally {
                setPolling(true); // stays true until socket event fires
              }
            }}
            disabled={polling || pollStatus?.pollInProgress}
            className="px-4 py-1.5 border border-noc-border bg-noc-panel text-xs font-mono uppercase tracking-widest text-noc-text hover:border-noc-cyan/50 hover:text-noc-cyan transition-all disabled:opacity-50 cursor-pointer"
          >
            {polling || pollStatus?.pollInProgress ? "Polling..." : "Poll RISPort"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-1.5 border border-noc-border bg-noc-panel text-xs font-mono uppercase tracking-widest text-noc-text hover:border-noc-amber/50 hover:text-noc-amber transition-all disabled:opacity-50 cursor-pointer"
          >
            {syncing ? "Syncing..." : "Sync AXL"}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-noc-border">
        {isRollup ? (
          <>
            <StatBox label="Total Phones" value={phones?.total || 0} color="amber" />
            <StatBox label="CM Groups" value={groups.length} color="blue" />
            <StatBox label="Total Nodes" value={servers.length} color="cyan" />
            <StatBox label="CCM Active" value={ccmActiveCount} color="green" />
            <StatBox label="Failed Over" value={failover.reduce((s, f) => s + f.count, 0)} color={failover.length > 0 ? "amber" : "green"} />
          </>
        ) : activeServer && (() => {
          const serverName = activeServer.name;
          const nodePhones = serverPhoneCounts.get(serverName) || 0;
          const nodeCmgs = groups.filter((g) =>
            g.members.some((m) => m.server_name === serverName)
          );
          const nodeFailover = failover
            .filter((f) => f.registered_server === serverName || f.primary_server === serverName)
            .reduce((s, f) => s + f.count, 0);
          const isPrimary = nodeCmgs.filter((g) =>
            g.members.some((m) => m.server_name === serverName && m.priority === 1)
          ).length;
          return (
            <>
              <StatBox label="Registered Phones" value={nodePhones} color="amber" />
              <StatBox label="CM Groups" value={nodeCmgs.length} color="blue" />
              <StatBox label="Primary For" value={isPrimary} color="cyan" />
              <StatBox label="CCM Active" value={activeServer.ccm_service_active} color={activeServer.ccm_service_active === 1 ? "green" : "red"} />
              <StatBox label="Failed Over" value={nodeFailover} color={nodeFailover > 0 ? "amber" : "green"} />
            </>
          );
        })()}
      </div>

      {/* ─── Tabbed Server Pane ─── */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
        {/* Tab bar — tmux window tabs for each server */}
        <div className="flex items-center bg-noc-panel border-b border-noc-border overflow-x-auto">
          <span className="tmux-status-section text-noc-text-dim text-[10px] uppercase tracking-widest border-r border-noc-border shrink-0">
            Nodes ({allDisplayServers.length})
          </span>
          <button
            onClick={() => setActiveNodeIdx(-1)}
            className={`tmux-tab text-[10px] flex items-center gap-1.5 shrink-0 ${
              isRollup ? "active" : "text-noc-text-dim"
            }`}
          >
            All{isRollup ? "*" : ""}
          </button>
          {allDisplayServers.map((s, i) => {
            const active = s.ccm_service_active === 1;
            const isCurrent = i === clampedIdx;
            return (
              <button
                key={s.id}
                onClick={() => setActiveNodeIdx(i)}
                className={`tmux-tab text-[10px] flex items-center gap-1.5 shrink-0 ${
                  isCurrent ? "active" : "text-noc-text-dim"
                }`}
              >
                <span className={`w-1.5 h-1.5 shrink-0 ${
                  active ? "bg-noc-green" : "bg-noc-red"
                }`} />
                {s.name.split(".")[0]}
                {isCurrent ? "*" : ""}
              </button>
            );
          })}
        </div>

        {/* Pane content */}
        {isRollup ? (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-noc-border">
              {allDisplayServers.map((s) => {
                const active = s.ccm_service_active === 1;
                const isPublisher = s.node_type === "Publisher";
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveNodeIdx(allDisplayServers.indexOf(s))}
                    className="bg-noc-surface hover:bg-noc-panel/50 transition-colors cursor-pointer text-left px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 shrink-0 ${active ? "bg-noc-green" : "bg-noc-red"}`} />
                        <span className="font-mono text-sm font-medium text-noc-text-bright truncate">
                          {s.name.split(".")[0]}
                        </span>
                        <span className="shrink-0 px-1 py-0.5 text-[8px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {isPublisher ? "PUB" : "SUB"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`font-mono text-[10px] font-semibold uppercase ${active ? "text-noc-green" : "text-noc-red"}`}>
                        {active ? "CCM Active" : "Inactive"}
                      </span>
                    </div>
                    {(serverToAgs.get(s.name.split(".")[0]) || []).length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        {serverToAgs.get(s.name.split(".")[0])!.map((label) => (
                          <AgBadge key={label} label={label} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : activeServer && (() => {
          const sbd = reportSummary?.serverBreakdown.find((s) => s.server_name === activeServer.name) || null;
          return (
          <ServerCard
            server={activeServer}
            phoneCount={serverPhoneCounts.get(activeServer.name)}
            activeStats={sbd}
            groups={groups}
            failover={failover}
          />
          );
        })()}
      </div>

      {/* Failover Status */}
      <FailoverPane failover={failover} cmgToAg={cmgToAg} />

      {/* CMG Table */}
      <CmGroupTable groups={groups} phoneCounts={phoneCounts} cmgToAg={cmgToAg} />
    </div>
  );
}

type FailoverSortKey = "cmg" | "registered" | "primary" | "priority" | "count";
type DetailSortKey = "phone" | "model" | "pool" | "ip";

function FailoverPane({ failover, cmgToAg }: { failover: FailoverEntry[]; cmgToAg: Map<string, string> }) {
  const { sort, toggle, sorted } = useSort<FailoverSortKey>({ key: "count", dir: "desc" });
  const { sort: detailSort, toggle: toggleDetail, sorted: sortedDetails } = useSort<DetailSortKey>();
  const [modalRow, setModalRow] = useState<FailoverEntry | null>(null);
  const [details, setDetails] = useState<FailoverDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const totalFailedOver = failover.reduce((s, f) => s + f.count, 0);

  const openModal = async (row: FailoverEntry) => {
    setModalRow(row);
    setDetailsLoading(true);
    try {
      const all = await api.getFailoverDetails();
      const filtered = all.filter(
        (d) =>
          d.cm_group_name === row.cm_group_name &&
          d.registered_server === row.registered_server
      );
      setDetails(filtered);
    } catch {
      setDetails([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  if (failover.length === 0) {
    return (
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-green">Failover Status</div>
        <div className="p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-noc-green" />
            <span className="font-mono text-sm text-noc-green font-semibold">
              All phones on primary server
            </span>
          </div>
          <p className="font-mono text-[10px] text-noc-text-dim mt-2 uppercase tracking-widest">
            No phones registered to backup CMG members
          </p>
        </div>
      </div>
    );
  }

  const rows = sorted(failover, (f, k) => {
    switch (k) {
      case "cmg": return f.cm_group_name;
      case "registered": return f.registered_server;
      case "primary": return f.primary_server;
      case "priority": return f.registered_priority ?? 99;
      case "count": return f.count;
    }
  });

  return (
    <>
      <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
        <div className="tmux-title text-noc-amber flex items-center justify-between">
          <span>Failover Status</span>
          <span className="font-mono text-[10px] text-noc-amber normal-case tracking-normal font-bold">
            {totalFailedOver.toLocaleString()} phones on backup servers
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                <ColHeader label="CM Group" sortKey="cmg" sort={sort} onSort={toggle} />
                <ColHeader label="Registered To" sortKey="registered" sort={sort} onSort={toggle} />
                <ColHeader label="Should Be" sortKey="primary" sort={sort} onSort={toggle} />
                <ColHeader label="Priority" sortKey="priority" sort={sort} onSort={toggle} align="center" />
                <ColHeader label="Phones" sortKey="count" sort={sort} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr
                  key={i}
                  onClick={() => openModal(f)}
                  className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-noc-text-bright truncate">
                    <span className="inline-flex items-center gap-1.5">
                      {f.cm_group_name}
                      {cmgToAg.get(f.cm_group_name) && <AgBadge label={cmgToAg.get(f.cm_group_name)!} />}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-noc-amber truncate">
                    {f.registered_server.split(".")[0]}
                  </td>
                  <td className="px-4 py-2.5 text-noc-text-dim truncate">
                    {f.primary_server.split(".")[0]}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-5 text-[10px] font-bold ${
                      f.registered_priority === 2
                        ? "bg-noc-blue/10 text-noc-blue"
                        : f.registered_priority === 3
                          ? "bg-noc-amber/10 text-noc-amber"
                          : "bg-noc-red/10 text-noc-red"
                    }`}>
                      {f.registered_priority != null ? `P${f.registered_priority}` : "?"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-noc-amber">
                    {f.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failover Detail Modal */}
      {modalRow && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
          onClick={() => setModalRow(null)}
        >
          <div
            className="bg-noc-surface border border-noc-border w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tmux-title text-noc-amber flex items-center justify-between">
              <span className="flex items-center gap-2">
                Failover Phones — {modalRow.cm_group_name}
                {cmgToAg.get(modalRow.cm_group_name) && (
                  <AgBadge label={cmgToAg.get(modalRow.cm_group_name)!} />
                )}
              </span>
              <button
                onClick={() => setModalRow(null)}
                className="px-2 py-0.5 font-mono text-[10px] text-noc-text-dim hover:text-noc-text transition-colors cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="px-4 py-3 border-b border-noc-border flex items-center gap-6 text-xs font-mono">
              <span className="text-noc-text-dim">
                Registered to <span className="text-noc-amber font-semibold">{modalRow.registered_server.split(".")[0]}</span>
              </span>
              <span className="text-noc-text-dim">
                Should be on <span className="text-noc-text-bright font-semibold">{modalRow.primary_server.split(".")[0]}</span>
              </span>
              <span className={`inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-bold ${
                modalRow.registered_priority === 2
                  ? "bg-noc-blue/10 text-noc-blue"
                  : modalRow.registered_priority === 3
                    ? "bg-noc-amber/10 text-noc-amber"
                    : "bg-noc-red/10 text-noc-red"
              }`}>
                {modalRow.registered_priority != null ? `P${modalRow.registered_priority}` : "?"}
              </span>
              <span className="text-noc-amber font-bold ml-auto">
                {modalRow.count} phone{modalRow.count !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="overflow-auto flex-1">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block w-6 h-6 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
                </div>
              ) : details.length === 0 ? (
                <div className="text-center py-8 font-mono text-xs text-noc-text-dim">
                  No phone details available
                </div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim sticky top-0">
                      <ColHeader label="Phone" sortKey="phone" sort={detailSort} onSort={toggleDetail} className="bg-noc-surface" />
                      <ColHeader label="Model" sortKey="model" sort={detailSort} onSort={toggleDetail} className="bg-noc-surface" />
                      <ColHeader label="Device Pool" sortKey="pool" sort={detailSort} onSort={toggleDetail} className="bg-noc-surface" />
                      <ColHeader label="IP Address" sortKey="ip" sort={detailSort} onSort={toggleDetail} className="bg-noc-surface" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDetails(details, (d, k) => {
                      switch (k) {
                        case "phone": return d.phone_name;
                        case "model": return d.model;
                        case "pool": return d.device_pool_name;
                        case "ip": return d.ip_address || "";
                      }
                    }).map((d, i) => (
                      <tr key={i} className="border-b border-noc-border/30 hover:bg-noc-panel/30 transition-colors">
                        <td className="px-4 py-2 text-noc-text-bright">{d.phone_name}</td>
                        <td className="px-4 py-2 text-noc-text">{d.model}</td>
                        <td className="px-4 py-2 text-noc-text">{d.device_pool_name}</td>
                        <td className="px-4 py-2 text-noc-text tabular-nums">{d.ip_address || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatBox({
  label,
  value,
  color,
  subLabel,
}: {
  label: string;
  value: number;
  color: "amber" | "blue" | "cyan" | "green" | "red";
  subLabel?: string;
}) {
  const colors = {
    amber: "text-noc-amber",
    blue: "text-noc-blue",
    cyan: "text-noc-cyan",
    green: "text-noc-green",
    red: "text-noc-red",
  };

  return (
    <div className="bg-noc-surface p-4 text-center">
      <div className={`font-mono text-3xl font-bold ${colors[color]}`}>
        {subLabel || value.toLocaleString()}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
        {label}
      </div>
    </div>
  );
}
