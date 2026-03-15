import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { CmGroup } from "../api/client";
import type { SortState } from "../components/TableHeader";

// Colors assigned to channels for visual distinction
const CHANNEL_COLORS = [
  { bg: "bg-noc-cyan/8", border: "border-noc-cyan/30", text: "text-noc-cyan", dot: "bg-noc-cyan", label: "AG-1" },
  { bg: "bg-noc-amber/8", border: "border-noc-amber/30", text: "text-noc-amber", dot: "bg-noc-amber", label: "AG-2" },
  { bg: "bg-noc-green/8", border: "border-noc-green/30", text: "text-noc-green", dot: "bg-noc-green", label: "AG-3" },
  { bg: "bg-noc-blue/8", border: "border-noc-blue/30", text: "text-noc-blue", dot: "bg-noc-blue", label: "AG-4" },
  { bg: "bg-noc-red/8", border: "border-noc-red/30", text: "text-noc-red", dot: "bg-noc-red", label: "AG-5" },
  { bg: "bg-purple-500/8", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400", label: "AG-6" },
];

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
          Server overlap analysis across CMGs. Identify safe upgrade pairs and blast zone boundaries.
        </p>
      </div>

      {cmGroups.length > 0 && <CmgChannelPlan cmGroups={cmGroups} />}
    </div>
  );
}

