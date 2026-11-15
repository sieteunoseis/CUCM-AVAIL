# Dashboard: filter Failover Status and CM Groups by selected node

## Why
The Dashboard is too busy. Selecting a node tab changes only the header, the stats row and the node card. The Failover Status and Call Manager Groups tables below keep showing everything, so with 22 CMGs the selected node's rows are hard to find.

## Goals
- When a node tab is selected, both tables show only rows that involve that node.
- It is obvious that the tables are filtered, and the full list is one click away.
- "All" behaves exactly as it does today.

## Non-goals
- No server/API changes. Filtering is client-side on data the Dashboard already loads.
- No other Dashboard restructuring. Splitting the page up is a separate step.

## Approaches
1. **Filter both tables by default, with a "show all" override (chosen).** The user picked this.
2. Highlight matching rows but keep every row. Rejected: it doesn't make the page less busy.
3. Filter only the Failover table. Rejected: the CMG table is the longer one (22 rows).

## Design
- **Failover Status**: keep rows where the selected node is the `registered_server` or the `primary_server`. Add a **Direction** column:
  - `moved off →`: the node is the primary (Should Be), so its phones are registered somewhere else.
  - `landed on ←`: the node is where they are registered, but another node is the primary.
  - Header: `<N> of <M> rows · show all`, and the phone total covers only the filtered rows.
- **Call Manager Groups**: keep CMGs with the node at any priority. Highlight the node's cell (P1/P2/P3) with a border and background.
  - Header: `<N> of <M> CM groups use <node> · show all`.
- **"show all"**: shows every row again, while still highlighting the selected node's cells or rows. It resets to filtered when the selected node changes.
- **"All" tab**: no filter, no Direction column, no highlight. Same as today.
- **No match**: the Failover pane shows its existing "all phones on primary" state, worded for the node. The CMG table shows "No CM groups use <node>".
- Matching compares full server names (e.g. `registered_server === activeServer.name`), never `shortName()`.

## Left to the builder
- Exact colors for the highlight and the Direction labels, using the existing `noc-*` tokens.
