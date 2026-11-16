# CER subnet sync and a combined Subnets view

## Why
911 location in Cisco Emergency Responder (CER) depends on every phone subnet being defined in CER with the right ERL. CUCM-AVAIL already knows where phones actually are (RISPort IPs) and keeps its own subnet list, but:
- The Subnets tab shows the same subnets twice ("Defined Subnets (1,170)" and "Phone Distribution by Subnet"), which is noisy.
- 18,281 of 37,705 phones (48%) fall in no defined app subnet.
- Nothing tells you whether a subnet with phones is configured in CER, or configured with a different mask.

The user wants CER as an optional add-on so the app can (a) cross-reference its subnets with CER, (b) fill its own gaps from CER, and later (c) push subnets it found to CER.

## Goals
1. **Sync CER**: an optional, manual sync (like Sync AXL / Poll RISPort) that stores CER's IPv4 subnets locally.
2. **One subnet table** with expandable rows, replacing the two duplicate panels, showing CER status per subnet.
3. **Unmapped phones** grouped by the CER subnet that contains them, importable into the app (reviewed, not automatic). Phones CER does not cover either are shown as gaps.

## Non-goals
- Writing to CER (push subnets via `POST /cerappservices/service/ipsubnetphone`): later, separate work.
- IPv6 subnets.
- Scheduled/automatic CER sync.
- Removing the existing Discover panel (Scan RISPort / Paste / Scrape) — left as is.

## Anti-goals
- Sync CER must never change the app's own subnets by itself.
- A CER outage or missing CER config must not break the Subnets tab; the CER parts just disappear or say "not synced".

## Constraints
- Optional: enabled only when `CER_PUB`, `CER_USERNAME`, `CER_PASSWORD` are all set in `.env` (values come from the existing Windmill variables `f/CER/hostname`, `f/CER/username`, `f/CER/password`; the user copies them). Exposed to the client as `enableCer` in `GET /api/features`, alongside `enableGateways`.
- CER is self-signed; the deployed container already sets `NODE_TLS_REJECT_UNAUTHORIZED`.
- Disabled in `DEMO_MODE`, the same way Sync AXL is.
- Existing stack: Express + TypeScript + better-sqlite3 server, React 19 + Vite + Tailwind `noc-*` client.

## CER API (verified against brbcer01, CER 15, 2026-11-16)
- `GET https://{CER_PUB}/cerappservices/service/v1/ipsubnet?offset=<n>&limit=500`, Basic auth, `Accept: application/json`.
- Requires the account to have the API role; `cer-axl` was given it on 2026-11-16 (before that: 403 `{"status":"Access Denied"}`).
- Response: `subnetDetails.ipv4Subnets.subnet[]` with `subnetID` (e.g. `10.77.131.32`), `subnetMask` (dotted, e.g. `255.255.255.240`), `erlName`, `location`, `isnontrackable` (`"true"`/`"false"`), `phones.phone`; `paging` with `next`, `offset`, `limit`, `count` (3,417 total today → 7 pages of 500, ~400 KB each).
- Quirk: a single item comes back as an object instead of an array (`phones.phone`, and `subnet` must be assumed the same). `ipv6Subnets` may be `null`.
- Strings may carry trailing spaces (e.g. phone IPs) — trim all fields.
- The older `GET /cerappservices/export/ipsubnet/info` (XML, ~4 MB) also works but is not used.

## Approaches
1. **Store CER subnets via a manual Sync CER (chosen).** Matches how AXL and RISPort data already work; the tab works when CER is down; the user asked for a sync.
2. Fetch CER live (cached) when the Subnets tab loads. Rejected: user asked for a sync; ties page loads to CER.
3. Match in the browser. Rejected: ships ~3.4k CER subnets and ~37k phone IPs to the browser; the existing distribution is already computed on the server.

## Design

### Sync CER (server)
- `server/services/cer.service.ts`: pages through `v1/ipsubnet` until all `count` rows are read, normalizes object-vs-array, trims, converts `subnetID` + dotted mask to CIDR.
- Table `cer_subnets` (`cidr` UNIQUE, `subnet_id`, `mask`, `erl_name`, `location`, `nontrackable` INTEGER, `synced_at`). A sync replaces the table contents in one transaction, only after every page was fetched successfully (a failed sync leaves the previous data).
- A single `cer_sync` status (last success time, count, last error) is kept so the UI can show "CER: 3,417 subnets · last sync 2m ago" or the last error.
- `POST /api/cer/sync` (404/disabled when CER is not configured; no-op message in demo mode) and `GET /api/cer/status`.
- Phones listed by CER per subnet are not stored (not needed).
- Invalidates the cached subnet distribution.

