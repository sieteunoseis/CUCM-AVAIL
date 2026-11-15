# Dashboard Node Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Dashboard node tab is selected, filter the Failover Status and Call Manager Groups tables to rows involving that node, with a "show all" override.

**Architecture:** Put pure filter/classify helpers in `client/src/lib/nodeFilter.ts`. `FailoverPane` (in `Dashboard.tsx`) and `CmGroupTable` take an optional `node` prop and use the helpers. The client has no test runner, so a `node:assert` check script run with `npx tsx` pins the helper behavior.

**Tech Stack:** React 19 + TypeScript (Vite), Tailwind `noc-*` tokens, tsx.

**Spec:** `docs/superpowers/specs/2026-11-14-dashboard-node-filter-design.md`

## Global Constraints
- Client-only. No server or API changes.
- Match on full server names (`registered_server === node`), never `shortName()`.
- The "All" tab (`activeServer === null`) renders exactly as today: no Direction column, no highlight, no "N of M" header.
- Header copy: Failover `"<N> of <M> rows · show all"`; CMG `"<N> of <M> CM groups use <shortName(node)> · show all"`.
- Direction labels: `moved off →` (node is the primary) and `landed on ←` (node is the registered server).

## Review Focus
- Node with zero matching rows: Failover shows the "all on primary" state for that node; CMG shows `No CM groups use <node>`.
- Switching node tabs while "show all" is on resets to filtered (state keyed on node).
- A row where registered == primary (shouldn't happen in failover data): classify as `landed_on`, never crash.
- Highlight must still render in "show all" mode for the selected node's cells.
- CMG with fewer than 3 members: filtering and highlighting work on whatever priorities exist.

---

### Task 1: Pure helpers + check script

**Files:**
- Create: `client/src/lib/nodeFilter.ts`
- Create: `scripts/check-node-filter.ts`

**Interfaces:**
- Produces:
  - `type FailoverDirection = "moved_off" | "landed_on"`
  - `failoverDirection(row: { registered_server: string; primary_server: string }, node: string): FailoverDirection | null`: `moved_off` if `primary_server === node` and `registered_server !== node`; `landed_on` if `registered_server === node`; otherwise `null`.
  - `filterFailoverForNode<T extends { registered_server: string; primary_server: string }>(rows: T[], node: string): T[]`: rows where `failoverDirection` is not null.
  - `filterCmGroupsForNode<T extends { members: { server_name: string }[] }>(groups: T[], node: string): T[]`

- [ ] **Step 1: Write `scripts/check-node-filter.ts`** using `node:assert/strict`:
  - `failoverDirection({registered_server:"b", primary_server:"a"}, "a") === "moved_off"`
  - `failoverDirection({registered_server:"b", primary_server:"a"}, "b") === "landed_on"`
  - `failoverDirection({registered_server:"b", primary_server:"a"}, "c") === null`
  - `failoverDirection({registered_server:"a", primary_server:"a"}, "a") === "landed_on"`
  - `filterFailoverForNode` on rows `[a→b, c→d, b→e]` for node `"b"` returns 2 rows
  - `filterCmGroupsForNode` keeps a 2-member group containing the node and drops one without it; for node `"hq1.x.com"` it does NOT match a member `"hq1.y.com"` (full-name match)
  - prints `node-filter checks passed`
- [ ] **Step 2: Run** `npx tsx scripts/check-node-filter.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `client/src/lib/nodeFilter.ts` with the signatures above.
- [ ] **Step 4: Run** `npx tsx scripts/check-node-filter.ts`. Expected: `node-filter checks passed`.
- [ ] **Step 5: Commit** `git add client/src/lib/nodeFilter.ts scripts/check-node-filter.ts && git commit -m "Add dashboard node filter helpers"`

### Task 2: Wire into FailoverPane and CmGroupTable

**Files:**
- Modify: `client/src/pages/Dashboard.tsx` (`FailoverPane` ~L332, render sites ~L320-324)
- Modify: `client/src/components/CmGroupTable.tsx`
- Modify: `package.json` (version 1.4.0 → 1.5.0)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `FailoverPane` prop `node?: string | null`; `CmGroupTable` prop `node?: string | null`. Dashboard passes `activeServer?.name ?? null` to both.

- [ ] **Step 1: FailoverPane.** When `node` is set: `const [showAll, setShowAll] = useState(false)`, reset to false in a `useEffect` on `node`. Visible rows = `showAll ? failover : filterFailoverForNode(failover, node)`. The phone total sums the visible rows. Add a sortable `Direction` column (sort key `"direction"`) showing the label in `text-noc-amber` (moved off) or `text-noc-cyan` (landed on), blank when `failoverDirection` is null (show-all rows not involving the node). Title bar right side: `"<N> of <M> rows · "` + a `show all` / `show filtered` button. With zero filtered rows, use the existing empty state with the text `All phones on primary for <shortName(node)>`. With `node` null, nothing changes.
- [ ] **Step 2: CmGroupTable.** Same `showAll` and reset pattern. Visible = `showAll ? groups : filterCmGroupsForNode(groups, node)`. A member cell whose `server_name === node` gets `border border-noc-cyan/50 bg-noc-cyan/10 px-1` on its inner span (also in show-all). Title: `Call Manager Groups` + right side `"<N> of <M> CM groups use <shortName(node)> · "` + the toggle button. With zero visible rows, a single row `No CM groups use <shortName(node)>`.
- [ ] **Step 3: Pass `node={activeServer?.name ?? null}`** to both at their render sites in `Dashboard`.
- [ ] **Step 4: Verify.** Run `cd client && npx tsc -p tsconfig.app.json --noEmit && cd .. && npm run build && npx tsx scripts/check-node-filter.ts`. Expected: no type errors, `✓ built`, `node-filter checks passed`. Run `cd client && npx eslint src 2>&1 | grep -c " error "`. Expected: `9` (unchanged baseline).
- [ ] **Step 5: Browser check.** Run the app on the demo seed (`DEMO_MODE` / `npm run dev`), select a node tab, and confirm both tables filter, the Direction column shows, show all works and resets on tab change, and All looks like today.
- [ ] **Step 6: Commit** the changed files plus the spec and this plan: `git commit -m "Dashboard: filter Failover Status and CM Groups by selected node"`
