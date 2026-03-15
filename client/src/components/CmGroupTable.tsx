import type { CmGroup } from "../api/client";
import { useSort, ColHeader } from "./TableHeader";
import { AgBadge } from "./AgBadge";

interface Props {
  groups: CmGroup[];
  phoneCounts: Map<string, number>;
  cmgToAg?: Map<string, string>;
}

type SortKey = "name" | "ag" | "p1" | "p2" | "p3" | "phones";

export default function CmGroupTable({ groups, phoneCounts, cmgToAg }: Props) {
  const { sort, toggle, sorted } = useSort<SortKey>();

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

  const rows = sorted(groups, accessor);

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
      <div className="tmux-title text-noc-amber">
        Call Manager Groups
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
                        <span className="font-mono text-xs text-noc-text truncate">
                          {m1.server_name.split(".")[0]}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m2 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-noc-blue" />
                        <span className="font-mono text-xs text-noc-text truncate">
                          {m2.server_name.split(".")[0]}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m3 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-noc-amber" />
                        <span className="font-mono text-xs text-noc-text truncate">
                          {m3.server_name.split(".")[0]}
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
