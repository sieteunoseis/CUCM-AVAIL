# Availability Groups: pick-and-compare on the matrix

## Why
The Availability Groups tab is used to plan a change or migration: "if I work on these servers / this CMG, which other CMGs are untouched?" Today the Blast Zones and Upgrade Pairs sections answer that with every combination at once (2 zones where there is really one, 105 pairs, "4/13 safe pairs" counts, AG labels whose 6 colors repeat). The priority matrix is the part that works.

## Goals
- Pick one CMG in the matrix and see at a glance which other CMGs share no servers with it.
- Pick a second CMG and get a one-line safe / not-safe verdict naming the shared servers.

## Non-goals
- Device pools and phone counts (user: leave device pools out for now).
- Server or API changes. Client-only.

## Approaches
1. **Click rows in the matrix (chosen).** The matrix stays the only view; selection marks the other rows. User approved.
2. Keep Upgrade Pairs, filtered to the selected CMG. Rejected: still a second list to cross-read.
3. A separate two-dropdown compare tool. Rejected: duplicates the matrix and loses the "everything safe with X" view.

## Design
- **Matrix:** unchanged columns, P1/P2/P3 cells and sorting.
- **Select:** clicking a CMG row selects it (click again to clear). Header line: `Selected: <CMG> (<servers>)` + `clear`.
- **Marks:** with a selection, every other row shows `✓` (no shared servers, green) or `✗ shares <servers>` (red) in a status column. The selected row is highlighted.
- **Compare:** clicking a second row sets it as the compare target (a third click replaces it; clicking the compare row again clears it). Verdict line: `✓ Safe pair: no shared servers` or `✗ Not safe: shares <servers>`.
- **AG column:** kept. Labels are unique numbers (`AG-1`…`AG-N`), not a repeating 6-color cycle; CMGs with the identical server set share an AG label. Numbering is by first appearance in CMG name order.
- **Removed:** Blast Zones section, Upgrade Pairs section, "How to read this" block (replaced by a one-line hint). Help page text updated to match.
- **Default (pub only):** an ordinary row; it shows ✓ against everything.
- Server matching uses the existing `shortName()` keys the matrix already uses.

## Left to the builder
- Exact colors/placement of the status column and verdict line, using `noc-*` tokens.
