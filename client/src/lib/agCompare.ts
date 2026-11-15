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

/**
 * CMG id -> AG number. CMGs with the identical server set share a number;
 * numbers are assigned by first appearance in case-insensitive name order.
 */
export function agNumbers<T extends { id: number; name: string } & CmgLike>(cmgs: T[]): Map<number, number> {
  const byKey = new Map<string, number>();
  const result = new Map<number, number>();
  const ordered = [...cmgs].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  for (const cmg of ordered) {
    const key = [...serverSet(cmg)].sort().join(",");
    if (!byKey.has(key)) byKey.set(key, byKey.size + 1);
    result.set(cmg.id, byKey.get(key)!);
  }
  return result;
}
