import type { Server } from "../api/client";
import StatusIndicator from "./StatusIndicator";

interface Props {
  server: Server;
  phoneCount?: number;
  compact?: boolean;
}

export default function ServerCard({ server, phoneCount, compact }: Props) {
  const active = server.ccm_service_active === 1;
  const isPublisher = server.node_type === "Publisher";

  if (compact) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg border px-5 py-4 transition-all duration-300 ${
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
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
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

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-5 transition-all duration-300 ${
        active
          ? "border-noc-green/20 bg-noc-surface"
          : "border-noc-red/20 bg-noc-surface"
      }`}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-px ${
          active
            ? "bg-gradient-to-r from-transparent via-noc-green/60 to-transparent"
            : "bg-gradient-to-r from-transparent via-noc-red/60 to-transparent"
        }`}
      />

      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="inline-block px-2.5 py-1 rounded text-[10px] font-mono font-semibold uppercase tracking-widest mb-2 bg-noc-border text-noc-text-dim">
            {isPublisher ? "PUB" : "SUB"}
          </span>
          <h3 className="font-mono text-base font-medium text-noc-text-bright truncate max-w-[240px]">
            {server.name.split(".")[0]}
          </h3>
        </div>
        <StatusIndicator active={active} size="lg" />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-noc-text-dim font-mono shrink-0">FQDN</span>
          <span className="font-mono text-noc-text truncate" title={server.hostname}>
            {server.hostname}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-noc-text-dim font-mono shrink-0">CCM SVC</span>
          <span
            className={`font-mono font-semibold ${active ? "text-noc-green" : "text-noc-red"}`}
          >
            {active ? "STARTED" : "STOPPED"}
          </span>
        </div>
        {phoneCount !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-noc-text-dim font-mono shrink-0">PHONES</span>
            <span className="font-mono text-noc-amber font-semibold">{phoneCount}</span>
          </div>
        )}
        {server.last_checked_at && (
          <div className="flex justify-between gap-4">
            <span className="text-noc-text-dim font-mono shrink-0">CHECKED</span>
            <span className="font-mono text-noc-text-dim">
              {new Date(server.last_checked_at + "Z").toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
