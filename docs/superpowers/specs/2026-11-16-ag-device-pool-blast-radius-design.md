# Availability Groups: device pools in the blast radius

## Why
Change/migration planning ends at the device pool: "if the selected CMGs' servers go down, which device pools (and how many phones) are hit?" The matrix answers it at CMG level only.

## Goals
- With one or two CMGs selected, list the device pools in their blast radius below the matrix.

## Non-goals
- Server/API changes (uses existing `GET /api/devicepools`: id, name, cm_group_name, phone_count).
- Trunk/gateway breakdown.

## Approaches
1. **Panel under the matrix, two sections (chosen, user approved).**
2. Inline pool counts in the matrix status column. Rejected: hides which pools.
3. Link out to the Simulation page. Rejected: separate workflow, loses the selection.

## Design
- Selection = the selected CMG and (if set) the compare CMG. "Down" servers = union of their servers (`shortName` keys).
- **On selected groups:** pools whose `cm_group_name` is a selected CMG. Columns: pool, CMG, AG, phones.
- **Also impacted (shared servers):** pools on other CMGs whose CMG shares ≥1 down server. Columns: pool, CMG, AG, phones, shared servers.
- **Not impacted:** count + phones only, in the header.
- Header: `<n> pools · <phones> phones on selected · <n> pools · <phones> phones also impacted · <n> pools not impacted`.
- Pools with 0 phones listed dimmed. Rows sorted by phones desc.
- Pools whose CMG is unknown/none count as not impacted.
- Hidden when nothing is selected.

## Left to the builder
- Styling with `noc-*` tokens; AG via existing `AgBadge`/`cmgToAg`.