function CmgChannelPlan({ cmGroups }: { cmGroups: CmGroup[] }) {
  // Collect all unique servers across all CMGs, ordered by frequency
  const serverFreq = new Map<string, { name: string; id: number; count: number }>();
  for (const cmg of cmGroups) {
    for (const m of cmg.members) {
      const short = m.server_name.split(".")[0];
      const existing = serverFreq.get(short);
      if (existing) {
        existing.count++;
      } else {
        serverFreq.set(short, { name: short, id: m.server_id, count: 1 });
      }
    }
  }
  const allServers = Array.from(serverFreq.values()).sort((a, b) => b.count - a.count);

  // Build overlap data: for each server, how many CMGs use it
  const serverCmgCount = new Map<string, number>();
  for (const s of allServers) {
    const count = cmGroups.filter((g) => g.members.some((m) => m.server_name.split(".")[0] === s.name)).length;
    serverCmgCount.set(s.name, count);
  }

  // --- Blast Zone / Channel computation ---
  const cmgServerSets = cmGroups.map((cmg) => ({
    cmg,
    servers: new Set(cmg.members.map((m) => m.server_name.split(".")[0])),
    serverKey: cmg.members.map((m) => m.server_name.split(".")[0]).sort().join(","),
  }));

  // Union-Find for connected components
  const parent = new Map<number, number>();
  cmGroups.forEach((_, i) => parent.set(i, i));
  function find(x: number): number {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  }
  function union(a: number, b: number) { parent.set(find(a), find(b)); }

  for (let i = 0; i < cmgServerSets.length; i++) {
    for (let j = i + 1; j < cmgServerSets.length; j++) {
      const shared = [...cmgServerSets[i].servers].some((s) => cmgServerSets[j].servers.has(s));
      if (shared) union(i, j);
    }
  }

  // Group into blast zones (connected components)
  const zoneMap = new Map<number, number[]>();
  cmgServerSets.forEach((_, i) => {
    const root = find(i);
    if (!zoneMap.has(root)) zoneMap.set(root, []);
    zoneMap.get(root)!.push(i);
  });

  // Within each zone, group into channels by exact server set
  interface Channel {
    serverKey: string;
    servers: string[];
    cmgs: CmGroup[];
    colorIdx: number;
  }
  interface BlastZone {
    channels: Channel[];
    allServers: string[];
    crossChannelServers: string[];
  }

  const blastZones: BlastZone[] = [];
  let globalColorIdx = 0;

  const sortedZones = Array.from(zoneMap.values()).sort((a, b) => b.length - a.length);
  for (const memberIndices of sortedZones) {
    const channelMap = new Map<string, { servers: string[]; cmgs: CmGroup[] }>();
    for (const idx of memberIndices) {
      const entry = cmgServerSets[idx];
      if (!channelMap.has(entry.serverKey)) {
        channelMap.set(entry.serverKey, { servers: [...entry.servers].sort(), cmgs: [] });
      }
      channelMap.get(entry.serverKey)!.cmgs.push(entry.cmg);
    }

    const channels: Channel[] = Array.from(channelMap.values())
      .sort((a, b) => b.cmgs.length - a.cmgs.length)
      .map((ch) => ({ ...ch, serverKey: ch.servers.join(","), colorIdx: globalColorIdx++ }));

    const zoneAllServers = new Set<string>();
    const serverToChannels = new Map<string, number>();
    for (const ch of channels) {
      for (const s of ch.servers) {
        zoneAllServers.add(s);
        serverToChannels.set(s, (serverToChannels.get(s) || 0) + 1);
      }
    }
    const crossChannelServers = [...serverToChannels.entries()]
      .filter(([, count]) => count > 1)
      .map(([s]) => s);

    blastZones.push({
      channels,
      allServers: [...zoneAllServers].sort(),
      crossChannelServers,
    });
  }

  // CMG → channel color lookup for the grid
  const cmgColorMap = new Map<number, number>();
  for (const zone of blastZones) {
    for (const ch of zone.channels) {
      for (const cmg of ch.cmgs) {
        cmgColorMap.set(cmg.id, ch.colorIdx);
      }
    }
  }

  const [gridSort, setGridSort] = useState<SortState>(null);

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
      } else if (key === "channel") {
        va = cmgColorMap.get(a.id) ?? 99;
        vb = cmgColorMap.get(b.id) ?? 99;
      } else {
        const memberA = a.members.find((m) => m.server_name.split(".")[0] === key);
        const memberB = b.members.find((m) => m.server_name.split(".")[0] === key);
        va = memberA?.priority ?? 99;
        vb = memberB?.priority ?? 99;
      }
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      return dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  })();

  const SortTh = ({ sortKey, children, className = "" }: { sortKey: string; children: React.ReactNode; className?: string }) => {
    const isSorted = gridSort?.key === sortKey;
    const dir = isSorted ? gridSort!.dir : null;
    return (
      <th className={`px-2 py-2.5 font-medium text-[10px] uppercase tracking-widest select-none ${className}`}>
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

  return (
    <>
      {/* Priority Grid */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-cyan">
          CMG → Server Priority Matrix
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-noc-border bg-noc-panel/50">
                <SortTh sortKey="cmg" className="text-left text-noc-text-dim sticky left-0 bg-noc-panel/50 z-10">
                  CMG
                </SortTh>
                <SortTh sortKey="channel" className="text-center text-noc-text-dim">
                  AG
                </SortTh>
                {allServers.map((s) => {
                  const isShared = (serverCmgCount.get(s.name) || 0) > 1;
                  return (
                    <SortTh
                      key={s.name}
                      sortKey={s.name}
                      className={`text-center ${isShared ? "text-noc-amber" : "text-noc-text-dim"}`}
                    >
                      {s.name}
                    </SortTh>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedCmgs.map((cmg, i) => {
                const colorIdx = cmgColorMap.get(cmg.id) ?? 0;
                const color = CHANNEL_COLORS[colorIdx % CHANNEL_COLORS.length];
                return (
                  <tr
                    key={cmg.id}
                    className={`border-b border-noc-border/30 ${i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"}`}
                  >
                    <td className={`px-4 py-2.5 font-semibold sticky left-0 z-10 text-noc-text-bright ${i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/70"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 shrink-0 ${color.dot}`} />
                        {cmg.name}
                      </div>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      <span className={`inline-block w-10 py-0.5 text-[11px] font-mono font-semibold ${color.bg} ${color.text}`}>
                        {color.label}
                      </span>
                    </td>
                    {allServers.map((s) => {
                      const member = cmg.members.find((m) => m.server_name.split(".")[0] === s.name);
                      if (!member) {
                        return <td key={s.name} className="text-center px-2 py-2.5 text-noc-border">·</td>;
                      }
                      const priorityColor =
                        member.priority === 1
                          ? "bg-noc-green/15 text-noc-green font-bold"
                          : member.priority === 2
                            ? "bg-noc-cyan/10 text-noc-cyan"
                            : "bg-noc-panel text-noc-text-dim";
                      return (
                        <td key={s.name} className="text-center px-2 py-2.5">
                          <span className={`inline-block w-7 py-0.5 text-[11px] font-mono font-semibold ${priorityColor}`}>
                            P{member.priority}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* How to read this */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-text-dim">How to read this</div>
        <div className="p-4 space-y-2">
          <p className="font-mono text-xs text-noc-text leading-relaxed">
            An <span className="text-noc-cyan font-semibold">Availability Group (AG)</span> is a unique set of servers shared by one or more CMGs.
            A <span className="text-noc-green font-semibold">safe pair</span> is two AGs that share <span className="text-noc-green">zero servers</span> — you can upgrade or lose all servers in one AG without affecting the other.
            An <span className="text-noc-red font-semibold">unsafe pair</span> shares at least one server — a single failure impacts both AGs.
          </p>
          <p className="font-mono text-xs text-noc-text-dim leading-relaxed">
            Each AG card below shows how many other AGs it can be safely paired with. For split-room redundancy (e.g. call center), phones on each side must be in CMGs that belong to AGs with 0% overlap.
          </p>
        </div>
      </div>

      {/* Blast Zones */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-cyan">
          Blast Zones — {blastZones.length} zone{blastZones.length !== 1 ? "s" : ""} detected
        </div>
        <div className="p-4 space-y-4">
          {blastZones.map((zone, zi) => (
            <div key={zi} className="border border-noc-border bg-noc-bg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs font-semibold text-noc-text-bright flex items-center gap-3">
                  <span>Zone {zi + 1}</span>
                  <span className="text-noc-border">|</span>
                  <span className="text-noc-text-dim font-normal">
                    {zone.channels.reduce((s, c) => s + c.cmgs.length, 0)} CMGs across {zone.channels.length} AG{zone.channels.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {zone.crossChannelServers.length > 0 && (
                  <span className="font-mono text-[10px] text-noc-red uppercase tracking-widest">
                    {zone.crossChannelServers.length} cross-AG server{zone.crossChannelServers.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {zone.channels.map((ch) => {
                  const color = CHANNEL_COLORS[ch.colorIdx % CHANNEL_COLORS.length];
                  const chServers = new Set(ch.servers);
                  const otherChannels = zone.channels.filter((other) => other.serverKey !== ch.serverKey);
                  const safePairCount = otherChannels.filter(
                    (other) => !other.servers.some((s) => chServers.has(s))
                  ).length;
                  const totalOther = otherChannels.length;
                  const isolationPct = totalOther > 0 ? Math.round((safePairCount / totalOther) * 100) : 100;
                  return (
                    <div key={ch.serverKey} className={`border ${isolationPct === 0 ? "border-noc-red/30" : isolationPct === 100 ? color.border : "border-noc-amber/30"} ${color.bg} px-4 py-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${color.text}`}>
                          {color.label}
                        </span>
                        <span className={`font-mono text-[10px] font-bold ${
                          isolationPct === 0 ? "text-noc-red" : isolationPct === 100 ? "text-noc-green" : "text-noc-amber"
                        }`}>
                          {safePairCount}/{totalOther} safe pairs
                        </span>
                      </div>
                      <div className="h-1.5 bg-noc-panel flex overflow-hidden mb-3">
                        <div className="h-full bg-noc-green/50" style={{ width: `${isolationPct}%` }} />
                        {isolationPct < 100 && <div className="h-full bg-noc-red/40" style={{ width: `${100 - isolationPct}%` }} />}
                      </div>
                      <div className="space-y-1 mb-3">
                        {ch.cmgs.map((cmg) => (
                          <div key={cmg.id} className="font-mono text-xs text-noc-text-bright">{cmg.name}</div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ch.servers.map((s) => {
                          const isCross = zone.crossChannelServers.includes(s);
                          return (
                            <span
                              key={s}
                              className={`inline-block px-2 py-0.5 text-[10px] font-mono font-semibold ${
                                isCross
                                  ? "bg-noc-red/15 text-noc-red border border-noc-red/30"
                                  : "bg-noc-panel text-noc-text border border-noc-border"
                              }`}
                              title={isCross ? "Cross-AG: shared with another availability group in this zone" : ""}
                            >
                              {s}{isCross ? " ⚠" : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {zone.crossChannelServers.length > 0 && (
                <div className="text-xs font-mono text-noc-red/80 mt-2">
                  Cross-AG servers ({zone.crossChannelServers.join(", ")}) — a failure here impacts multiple availability groups simultaneously.
                  {zone.channels.length === 2 && " These AGs are NOT independent."}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Safe Upgrade Pairs */}
      <UpgradePairs channels={blastZones.flatMap((z) => z.channels)} />
    </>
  );
}

function UpgradePairs({ channels }: { channels: { serverKey: string; servers: string[]; cmgs: CmGroup[]; colorIdx: number }[] }) {
  const [selectedAgs, setSelectedAgs] = useState<Set<number>>(new Set());

  const allPairs: {
    a: typeof channels[0];
    b: typeof channels[0];
    shared: string[];
    safe: boolean;
  }[] = [];

  for (let i = 0; i < channels.length; i++) {
    const serversA = new Set(channels[i].servers);
    for (let j = i + 1; j < channels.length; j++) {
      const shared = channels[j].servers.filter((s) => serversA.has(s));
      allPairs.push({ a: channels[i], b: channels[j], shared, safe: shared.length === 0 });
    }
  }

  // Filter pairs: show only pairs where at least one side matches a selected AG
  const pairs = selectedAgs.size === 0
    ? allPairs
    : allPairs.filter((p) => selectedAgs.has(p.a.colorIdx) || selectedAgs.has(p.b.colorIdx));

  const safePairs = pairs.filter((p) => p.safe);
  const unsafePairs = pairs.filter((p) => !p.safe);
  const totalSafe = allPairs.filter((p) => p.safe).length;
  const totalUnsafe = allPairs.filter((p) => !p.safe).length;

  const toggleAg = (idx: number) => {
    setSelectedAgs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const chLabel = (ch: typeof channels[0]) => {
    const color = CHANNEL_COLORS[ch.colorIdx % CHANNEL_COLORS.length];
    return { color, cmgNames: ch.cmgs.map((c) => c.name) };
  };

  const isFiltered = selectedAgs.size > 0;

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <div className="tmux-title text-noc-cyan flex items-center justify-between">
        <span>
          Upgrade Pairs — {isFiltered ? `${safePairs.length}/${totalSafe}` : safePairs.length} safe, {isFiltered ? `${unsafePairs.length}/${totalUnsafe}` : unsafePairs.length} unsafe
        </span>
        {isFiltered && (
          <button
            onClick={() => setSelectedAgs(new Set())}
            className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer normal-case tracking-normal"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* AG filter chips */}
      <div className="px-4 py-3 border-b border-noc-border flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mr-1">Filter:</span>
        {channels.map((ch) => {
          const color = CHANNEL_COLORS[ch.colorIdx % CHANNEL_COLORS.length];
          const isSelected = selectedAgs.has(ch.colorIdx);
          return (
            <button
              key={ch.colorIdx}
              onClick={() => toggleAg(ch.colorIdx)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[10px] transition-all cursor-pointer ${
                isSelected
                  ? `${color.border} ${color.bg} ${color.text}`
                  : "border-noc-border/50 bg-noc-bg text-noc-text-dim hover:border-noc-border-bright hover:text-noc-text"
              }`}
            >
              <span className={`w-2 h-2 ${isSelected ? color.dot : "bg-noc-border"}`} />
              {color.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-4">
        {safePairs.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-noc-green">
              Safe Pairs (0% overlap)
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {safePairs.map((p, i) => {
                const a = chLabel(p.a);
                const b = chLabel(p.b);
                return (
                  <div key={i} className="border border-noc-green/20 bg-noc-green/5 px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 shrink-0 ${a.color.dot}`} />
                        <span className={`font-mono text-[10px] font-bold ${a.color.text}`}>{a.color.label}</span>
                      </div>
                      <div className="font-mono text-xs text-noc-text truncate">
                        {a.cmgNames.join(", ")}
                      </div>
                      <div className="font-mono text-[10px] text-noc-text-dim mt-0.5">
                        {p.a.servers.join(", ")}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <span className="font-mono text-noc-green text-xl font-bold">0%</span>
                      <span className="font-mono text-[9px] text-noc-green uppercase tracking-widest">overlap</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 shrink-0 ${b.color.dot}`} />
                        <span className={`font-mono text-[10px] font-bold ${b.color.text}`}>{b.color.label}</span>
                      </div>
                      <div className="font-mono text-xs text-noc-text truncate">
                        {b.cmgNames.join(", ")}
                      </div>
                      <div className="font-mono text-[10px] text-noc-text-dim mt-0.5">
                        {p.b.servers.join(", ")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {unsafePairs.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-noc-red">
              Unsafe Pairs (shared servers)
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {unsafePairs
                .sort((a, b) => {
                  const pctA = a.shared.length / Math.max(a.a.servers.length, a.b.servers.length);
                  const pctB = b.shared.length / Math.max(b.a.servers.length, b.b.servers.length);
                  return pctB - pctA;
                })
                .map((p, i) => {
                const a = chLabel(p.a);
                const b = chLabel(p.b);
                const uniqueServers = new Set([...p.a.servers, ...p.b.servers]);
                const overlapPct = Math.round((p.shared.length / uniqueServers.size) * 100);
                return (
                  <div key={i} className="border border-noc-red/20 bg-noc-red/5 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 shrink-0 ${a.color.dot}`} />
                          <span className={`font-mono text-[10px] font-bold ${a.color.text}`}>{a.color.label}</span>
                        </div>
                        <div className="font-mono text-xs text-noc-text truncate">
                          {a.cmgNames.join(", ")}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-center gap-1">
                        <span className={`font-mono text-xl font-bold ${
                          overlapPct >= 50 ? "text-noc-red" : "text-noc-amber"
                        }`}>
                          {overlapPct}%
                        </span>
                        <span className="font-mono text-[9px] text-noc-text-dim uppercase tracking-widest">overlap</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 shrink-0 ${b.color.dot}`} />
                          <span className={`font-mono text-[10px] font-bold ${b.color.text}`}>{b.color.label}</span>
                        </div>
                        <div className="font-mono text-xs text-noc-text truncate">
                          {b.cmgNames.join(", ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-noc-panel flex overflow-hidden">
                        <div className="h-full bg-noc-green/40" style={{ width: `${100 - overlapPct}%` }} />
                        <div className="h-full bg-noc-red/60" style={{ width: `${overlapPct}%` }} />
                      </div>
                      <span className="font-mono text-[10px] text-noc-red shrink-0">
                        {p.shared.join(", ")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pairs.length === 0 && isFiltered && (
          <div className="text-center py-6">
            <p className="font-mono text-xs text-noc-text-dim uppercase tracking-widest">
              No pairs match the selected AGs
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
