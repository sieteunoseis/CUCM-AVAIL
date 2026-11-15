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
