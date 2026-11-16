import { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import type { Subnet, SubnetOverview as Overview, CerMatchStatus } from "../api/client";
import { useSort, ColHeader } from "./TableHeader";

type Row = Overview["subnets"][number];
type SortKey = "cidr" | "name" | "description" | "phones" | "cer";
type Filter = "all" | "mismatch" | "missing";

const fmt = (n: number) => n.toLocaleString();

function relTime(sqlTime: string | null): string {
  if (!sqlTime) return "never";
  const t = new Date(sqlTime.replace(" ", "T") + "Z").getTime();
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const STATUS_ORDER: Record<CerMatchStatus, number> = { missing: 0, mismatch: 1, inside: 2, match: 3 };

function CerBadge({ row }: { row: Row }) {
  if (!row.cerStatus) return null;
  if (row.cerStatus === "match") {
    return <span className="text-noc-green" title={row.cer?.[0]?.erlName}>✓ {row.cer?.[0]?.erlName || "in CER"}</span>;
  }
  const list = (row.cer ?? []).map((c) => c.cidr).join(", ");
  if (row.cerStatus === "inside") {
    return <span className="text-noc-green" title={row.cer?.map((c) => `${c.cidr} · ${c.erlName}`).join("\n")}>✓ inside CER {list}</span>;
  }
  if (row.cerStatus === "mismatch") {
    const ourBits = parseInt(row.cidr.split("/")[1], 10);
    const allNarrower = (row.cer ?? []).every((c) => parseInt(c.cidr.split("/")[1], 10) > ourBits);
    return <span className="text-noc-amber" title={list}>⚠ {allNarrower ? "split in CER" : "CER"}: {list}</span>;
  }
  return <span className="text-noc-red">✗ missing</span>;
}

const btn =
  "px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default";

export default function SubnetOverview({
  version,
  onEdit,
  onDelete,
  onChanged,
}: {
  version: number;
  onEdit: (s: Subnet) => void;
  onDelete: (id: number) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{
    title: string;
    rows: { left: string; right: string }[];
    warning?: string;
    confirmLabel: string;
    action: () => Promise<string>;
  } | null>(null);
  const { sort, toggle, sorted } = useSort<SortKey>();
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  useEffect(() => {
    api.getSubnetOverview().then(setData).catch((e) => setError(String(e)));
  }, [version]);

  if (error) return <div className="border border-noc-border bg-noc-surface px-4 py-3 font-mono text-xs text-noc-red">{error}</div>;
  if (!data) return <div className="border border-noc-border bg-noc-surface px-4 py-3 font-mono text-xs text-noc-text-dim">Loading subnets...</div>;

  const cerOn = !!data.cer?.lastSuccess;
  const counts = {
    mismatch: data.subnets.filter((s) => s.cerStatus === "mismatch").length,
    missing: data.subnets.filter((s) => s.cerStatus === "missing").length,
  };
  const filtered = filter === "all" ? data.subnets : data.subnets.filter((s) => s.cerStatus === filter);
  const accessor = (s: Row, key: SortKey): string | number => {
    switch (key) {
      case "cidr": return s.cidr;
      case "name": return s.name.toLowerCase();
      case "description": return (s.description || "").toLowerCase();
      case "phones": return s.phones;
      case "cer": return s.cerStatus ? STATUS_ORDER[s.cerStatus] : 9;
    }
  };
  const rows = sorted(filtered, accessor);

  const toggleRow = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNotice("");
    try {
      setNotice(await fn());
      onChanged();
    } catch (e) {
      setNotice(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const definedCidrs = new Set(data.subnets.map((x) => x.cidr));

  const replace = (targets: Row[]) => {
    const ok = targets.filter((r) => (r.replaceWith?.length ?? 0) > 0);
    if (ok.length === 0) {
      setNotice("Nothing to replace: no overlapping CER subnet has phones or is already defined.");
      return;
    }
    const broad = ok.some((r) => r.cer?.some((c) => c.broad && r.replaceWith!.includes(c.cidr)));
    setPending({
      title: `Replace ${ok.length} subnet${ok.length === 1 ? "" : "s"} with CER's`,
      rows: ok.map((r) => {
        const have = r.replaceWith!.filter((c) => definedCidrs.has(c));
        const add = r.replaceWith!.filter((c) => !definedCidrs.has(c));
        const parts = [add.length ? `add ${add.join(", ")}` : "", have.length ? `phones move to existing ${have.join(", ")}` : ""].filter(Boolean);
        return { left: `remove ${r.cidr} · ${r.name} · ${r.phones.toLocaleString()} phones`, right: parts.join("; ") };
      }),
      warning: broad ? "Includes a broad CER subnet (wider than /22)." : undefined,
      confirmLabel: "Replace",
      action: async () => {
        const r = await api.replaceWithCer(ok.map((x) => x.id));
        return `Replaced ${r.replaced} · added ${r.created} · already present ${r.skipped}${r.refused.length ? ` · refused ${r.refused.length}` : ""}${r.errors.length ? ` · errors ${r.errors.length}` : ""}`;
      },
    });
  };

  const importCidrs = (items: Overview["unmapped"]["inCer"]) => {
    if (items.length === 0) return;
    setPending({
      title: `Import ${items.length} subnet${items.length === 1 ? "" : "s"} from CER`,
      rows: items.map((u) => ({ left: `add ${u.cidr} · ${u.erlName}`, right: `${u.location} · ${u.phones.toLocaleString()} phones` })),
      warning: items.some((u) => u.broad) ? "Includes a broad CER subnet (wider than /22)." : undefined,
      confirmLabel: "Import",
      action: async () => {
        const r = await api.importCerSubnets(items.map((u) => u.cidr));
        return `Imported ${r.created} · already present ${r.skipped}${r.errors.length ? ` · errors ${r.errors.length}` : ""}`;
      },
    });
  };

  const mismatchRows = data.subnets.filter((s) => s.cerStatus === "mismatch" && !s.cer?.some((c) => c.broad));
  const importable = data.unmapped.inCer.filter((u) => !u.broad);
  const t = data.totals;

  return (
    <>
      <div className="border border-noc-border bg-noc-surface overflow-hidden" data-testid="subnet-overview">
        <div className="tmux-title text-noc-cyan flex items-center justify-between">
          <span>Subnets ({fmt(data.subnets.length)})</span>
          <span className="font-mono text-[10px] text-noc-text-dim normal-case tracking-normal" data-testid="subnet-totals">
            {fmt(t.mapped)} phones mapped · {fmt(t.unmappedWithIp)} unmapped · {fmt(t.noIp)} no IP · {fmt(t.sharedIp)} shared IP
          </span>
        </div>

        {data.cer && (
          <div className="px-4 py-2 border-b border-noc-border font-mono text-xs flex flex-wrap items-center gap-2" data-testid="cer-line">
            {data.cer.lastSuccess ? (
              <span className="text-noc-text-dim">
                CER: {fmt(data.cer.subnetCount)} subnets · last sync {relTime(data.cer.lastSuccess)}
              </span>
            ) : (
              <span className="text-noc-amber">CER: not synced yet — use Sync CER on the Dashboard</span>
            )}
            {data.cer.lastError && <span className="text-noc-red">· last sync failed: {data.cer.lastError}</span>}
            {cerOn && (
              <span className="ml-auto flex items-center gap-1.5">
                {(["all", "mismatch", "missing"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`${btn} ${filter === f ? "border-noc-cyan/50 text-noc-cyan bg-noc-cyan/10" : "border-noc-border text-noc-text-dim"}`}
                  >
                    {f === "all" ? `all ${data.subnets.length}` : f === "mismatch" ? `⚠ mismatch ${counts.mismatch}` : `missing ${counts.missing}`}
                  </button>
                ))}
                <button
                  onClick={() => replace(mismatchRows)}
                  disabled={busy || mismatchRows.length === 0}
                  className={`${btn} border-noc-amber/40 text-noc-amber`}
                  title="Replace every mismatched subnet with CER's (skips broad CER subnets)"
                >
                  Replace all mismatches
                </button>
              </span>
            )}
          </div>
        )}
        {notice && <div className="px-4 py-2 border-b border-noc-border font-mono text-xs text-noc-cyan" data-testid="subnet-notice">{notice}</div>}


        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-noc-border text-noc-text-dim">
                <ColHeader label="CIDR" sortKey="cidr" sort={sort} onSort={toggle} />
                <ColHeader label="Name" sortKey="name" sort={sort} onSort={toggle} />
                <ColHeader label="Description" sortKey="description" sort={sort} onSort={toggle} />
                <ColHeader label="Phones" sortKey="phones" sort={sort} onSort={toggle} align="right" />
                {cerOn && <ColHeader label="CER" sortKey="cer" sort={sort} onSort={toggle} />}
                <ColHeader label="Actions" sort={null} align="right" resizable={false} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cerOn ? 6 : 5} className="px-4 py-3 font-mono text-xs text-noc-text-dim">No subnets</td>
                </tr>
              )}
              {rows.map((s, i) => {
                const open = expanded.has(s.id);
                return (
                  <Fragment key={s.id}>
                    <tr
                      data-testid="subnet-row"
                      onClick={() => toggleRow(s.id)}
                      className={`border-b border-noc-border/50 hover:bg-noc-panel/50 transition-colors cursor-pointer ${
                        i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-noc-cyan truncate">
                        <span className="text-noc-text-dim mr-1.5">{open ? "▾" : "▸"}</span>
                        {s.cidr}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-medium text-noc-text-bright truncate">{s.name}</td>
                      <td className="px-4 py-2.5 font-mono text-noc-text-dim truncate">{s.description || "—"}</td>
                      <td className="py-2.5 text-right font-mono text-noc-amber font-semibold" style={{ paddingRight: "0.5rem" }}>{fmt(s.phones)}</td>
                      {cerOn && (
                        <td className="py-2.5 font-mono text-xs truncate" style={{ paddingLeft: "1.25rem" }} data-testid="subnet-cer">
                          <CerBadge row={s} />
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {(s.cerStatus === "mismatch" || s.cerStatus === "inside") && (
                            <button
                              onClick={() => replace([s])}
                              disabled={busy || !(s.replaceWith?.length)}
                              title={
                                s.replaceWith?.length
                                  ? `Replace with ${s.replaceWith.join(", ")}`
                                  : s.cerStatus === "inside"
                                    ? "The wider CER subnet isn't in your list; Use CER only rolls up into subnets you have"
                                    : "No overlapping CER subnet has phones of its own or is already defined"
                              }
                              className={`${btn} border-noc-amber/40 text-noc-amber`}
                            >
                              Use CER
                            </button>
                          )}
                          <button
                            onClick={() => onEdit({ id: s.id, cidr: s.cidr, name: s.name, description: s.description } as Subnet)}
                            className={`${btn} border-noc-border text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete(s.id)}
                            className={`${btn} border-noc-red/20 text-noc-red/60 hover:text-noc-red hover:border-noc-red/40`}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-noc-border/50 bg-noc-bg/60" data-testid="subnet-detail">
                        <td colSpan={cerOn ? 6 : 5} className="px-4 py-3 space-y-2">
                          <div className="flex flex-wrap gap-px">
                            {Object.keys(s.cmGroups).length === 0 && (
                              <span className="font-mono text-[10px] text-noc-text-dim">No phones in this subnet</span>
                            )}
                            {Object.entries(s.cmGroups)
                              .sort(([, a], [, b]) => b - a)
                              .map(([cmg, n]) => (
                                <span key={cmg} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-noc-bg border border-noc-border/50 font-mono text-[10px]">
                                  <span className="text-noc-text-dim">{cmg}</span>
                                  <span className="text-noc-cyan font-semibold">{n}</span>
                                </span>
                              ))}
                          </div>
                          {cerOn && (
                            <div className="font-mono text-xs space-y-0.5">
                              {(s.cer ?? []).length === 0 ? (
                                <div className="text-noc-red">No CER subnet overlaps {s.cidr}</div>
                              ) : (
                                s.cer!.map((c) => (
                                  <div key={c.cidr} className="text-noc-text">
                                    <span className="text-noc-text-dim">CER</span> {c.cidr} · ERL <span className="text-noc-text-bright">{c.erlName}</span> · {c.location}
                                    {c.broad && <span className="text-noc-amber"> · broad</span>}
                                    {s.cerStatus === "mismatch" && !s.replaceWith?.includes(c.cidr) && (
                                      <span className="text-noc-text-dim"> · no phones of its own</span>
                                    )}
                                    {s.cerStatus === "inside" && !s.replaceWith?.includes(c.cidr) && (
                                      <span className="text-noc-text-dim"> · not in your list (Use CER only rolls up into subnets you have)</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(data.unmapped.inCer.length > 0 || data.unmapped.notInCer.length > 0) && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden" data-testid="unmapped">
          <div className="tmux-title text-noc-amber flex items-center justify-between">
            <span>Unmapped Phones ({fmt(t.unmappedWithIp)} with an IP outside defined subnets)</span>
            {cerOn && importable.length > 0 && (
              <button
                onClick={() => importCidrs(importable)}
                disabled={busy}
                className={`${btn} border-noc-cyan/40 text-noc-cyan normal-case`}
                title="Import every CER subnet below (skips broad ones)"
              >
                Import all from CER ({importable.length})
              </button>
            )}
          </div>
          {cerOn && data.unmapped.inCer.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-noc-cyan">In CER</div>
              <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }} data-testid="unmapped-in-cer">
                <tbody>
                  {data.unmapped.inCer.map((u) => (
                    <tr key={u.cidr} className="border-b border-noc-border/30">
                      <td className="px-4 py-2 text-noc-cyan" style={{ width: "18%" }}>{u.cidr}</td>
                      <td className="px-2 py-2 text-noc-text-bright truncate" style={{ width: "22%" }}>{u.erlName}</td>
                      <td className="px-2 py-2 text-noc-text-dim truncate" style={{ width: "32%" }}>{u.location}</td>
                      <td className="px-2 py-2 text-right text-noc-amber" style={{ width: "10%" }}>{fmt(u.phones)}</td>
                      <td className="px-4 py-2 text-right" style={{ width: "18%" }}>
                        {u.broad && <span className="text-noc-amber mr-2">broad</span>}
                        <button onClick={() => importCidrs([u])} disabled={busy} className={`${btn} border-noc-cyan/40 text-noc-cyan`}>
                          Import
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {data.unmapped.notInCer.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-noc-red">
                {cerOn ? "Not in CER (guessed /24 — 911 gap)" : "Outside defined subnets (guessed /24)"}
              </div>
              <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }} data-testid="unmapped-not-in-cer">
                <tbody>
                  {data.unmapped.notInCer.map((u) => (
                    <tr key={u.cidr} className="border-b border-noc-border/30">
                      <td className="px-4 py-2 text-noc-red" style={{ width: "18%" }}>{u.cidr}</td>
                      <td className="px-2 py-2 text-noc-text-dim" style={{ width: "72%" }}>
                        {cerOn ? "No CER subnet covers these phones" : "Use Discover above to add it"}
                      </td>
                      <td className="px-4 py-2 text-right text-noc-amber" style={{ width: "10%" }}>{fmt(u.phones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      {pending &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => !busy && setPending(null)}
          data-testid="confirm-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl border border-noc-amber/50 bg-noc-surface font-mono text-xs shadow-2xl"
            data-testid="confirm-card"
          >
            <div className="px-4 py-2.5 border-b border-noc-amber/30 text-noc-amber uppercase tracking-widest text-[11px] font-semibold">
              {pending.title}
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-noc-border/40">
              {pending.rows.map((r, i) => (
                <div key={i} className="px-4 py-2 flex flex-wrap gap-x-3">
                  <span className="text-noc-text-bright">{r.left}</span>
                  <span className="text-noc-border">→</span>
                  <span className="text-noc-cyan">{r.right}</span>
                </div>
              ))}
            </div>
            {pending.warning && <div className="px-4 py-2 border-t border-noc-amber/30 text-noc-amber">⚠ {pending.warning}</div>}
            <div className="px-4 py-2.5 border-t border-noc-amber/30 flex items-center justify-end gap-2">
              <button onClick={() => setPending(null)} disabled={busy} className={`${btn} border-noc-border text-noc-text-dim hover:text-noc-text`}>
                Cancel
              </button>
              <button
                ref={(el) => el?.focus({ preventScroll: true })}
                onClick={() => {
                  const action = pending.action;
                  setPending(null);
                  run(action);
                }}
                disabled={busy}
                data-testid="confirm-card-ok"
                className={`${btn} border-noc-amber/60 text-noc-amber bg-noc-amber/10`}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
