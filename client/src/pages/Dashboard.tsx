import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Server, CmGroup, PhonesResponse, PollStatus, RegStat } from "../api/client";
import ServerCard from "../components/ServerCard";
import CmGroupTable from "../components/CmGroupTable";

export default function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [groups, setGroups] = useState<CmGroup[]>([]);
  const [phones, setPhones] = useState<PhonesResponse | null>(null);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [regStats, setRegStats] = useState<RegStat[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [s, g, p, ps, rs] = await Promise.all([
        api.getServers(),
        api.getCmGroups(),
        api.getPhones(50000, 0),
        api.getPollStatus(),
        api.getRegStats().catch(() => []),
      ]);
      setServers(s);
      setGroups(g);
      setPhones(p);
      setPollStatus(ps);
      setRegStats(rs);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
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

  // Separate CCM-active servers from others for display priority
  const ccmServers = servers.filter((s) => s.ccm_service_active === 1);
  const otherServers = servers.filter((s) => s.ccm_service_active !== 1);

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
    <div className="space-y-12 animate-fade-in-up">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-noc-green animate-pulse-green" />
            <span className="text-xs font-mono text-noc-text-dim uppercase tracking-widest">
              System Online
            </span>
          </div>
          {pollStatus?.lastPollTime && (
            <p className="text-[10px] font-mono text-noc-text-dim mt-1 ml-5">
              Last poll: {new Date(pollStatus.lastPollTime).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-5 py-2.5 rounded-lg border border-noc-border bg-noc-panel text-xs font-mono uppercase tracking-widest text-noc-text hover:border-noc-amber/50 hover:text-noc-amber transition-all disabled:opacity-50 cursor-pointer"
        >
          {syncing ? "Syncing..." : "Sync AXL"}
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatBox label="Total Phones" value={phones?.total || 0} color="amber" />
        <StatBox label="CM Groups" value={groups.length} color="blue" />
        <StatBox label="Total Nodes" value={servers.length} color="cyan" />
        <StatBox label="CCM Active" value={ccmActiveCount} color="green" />
      </div>

      {/* Server Status */}
      <div>
        {/* CCM Active Servers */}
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-4">
          Call Manager Nodes ({ccmServers.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 mb-8">
          {ccmServers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              phoneCount={serverPhoneCounts.get(s.name)}
            />
          ))}
        </div>

        {/* Other Servers */}
        {otherServers.length > 0 && (
          <>
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-text-dim mb-4">
              Other Nodes ({otherServers.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {otherServers.map((s) => (
                <ServerCard
                  key={s.id}
                  server={s}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* CMG Table */}
      <CmGroupTable groups={groups} phoneCounts={phoneCounts} />
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
  color: "amber" | "blue" | "cyan" | "green";
}) {
  const colors = {
    amber: "text-noc-amber border-noc-amber/15",
    blue: "text-noc-blue border-noc-blue/15",
    cyan: "text-noc-cyan border-noc-cyan/15",
    green: "text-noc-green border-noc-green/15",
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
