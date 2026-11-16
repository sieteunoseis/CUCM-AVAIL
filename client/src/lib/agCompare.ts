import { shortName } from "./hostname";

type CmgLike = { members: { server_name: string }[] };

function serverSet(cmg: CmgLike): Set<string> {
  return new Set(cmg.members.map((m) => shortName(m.server_name)));
}

/** Sorted short server names used by both CMGs. */
export function sharedServers(a: CmgLike, b: CmgLike): string[] {
  const bs = serverSet(b);
  return [...serverSet(a)].filter((s) => bs.has(s)).sort();
}

type PoolLike = { name: string; cm_group_name: string | null; phone_count: number };

/**
 * Split device pools by blast radius of the selected CMGs: pools on a selected
 * CMG, pools on another CMG that shares a server with the selection, and the rest.
 */
export function classifyPools<P extends PoolLike>(
  pools: P[],
  cmGroups: ({ name: string } & CmgLike)[],
  selectedNames: string[],
): { onSelected: P[]; alsoImpacted: (P & { shared: string[] })[]; notImpacted: P[] } {
  const selected = new Set(selectedNames);
  const down = new Set<string>();
  for (const g of cmGroups) if (selected.has(g.name)) for (const s of serverSet(g)) down.add(s);
  const byName = new Map(cmGroups.map((g) => [g.name, g]));

  const onSelected: P[] = [];
  const alsoImpacted: (P & { shared: string[] })[] = [];
  const notImpacted: P[] = [];
  for (const p of pools) {
    if (p.cm_group_name && selected.has(p.cm_group_name)) {
      onSelected.push(p);
      continue;
    }
    const cmg = p.cm_group_name ? byName.get(p.cm_group_name) : undefined;
    const shared = cmg ? [...serverSet(cmg)].filter((s) => down.has(s)).sort() : [];
    if (shared.length > 0) alsoImpacted.push({ ...p, shared });
    else notImpacted.push(p);
  }
  const byPhones = (a: PoolLike, b: PoolLike) => b.phone_count - a.phone_count;
  return { onSelected: onSelected.sort(byPhones), alsoImpacted: alsoImpacted.sort(byPhones), notImpacted: notImpacted.sort(byPhones) };
}
