import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { PhoneReport, ReportSummary } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function Report() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [phones, setPhones] = useState<PhoneReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterProtocol, setFilterProtocol] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterServer, setFilterServer] = useState("");
  const [filterFirmware, setFilterFirmware] = useState("");
  const [showPhones, setShowPhones] = useState(false);
  const { sort, toggle, sorted } = useSort<"name" | "model" | "dn" | "proto" | "server" | "pool" | "ip" | "firmware" | "status" | "user" | "seen" | "active">();
  const { cmgToAg } = useAvailabilityGroups();

  useEffect(() => {
    api.getReportSummary().then((s) => {
      setSummary(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadPhones = useCallback(() => {
    setPhoneLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (filterModel) params.model = filterModel;
    if (filterProtocol) params.protocol = filterProtocol;
    if (filterStatus) params.status = filterStatus;
    if (filterServer) params.server = filterServer;
    if (filterFirmware) params.firmware = filterFirmware;
    api.getPhoneReport(Object.keys(params).length > 0 ? params : undefined).then((p) => {
      setPhones(p);
      setPhoneLoading(false);
      setShowPhones(true);
    }).catch(() => setPhoneLoading(false));
  }, [search, filterModel, filterProtocol, filterStatus, filterServer, filterFirmware]);

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">Loading report data...</p>
        </div>
      </div>
    );
  }

  const pct = (n: number) => summary.total > 0 ? `${Math.round((n / summary.total) * 100)}%` : "0%";

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold uppercase tracking-widest text-noc-text-bright">
          Phone Report
        </h1>
        <p className="text-xs font-mono text-noc-text-dim mt-1">
          Cluster-wide phone inventory and registration analysis
        </p>
      </div>

      {/* Cluster Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-cyan">{summary.total.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Total Phones</div>
        </div>
        <div className={`p-4 text-center ${summary.registered > 0 ? "bg-noc-green/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${summary.registered > 0 ? "text-noc-green" : "text-noc-text-dim"}`}>
            {summary.registered.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Registered ({pct(summary.registered)})</div>
        </div>
        <div className={`p-4 text-center ${summary.unregistered > 0 ? "bg-noc-amber/5" : "bg-noc-surface"}`}>
          <div className={`font-mono text-3xl font-bold ${summary.unregistered > 0 ? "text-noc-amber" : "text-noc-text-dim"}`}>
            {summary.unregistered.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Unregistered</div>
        </div>
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-text-dim">{summary.neverSeen.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Never Seen</div>
        </div>
      </div>

      {/* Active Phones */}
      <div className="grid grid-cols-3 gap-px bg-noc-border">
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-2xl font-bold text-noc-green">{summary.active24h.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Active 24h ({pct(summary.active24h)})</div>
        </div>
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-2xl font-bold text-noc-cyan">{summary.active7d.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Active 7d ({pct(summary.active7d)})</div>
        </div>
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-2xl font-bold text-noc-amber">{summary.active30d.toLocaleString()}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">Active 30d ({pct(summary.active30d)})</div>
        </div>
      </div>

      {/* Breakdown panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Server Distribution */}
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-cyan">By Server ({summary.serverBreakdown.length})</div>
          <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
            {summary.serverBreakdown.map((s) => (
              <button
                key={s.server_name}
                onClick={() => { setFilterServer(filterServer === s.server_name ? "" : s.server_name); }}
                className={`w-full flex items-center justify-between text-left cursor-pointer px-2 py-1 transition-colors ${
                  filterServer === s.server_name ? "bg-noc-cyan/10 text-noc-cyan" : "hover:bg-noc-panel/30"
                }`}
              >
                <span className="font-mono text-[10px] text-noc-text truncate">{s.server_name.split(".")[0]}</span>
                <span className="font-mono text-[10px] text-noc-amber font-semibold">{s.registered.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Protocol Distribution */}
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-green">By Protocol</div>
          <div className="p-3 space-y-1.5">
            {summary.protocols.map((p) => (
              <button
                key={p.protocol}
                onClick={() => { setFilterProtocol(filterProtocol === p.protocol ? "" : p.protocol); }}
                className={`w-full flex items-center justify-between text-left cursor-pointer px-2 py-1 transition-colors ${
                  filterProtocol === p.protocol ? "bg-noc-green/10 text-noc-green" : "hover:bg-noc-panel/30"
                }`}
              >
                <span className="font-mono text-[10px] text-noc-text">{p.protocol || "Unknown"}</span>
                <span className="font-mono text-[10px] text-noc-amber font-semibold">{p.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model Distribution */}
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-amber">By Model ({summary.models.length})</div>
          <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
            {summary.models.map((m) => (
              <button
                key={m.model}
                onClick={() => { setFilterModel(filterModel === m.model ? "" : m.model); }}
                className={`w-full flex items-center justify-between text-left cursor-pointer px-2 py-1 transition-colors ${
                  filterModel === m.model ? "bg-noc-amber/10 text-noc-amber" : "hover:bg-noc-panel/30"
                }`}
              >
                <span className="font-mono text-[10px] text-noc-text truncate">{m.model}</span>
                <span className="font-mono text-[10px] text-noc-amber font-semibold">{m.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Firmware Distribution */}
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-blue">By Firmware ({summary.firmware.length})</div>
          <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
            {summary.firmware.map((f) => (
              <button
                key={f.firmware}
                onClick={() => { setFilterFirmware(filterFirmware === f.firmware ? "" : f.firmware); }}
                className={`w-full flex items-center justify-between text-left cursor-pointer px-2 py-1 transition-colors ${
                  filterFirmware === f.firmware ? "bg-noc-blue/10 text-noc-blue" : "hover:bg-noc-panel/30"
                }`}
              >
                <span className="font-mono text-[10px] text-noc-text truncate">{f.firmware}</span>
                <span className="font-mono text-[10px] text-noc-amber font-semibold">{f.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search and Load */}
      <div className="border border-noc-border bg-noc-surface p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPhones()}
            placeholder="Search by name, DN, description, or EM user..."
            className="flex-1 px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
          />
          <button
            onClick={loadPhones}
            disabled={phoneLoading}
            className="px-4 py-2 bg-noc-cyan/10 border border-noc-cyan/30 text-noc-cyan font-mono text-xs uppercase tracking-widest hover:bg-noc-cyan/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            {phoneLoading ? "Loading..." : "Load Phones"}
          </button>
          {(filterModel || filterProtocol || filterStatus || filterServer || filterFirmware) && (
            <button
              onClick={() => { setFilterModel(""); setFilterProtocol(""); setFilterStatus(""); setFilterServer(""); setFilterFirmware(""); }}
              className="px-3 py-2 border border-noc-border text-noc-text-dim font-mono text-xs uppercase tracking-widest hover:text-noc-text transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
        {(filterModel || filterProtocol || filterServer || filterFirmware) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {filterModel && (
              <span className="px-2 py-0.5 bg-noc-amber/10 text-noc-amber text-[10px] font-mono">Model: {filterModel}</span>
            )}
            {filterProtocol && (
              <span className="px-2 py-0.5 bg-noc-green/10 text-noc-green text-[10px] font-mono">Protocol: {filterProtocol}</span>
            )}
            {filterServer && (
              <span className="px-2 py-0.5 bg-noc-cyan/10 text-noc-cyan text-[10px] font-mono">Server: {filterServer.split(".")[0]}</span>
            )}
            {filterFirmware && (
              <span className="px-2 py-0.5 bg-noc-blue/10 text-noc-blue text-[10px] font-mono">Firmware: {filterFirmware}</span>
            )}
          </div>
        )}
      </div>

      {/* Phone Table */}
      {showPhones && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
          <div className="tmux-title text-noc-cyan">
            Phones ({phones.length.toLocaleString()})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-noc-border bg-noc-panel/50 text-noc-text-dim">
                  <ColHeader label="Phone" sortKey="name" sort={sort} onSort={toggle} className="w-[13%]" />
                  <ColHeader label="DN" sortKey="dn" sort={sort} onSort={toggle} className="w-[6%]" />
                  <ColHeader label="Model" sortKey="model" sort={sort} onSort={toggle} className="w-[10%]" />
                  <ColHeader label="Proto" sortKey="proto" sort={sort} onSort={toggle} className="w-[5%]" />
                  <ColHeader label="Server" sortKey="server" sort={sort} onSort={toggle} className="w-[10%]" />
                  <ColHeader label="Device Pool" sortKey="pool" sort={sort} onSort={toggle} className="w-[10%]" />
                  <ColHeader label="IP" sortKey="ip" sort={sort} onSort={toggle} className="w-[8%]" />
                  <ColHeader label="Firmware" sortKey="firmware" sort={sort} onSort={toggle} className="w-[10%]" />
                  <ColHeader label="EM User" sortKey="user" sort={sort} onSort={toggle} className="w-[8%]" />
                  <ColHeader label="Last Seen" sortKey="seen" sort={sort} onSort={toggle} className="w-[9%]" />
                  <ColHeader label="Last Active" sortKey="active" sort={sort} onSort={toggle} className="w-[9%]" />
                  <ColHeader label="Status" sortKey="status" sort={sort} onSort={toggle} className="w-[6%]" />
                </tr>
              </thead>
              <tbody>
                {phones.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-noc-text-dim">
                      No phones match the current filters.
                    </td>
                  </tr>
                ) : (
                  sorted(phones, (r, k) => {
                    switch (k) {
                      case "name": return r.phone_name;
                      case "dn": return r.dir_number || "";
                      case "model": return r.model || "";
                      case "proto": return r.protocol || "";
                      case "server": return r.server_name || "";
                      case "pool": return r.device_pool_name || "";
                      case "ip": return r.ip_address || "";
                      case "firmware": return r.active_load_id || "";
                      case "user": return r.login_user_id || "";
                      case "seen": return r.last_seen_at || "";
                      case "active": return r.last_active_at || "";
                      case "status": return r.status || "";
                    }
                  }).slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-b border-noc-border/50 hover:bg-noc-panel/30 transition-colors">
                      <td className="px-4 py-2 text-noc-text-bright truncate" title={r.phone_name}>{r.phone_name}</td>
                      <td className="px-4 py-2 text-noc-text truncate">{r.dir_number || "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate" title={r.model}>{r.model || "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate">{r.protocol || "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate">{r.server_name ? r.server_name.split(".")[0] : "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate">
                        <span className="inline-flex items-center gap-1">
                          {r.device_pool_name || "—"}
                          {r.cm_group_name && cmgToAg.get(r.cm_group_name) && (
                            <AgBadge label={cmgToAg.get(r.cm_group_name)!} />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-noc-text truncate">{r.ip_address || "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate" title={r.active_load_id}>{r.active_load_id || "—"}</td>
                      <td className="px-4 py-2 text-noc-text truncate">{r.login_user_id || "—"}</td>
                      <td className="px-4 py-2 text-noc-text-dim truncate" title={r.last_seen_at}>
                        {r.last_seen_at ? (() => {
                          const raw = r.last_seen_at;
                          const num = parseInt(raw, 10);
                          const d = !isNaN(num) && num > 1000000000 && String(num) === raw
                            ? new Date(num * 1000)
                            : new Date(raw);
                          return isNaN(d.getTime()) ? raw : d.toLocaleString();
                        })() : "—"}
                      </td>
                      <td className="px-4 py-2 text-noc-text-dim truncate" title={r.last_active_at}>
                        {r.last_active_at ? (() => {
                          const raw = r.last_active_at;
                          const num = parseInt(raw, 10);
                          const d = !isNaN(num) && num > 1000000000 && String(num) === raw
                            ? new Date(num * 1000)
                            : new Date(raw);
                          return isNaN(d.getTime()) ? raw : d.toLocaleString();
                        })() : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {r.status ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                            r.status === "Registered"
                              ? "bg-noc-green/10 text-noc-green"
                              : "bg-noc-amber/10 text-noc-amber"
                          }`}>
                            <span className={`w-1.5 h-1.5 ${r.status === "Registered" ? "bg-noc-green" : "bg-noc-amber"}`} />
                            {r.status === "Registered" ? "REG" : "UNREG"}
                          </span>
                        ) : (
                          <span className="text-noc-text-dim">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {phones.length > 500 && (
            <div className="px-4 py-2 text-[10px] font-mono text-noc-text-dim border-t border-noc-border/50">
              Showing first 500 of {phones.length.toLocaleString()} results. Use filters to narrow down.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