### Dashboard
- A "Sync CER" button next to "Poll RISPort" and "Sync AXL", shown only when `enableCer`.

### Matching rules (server, per app subnet)
- **match**: a CER subnet with the identical CIDR exists.
- **mismatch ⚠**: no identical CIDR, but one or more CER subnets overlap it with a different mask; report the overlapping CER CIDR(s) and their ERL(s).
- **missing**: no CER subnet overlaps it.
- Only shown when CER has been synced at least once.

### Combined subnet table (client)
- Replaces "Phone Distribution by Subnet" and "Defined Subnets". One row per app subnet: CIDR, name, description, phones, CER status (when enabled), actions (edit/delete, as today). Sortable as today.
- Clicking a row expands it: CM group breakdown (what the distribution panel shows today) and, when CER is enabled, the matching/overlapping CER subnet(s) with ERL and location.
- Filter chips when CER is enabled: all / ⚠ mismatch / missing in CER.
- **Replace with CER** (mismatch rows only, plus "Replace all mismatches"): CER is treated as the more accurate source, because app subnets were often guessed from phone scraping. Replacing deletes our subnet and imports every CER subnet that overlaps it **and contains at least one RISPort phone IP** (name = ERL name, description = CER location). CER subnets that already exist in the app are skipped. A confirm step lists what will be removed and added.
- Header shows totals: subnets, mapped phones, unmapped phones.

### Unmapped phones (server + client)
- Phones whose RISPort IP falls in no app subnet are grouped:
  - **In CER**: by the CER subnet that contains the IP (most specific if several). Row: CER CIDR, ERL, location, phone count, Import button; plus "Import all".
  - **Not in CER**: by guessed /24 (same rule as today's Discover), labeled as a gap.
  - Phones with no IP are counted separately, not grouped.
- **Import** creates app subnets with cidr = CER CIDR, name = ERL name, description = CER location. Existing CIDRs are skipped (reported), as Discover does today.
- CER subnets that contain no RISPort phone IP are never shown or offered (user decision).
- When CER is not enabled, this section shows only the "not in CER"-style /24 grouping (i.e. what Discover finds today) without the CER group.

### Help
- Subnets section describes the combined table, CER status meanings, the unmapped section, and that CER needs the three `.env` settings plus an account with the CER API role.

## Decided by the user
- Optional feature via `.env` (`CER_PUB` etc.).
- Exact-CIDR = match; overlap with different mask = warning; otherwise missing.
- Stored via a manual "Sync CER", like AXL/RISPort.
- Merge the two subnet panels into one table with expandable rows.
- Show/import only subnets that contain RISPort phone IPs; skip the rest.
- Pushing subnets to CER is future work.
- When our subnet's mask differs from CER's, it can be replaced by CER's (CER wins; scraped app subnets are assumptions).

## Builder's calls (made by me, correctable)
- Import is reviewed (per-row + Import all), never automatic.
- Imported name = ERL name, description = CER location.
- Not-in-CER grouping uses /24 guesses like Discover.
- Discover panel stays.
- Use the JSON v1 endpoint, not the XML export.

- **Phone IP source**: a phone's IP is its current RISPort IP (`latest_registrations.ip_address`), falling back to `phones.last_known_ip`. Prod 2026-11-16: of the 18,281 "unmapped", 18,192 have no current IP (118 of those have a last-known IP), so only ~89 phones with an IP truly sit outside app subnets. The UI shows "no IP" as its own count instead of lumping it into "unmapped".
- **Broad CER subnets**: a containing CER subnet shorter than /22 is shown with a "broad" warning and left out of "Import all" (per-row Import still allowed, with the warning in the confirm). Same rule applies to Replace.
- **Shared-IP phones** (Expressway/MRA, detected by the existing `/shared-ips` logic) are excluded from grouping and import, and shown as their own count.
- **"Not in CER" gap rows** are view-only; importing guesses stays in the existing Discover panel.
- **Demo mode**: `enableCer` is forced false; no CER seed data.
- **Non-trackable CER subnets** ("Do Not Track") are ignored: Sync CER skips them, so they never match, import or replace anything (user decision; prod has 0 of 3,417 today). The sync status reports how many were skipped. The `nontrackable` column is dropped from `cer_subnets`.

## Left to the builder
- Exact layout, colors, and copy beyond what is fixed above (use `noc-*` tokens and existing table components).
- Whether the matching runs in a new `/api/subnets/overview` route or extends `/api/subnets/distribution`.
