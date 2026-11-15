import { useState } from "react";
import type { CmGroup } from "../api/client";
import { useSort, ColHeader } from "./TableHeader";
import { AgBadge } from "./AgBadge";
import { shortName } from "../lib/hostname";
import { filterCmGroupsForNode } from "../lib/nodeFilter";

interface Props {
  groups: CmGroup[];
  phoneCounts: Map<string, number>;
  cmgToAg?: Map<string, string>;
  /** Selected node's full server name; null/undefined on the "All" tab */
  node?: string | null;
}

type SortKey = "name" | "ag" | "p1" | "p2" | "p3" | "phones";

export default function CmGroupTable({ groups, phoneCounts, cmgToAg, node = null }: Props) {
  const { sort, toggle, sorted } = useSort<SortKey>();
  // "show all" is remembered per node, so switching node tabs resets to filtered
  const [showAllFor, setShowAllFor] = useState<string | null>(null);
  const showAll = node !== null && showAllFor === node;
  const visible = node && !showAll ? filterCmGroupsForNode(groups, node) : groups;
  const matchCount = node ? filterCmGroupsForNode(groups, node).length : groups.length;
  const nodeCell = (serverName: string) =>
    serverName === node ? "border border-noc-cyan/50 bg-noc-cyan/10 px-1" : "";

  const accessor = (g: CmGroup, key: SortKey): string | number => {
    switch (key) {
      case "name": return g.name;
      case "ag": return cmgToAg?.get(g.name) || "ZZ";
      case "p1": return g.members.find((m) => m.priority === 1)?.server_name || "";
      case "p2": return g.members.find((m) => m.priority === 2)?.server_name || "";
      case "p3": return g.members.find((m) => m.priority === 3)?.server_name || "";
      case "phones": return phoneCounts.get(g.name) || 0;
    }
  };

  const rows = sorted(visible, accessor);

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
      <div className="tmux-title text-noc-amber flex items-center justify-between">
        <span>Call Manager Groups</span>
        {node && (
          <span className="font-mono text-[10px] normal-case tracking-normal font-bold">
            {matchCount} of {groups.length} CM groups use {shortName(node)} ·
            <button
              onClick={() => setShowAllFor(showAll ? null : node)}
              className="ml-2 underline decoration-dotted cursor-pointer hover:text-noc-text-bright"
            >
              {showAll ? "show filtered" : "show all"}
            </button>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-noc-border text-noc-text-dim">
              <ColHeader label="Group Name" sortKey="name" sort={sort} onSort={toggle} />
              <ColHeader label="AG" sortKey="ag" sort={sort} onSort={toggle} />
              <ColHeader label="Priority 1" sortKey="p1" sort={sort} onSort={toggle} />
              <ColHeader label="Priority 2" sortKey="p2" sort={sort} onSort={toggle} />
              <ColHeader label="Priority 3" sortKey="p3" sort={sort} onSort={toggle} />
              <ColHeader label="Phones" sortKey="phones" sort={sort} onSort={toggle} align="right" />
            </tr>
          </thead>
          <tbody>
            {node && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center font-mono text-xs text-noc-text-dim">
                  No CM groups use {shortName(node)}
                </td>
              </tr>
            )}
            {rows.map((g, i) => {
              const m1 = g.members.find((m) => m.priority === 1);
              const m2 = g.members.find((m) => m.priority === 2);
              const m3 = g.members.find((m) => m.priority === 3);
              const count = phoneCounts.get(g.name) || 0;

              return (
                <tr
                  key={g.id}
                  className={`border-b border-noc-border/50 hover:bg-noc-panel/50 transition-colors ${
                    i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono font-medium text-noc-text-bright truncate">
                    {g.name}
                  </td>
                  <td className="px-4 py-2.5">
                    {cmgToAg?.get(g.name) && <AgBadge label={cmgToAg.get(g.name)!} />}
                  </td>
                  <td className="px-4 py-2.5">
                    {m1 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-noc-green" />
                        <span className={`font-mono text-xs text-noc-text truncate ${nodeCell(m1.server_name)}`}>
                          {shortName(m1.server_name)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m2 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-noc-blue" />
                        <span className={`font-mono text-xs text-noc-text truncate ${nodeCell(m2.server_name)}`}>
                          {shortName(m2.server_name)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m3 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-noc-amber" />
                        <span className={`font-mono text-xs text-noc-text truncate ${nodeCell(m3.server_name)}`}>
                          {shortName(m3.server_name)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-noc-amber font-semibold">
                    {count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
