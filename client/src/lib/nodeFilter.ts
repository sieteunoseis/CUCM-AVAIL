/**
 * Helpers for filtering Dashboard tables to a single selected node.
 * Server names are compared in full (never shortName()), so two hosts that
 * share a first label in different domains never match each other.
 */

export type FailoverDirection = "moved_off" | "landed_on";

interface FailoverLike {
  registered_server: string;
  primary_server: string;
}

/**
 * How a failover row relates to `node`:
 * - "landed_on": phones are registered to `node` (another node is their primary)
 * - "moved_off": `node` is their primary, but they're registered elsewhere
 * - null: the row doesn't involve `node`
 */
export function failoverDirection(row: FailoverLike, node: string): FailoverDirection | null {
  if (row.registered_server === node) return "landed_on";
  if (row.primary_server === node) return "moved_off";
  return null;
}

export function filterFailoverForNode<T extends FailoverLike>(rows: T[], node: string): T[] {
  return rows.filter((r) => failoverDirection(r, node) !== null);
}

export function filterCmGroupsForNode<T extends { members: { server_name: string }[] }>(
  groups: T[],
  node: string
): T[] {
  return groups.filter((g) => g.members.some((m) => m.server_name === node));
}
