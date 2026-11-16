import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { CmGroup, DevicePoolInfo } from "../api/client";
import type { SortState } from "../components/TableHeader";
import { shortName } from "../lib/hostname";
import { sharedServers, classifyPools } from "../lib/agCompare";
import { AgBadge, useAvailabilityGroups } from "../components/AgBadge";

export default function AvailabilityGroups() {
  const [cmGroups, setCmGroups] = useState<CmGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCmGroups()
      .then(setCmGroups)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading availability groups...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div>
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          Availability Groups
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          Server overlap across CMGs. Pick a CMG to see which others share no servers with it.
        </p>
      </div>

      {cmGroups.length > 0 && <CmgMatrix cmGroups={cmGroups} />}
    </div>
  );
}

const serverList = (cmg: CmGroup) =>
  [...cmg.members].sort((a, b) => a.priority - b.priority).map((m) => shortName(m.server_name)).join(" · ");

function CmgMatrix({ cmGroups }: { cmGroups: CmGroup[] }) {
  const [gridSort, setGridSort] = useState<SortState>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);

  // All unique servers across CMGs, most-used first
  const serverFreq = new Map<string, number>();
  for (const cmg of cmGroups) {
    for (const m of cmg.members) {
      const short = shortName(m.server_name);
      serverFreq.set(short, (serverFreq.get(short) || 0) + 1);
    }
  }
  const allServers = [...serverFreq.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  const { cmgToAg } = useAvailabilityGroups();
  const agNum = (cmg: CmGroup) => parseInt((cmgToAg.get(cmg.name) ?? "AG-999").slice(3), 10);
  const selected = cmGroups.find((g) => g.id === selectedId) ?? null;
  const compare = cmGroups.find((g) => g.id === compareId) ?? null;

  const onRowClick = (id: number) => {
    if (selectedId === null) {
      setSelectedId(id);
    } else if (id === selectedId) {
      setSelectedId(null);
      setCompareId(null);
    } else if (id === compareId) {
      setCompareId(null);
    } else {
      setCompareId(id);
    }
  };

  const clear = () => {
    setSelectedId(null);
    setCompareId(null);
  };

  const toggleGridSort = (key: string) => {
    setGridSort((prev) => {
      if (prev?.key === key) return prev.dir === "asc" ? { key, dir: "desc" } : null;
      return { key, dir: "asc" };
    });
  };

  const sortedCmgs = (() => {
    if (!gridSort) return cmGroups;
    const { key, dir } = gridSort;
    return [...cmGroups].sort((a, b) => {
      let va: string | number, vb: string | number;
      if (key === "cmg") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (key === "ag") {
        va = agNum(a);
        vb = agNum(b);
      } else if (key === "status") {
        va = selected ? (a.id === selected.id ? -1 : sharedServers(selected, a).length) : 0;
        vb = selected ? (b.id === selected.id ? -1 : sharedServers(selected, b).length) : 0;
      } else {
        va = a.members.find((m) => shortName(m.server_name) === key)?.priority ?? 99;
        vb = b.members.find((m) => shortName(m.server_name) === key)?.priority ?? 99;
      }
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      return dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  })();

  const sortTh = (sortKey: string, children: React.ReactNode, className = "", width?: string) => {
    const isSorted = gridSort?.key === sortKey;
    const dir = isSorted ? gridSort!.dir : null;
    return (
      <th key={sortKey} style={width ? { width } : undefined} className={`px-2 py-2.5 font-medium text-[10px] uppercase tracking-widest select-none ${className}`}>
        <button onClick={() => toggleGridSort(sortKey)} className="inline-flex items-center gap-1 cursor-pointer hover:text-noc-text-bright transition-colors group">
          {children}
          <span className="inline-flex flex-col text-[8px] leading-none ml-0.5">
            <span className={dir === "asc" ? "text-noc-amber" : "text-noc-border opacity-0 group-hover:opacity-50"}>▲</span>
            <span className={dir === "desc" ? "text-noc-amber" : "text-noc-border opacity-0 group-hover:opacity-50"}>▼</span>
          </span>
        </button>
      </th>
    );
  };

  const verdictShared = selected && compare ? sharedServers(selected, compare) : [];

  return (
    <>
      {/* Selection / verdict */}
      <div className="border border-noc-border bg-noc-surface px-4 py-3 font-mono text-xs space-y-1.5" data-testid="ag-selection">
        {!selected ? (
          <p className="text-noc-text-dim">
            Click a CM group to see which others share no servers with it. Click a second one to compare the pair.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-noc-text-dim uppercase tracking-widest text-[10px]">Selected</span>
              <span className="text-noc-cyan font-semibold">{selected.name}</span>
              <span className="text-noc-text-dim">({serverList(selected)})</span>
              <button
                onClick={clear}
                className="ml-auto px-2 py-0.5 border border-noc-border text-[10px] uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright cursor-pointer"
              >
                Clear
              </button>
            </div>
            {compare ? (
              <div className="flex items-center gap-3" data-testid="ag-verdict">
                <span className="text-noc-text-dim uppercase tracking-widest text-[10px]">Compare</span>
                <span className="text-noc-text-bright font-semibold">{compare.name}</span>
                <span className="text-noc-text-dim">({serverList(compare)})</span>
                <span className="text-noc-border">→</span>
                {verdictShared.length === 0 ? (
                  <span className="text-noc-green font-semibold">✓ Safe pair: no shared servers</span>
                ) : (
                  <span className="text-noc-red font-semibold">✗ Not safe: shares {verdictShared.join(", ")}</span>
                )}
              </div>
            ) : (
              <p className="text-noc-text-dim">Click another CM group to compare it with {selected.name}.</p>
            )}
          </>
        )}
      </div>

      {/* Priority Grid */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-cyan">
          CMG → Server Priority Matrix
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-noc-border bg-noc-panel/50">
                {sortTh("cmg", "CMG", "text-left text-noc-text-dim sticky left-0 bg-noc-panel/50 z-10")}
                {sortTh("ag", "AG", "text-center text-noc-text-dim")}
                {allServers.map((s) => (
                  sortTh(s, s, `text-center ${(serverFreq.get(s) || 0) > 1 ? "text-noc-amber" : "text-noc-text-dim"}`)
                ))}
                {selected && sortTh("status", <>vs {selected.name}</>, "text-left text-noc-text-dim", "22rem")}
              </tr>
            </thead>
            <tbody>
              {sortedCmgs.map((cmg, i) => {
                const isSelected = cmg.id === selectedId;
                const isCompare = cmg.id === compareId;
                const shared = selected && !isSelected ? sharedServers(selected, cmg) : null;
                const rowBg = isSelected
                  ? "bg-noc-cyan/10"
                  : isCompare
                    ? "bg-noc-amber/10"
                    : i % 2 === 0
                      ? "bg-noc-surface"
                      : "bg-noc-bg/30";
                const stickyBg = isSelected
                  ? "bg-noc-surface"
                  : i % 2 === 0
                    ? "bg-noc-surface"
                    : "bg-noc-bg/70";
                return (
                  <tr
                    key={cmg.id}
                    onClick={() => onRowClick(cmg.id)}
                    data-testid="ag-row"
                    className={`border-b border-noc-border/30 cursor-pointer hover:bg-noc-panel/60 ${rowBg} ${
                      isSelected ? "outline outline-1 outline-noc-cyan/60" : isCompare ? "outline outline-1 outline-noc-amber/60" : ""
                    }`}
                  >
                    <td className={`px-4 py-2.5 font-semibold sticky left-0 z-10 text-noc-text-bright ${stickyBg}`}>
                      <span className={isSelected ? "text-noc-cyan" : isCompare ? "text-noc-amber" : ""}>{cmg.name}</span>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      {cmgToAg.has(cmg.name) ? <AgBadge label={cmgToAg.get(cmg.name)!} /> : <span className="text-noc-border">·</span>}
                    </td>
                    {allServers.map((s) => {
                      const member = cmg.members.find((m) => shortName(m.server_name) === s);
                      if (!member) {
                        return <td key={s} className="text-center px-2 py-2.5 text-noc-border">·</td>;
                      }
                      const priorityColor =
                        member.priority === 1
                          ? "bg-noc-green/15 text-noc-green font-bold"
                          : member.priority === 2
                            ? "bg-noc-cyan/10 text-noc-cyan"
                            : "bg-noc-panel text-noc-text-dim";
                      const isSharedCell = shared?.includes(s);
                      return (
                        <td key={s} className="text-center px-2 py-2.5">
                          <span
                            className={`inline-block w-7 py-0.5 text-[11px] font-mono font-semibold ${priorityColor} ${
                              isSharedCell ? "ring-1 ring-noc-red/70" : ""
                            }`}
                          >
                            P{member.priority}
                          </span>
                        </td>
                      );
                    })}
                    {selected && (
                      <td className="px-2 py-2.5 truncate" data-testid="ag-status">
                        {isSelected ? (
                          <span className="text-noc-cyan">selected</span>
                        ) : shared && shared.length === 0 ? (
                          <span className="text-noc-green font-semibold">✓ safe</span>
                        ) : (
                          <span className="text-noc-red" title={`shares ${shared?.join(", ")}`}>
                            ✗ shares {shared?.join(", ")}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <PoolBlastRadius
          cmGroups={cmGroups}
          selectedNames={[selected.name, ...(compare ? [compare.name] : [])]}
          cmgToAg={cmgToAg}
        />
      )}
    </>
  );
}

const fmt = (n: number) => n.toLocaleString();

function PoolBlastRadius({
  cmGroups,
  selectedNames,
  cmgToAg,
}: {
  cmGroups: CmGroup[];
  selectedNames: string[];
  cmgToAg: Map<string, string>;
}) {
  const [pools, setPools] = useState<DevicePoolInfo[] | null>(null);

  useEffect(() => {
    api.getDevicePools().then(setPools).catch(() => setPools([]));
  }, []);

  if (!pools) {
    return (
      <div className="border border-noc-border bg-noc-surface px-4 py-3 font-mono text-xs text-noc-text-dim">
        Loading device pools...
      </div>
    );
  }

  const { onSelected, alsoImpacted, notImpacted } = classifyPools(pools, cmGroups, selectedNames);
  const phones = (list: { phone_count: number }[]) => list.reduce((s, p) => s + p.phone_count, 0);

  const table = (rows: (DevicePoolInfo & { shared?: string[] })[], showShared: boolean, testId: string) => (
    <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }} data-testid={testId}>
      <colgroup>
        <col style={{ width: "28%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "32%" }} />
      </colgroup>
      <thead>
        <tr className="border-b border-noc-border bg-noc-panel/50 text-[10px] uppercase tracking-widest text-noc-text-dim">
          <th className="text-left px-4 py-2 font-medium">Device Pool</th>
          <th className="text-left px-2 py-2 font-medium">CMG</th>
          <th className="text-left px-2 py-2 font-medium">AG</th>
          <th className="text-right px-2 py-2 font-medium">Phones</th>
          <th className="text-left py-2 font-medium" style={{ paddingLeft: "1.5rem" }}>{showShared ? "Shared servers" : ""}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-4 py-2.5 text-noc-text-dim">None</td>
          </tr>
        ) : (
          rows.map((p) => (
            <tr key={p.id} className={`border-b border-noc-border/30 ${p.phone_count === 0 ? "opacity-50" : ""}`}>
              <td className="px-4 py-2 text-noc-text-bright">{p.name}</td>
              <td className="px-2 py-2 text-noc-text">{p.cm_group_name}</td>
              <td className="px-2 py-2">
                {cmgToAg.has(p.cm_group_name) ? <AgBadge label={cmgToAg.get(p.cm_group_name)!} /> : <span className="text-noc-border">·</span>}
              </td>
              <td className="px-2 py-2 text-right text-noc-text-bright">{fmt(p.phone_count)}</td>
              <td className="py-2 text-noc-red truncate" style={{ paddingLeft: "1.5rem" }} title={p.shared?.join(", ")}>{showShared ? p.shared?.join(", ") : ""}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden" data-testid="pool-blast">
      <div className="tmux-title text-noc-cyan">Device Pools in Blast Radius</div>
      <div className="px-4 py-2.5 font-mono text-xs border-b border-noc-border" data-testid="pool-blast-summary">
        <span className="text-noc-cyan">{onSelected.length} pools · {fmt(phones(onSelected))} phones on selected</span>
        <span className="text-noc-border"> · </span>
        <span className="text-noc-red">{alsoImpacted.length} pools · {fmt(phones(alsoImpacted))} phones also impacted</span>
        <span className="text-noc-border"> · </span>
        <span className="text-noc-green">{notImpacted.length} pools · {fmt(phones(notImpacted))} phones not impacted</span>
      </div>
      <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-noc-cyan">
        On selected groups ({selectedNames.join(", ")})
      </div>
      {table(onSelected, false, "pool-on-selected")}
      <div className="px-4 pt-4 pb-1 font-mono text-[10px] uppercase tracking-widest text-noc-red">
        Also impacted (shared servers)
      </div>
      {table(alsoImpacted, true, "pool-also-impacted")}
    </div>
  );
}
