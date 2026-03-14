import type { CmGroup } from "../api/client";

interface Props {
  groups: CmGroup[];
  phoneCounts: Map<string, number>;
}

export default function CmGroupTable({ groups, phoneCounts }: Props) {
  return (
    <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
          Call Manager Groups
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-noc-border text-noc-text-dim">
              <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                Group Name
              </th>
              <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                Priority 1
              </th>
              <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                Priority 2
              </th>
              <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                Priority 3
              </th>
              <th className="text-right px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">
                Phones
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
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
                  <td className="px-6 py-3.5 font-mono font-medium text-noc-text-bright">
                    {g.name}
                  </td>
                  <td className="px-6 py-3.5">
                    {m1 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-noc-green" />
                        <span className="font-mono text-xs text-noc-text">
                          {m1.server_name.split(".")[0]}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {m2 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-noc-blue" />
                        <span className="font-mono text-xs text-noc-text">
                          {m2.server_name.split(".")[0]}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {m3 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-noc-amber" />
                        <span className="font-mono text-xs text-noc-text">
                          {m3.server_name.split(".")[0]}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono text-noc-amber font-semibold">
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
