import type { Server, FailoverEntry, CmGroup } from "../api/client";
import StatusIndicator from "./StatusIndicator";

interface Props {
  server: Server;
  phoneCount?: number;
  compact?: boolean;
  groups?: CmGroup[];
  failover?: FailoverEntry[];
}

export default function ServerCard({ server, phoneCount, compact, groups, failover }: Props) {
  const active = server.ccm_service_active === 1;
  const isPublisher = server.node_type === "Publisher";

  if (compact) {
    return (
      <div
        className={`relative overflow-hidden border px-4 py-3 transition-all duration-300 ${
          active
            ? "border-noc-green/20 bg-noc-surface"
            : "border-noc-border bg-noc-surface/50"
        }`}
      >
        <div
          className={`absolute top-0 left-0 right-0 h-px ${
            active
              ? "bg-gradient-to-r from-transparent via-noc-green/60 to-transparent"
              : ""
          }`}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <StatusIndicator active={active} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-noc-text-bright truncate">
                  {server.name.split(".")[0]}
                </span>
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                  {isPublisher ? "PUB" : "SUB"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {phoneCount !== undefined && (
              <span className="font-mono text-xs text-noc-amber font-semibold">
                {phoneCount}
              </span>
            )}
            <span
              className={`font-mono text-[10px] font-semibold uppercase ${
                active ? "text-noc-green" : "text-noc-text-dim"
              }`}
            >
              {active ? "CCM" : "---"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Full pane content view (used inside tabbed window)
  return (
    <div className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest mb-2 bg-noc-border text-noc-text-dim">
            {isPublisher ? "PUB" : "SUB"}
          </span>
          <h3 className="font-mono text-lg font-medium text-noc-text-bright">
            {server.name.split(".")[0]}
          </h3>
        </div>
        <StatusIndicator active={active} size="lg" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
        <div className="bg-noc-surface px-4 py-3">
          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">FQDN</div>
          <div className="font-mono text-xs text-noc-text-bright truncate" title={server.hostname}>
            {server.hostname}
          </div>
        </div>
        <div className="bg-noc-surface px-4 py-3">
          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">CCM SVC</div>
          <div className={`font-mono text-xs font-semibold ${active ? "text-noc-green" : "text-noc-red"}`}>
            {active ? "STARTED" : "STOPPED"}
          </div>
        </div>
        <div className="bg-noc-surface px-4 py-3">
          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">PRIMARY FOR</div>
          <div className="font-mono text-xs text-noc-cyan font-semibold">
            {groups ? groups.filter((g) => g.members.some((m) => m.server_name === server.name && m.priority === 1)).length : 0} CMGs
          </div>
        </div>
        <div className="bg-noc-surface px-4 py-3">
          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">FAILOVER</div>
          {(() => {
            const count = failover ? failover.filter((f) => f.registered_server === server.name).reduce((s, f) => s + f.count, 0) : 0;
            return (
              <div className={`font-mono text-xs font-semibold ${count > 0 ? "text-noc-amber" : "text-noc-green"}`}>
                {count > 0 ? `${count.toLocaleString()} phones` : "None"}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
