# CER Subnet Sync + Combined Subnets View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional "Sync CER" that stores CER IPv4 subnets, and a Subnets tab that merges the two subnet panels into one expandable table with CER status, unmapped-phone grouping, and reviewed import/replace from CER.

**Architecture:** Pure matching/normalizing logic in `server/utils/cer.ts`, pinned by `scripts/check-cer.ts` (`npx tsx`; repo has no test runner). `server/services/cer.service.ts` fetches/pages CER and replaces a `cer_subnets` table. One server-computed `GET /api/subnets/overview` feeds the reworked client page.

**Tech Stack:** Express + TypeScript + better-sqlite3; React 19 + Vite + Tailwind `noc-*`; tsx.

**Spec:** `docs/superpowers/specs/2026-11-16-cer-subnet-sync-design.md`

## Global Constraints
- Enabled only when `CER_PUB`, `CER_USERNAME`, `CER_PASSWORD` are all non-empty **and** not `DEMO_MODE`; exposed as `enableCer` in `GET /api/features`.
- CER call: `GET https://{CER_PUB}/cerappservices/service/v1/ipsubnet?offset=<n>&limit=500`, Basic auth, `Accept: application/json`; follow `paging.next` until a page returns 0 subnets or offset ≥ `paging.count`.
- Normalize object-vs-array for `subnet` and `phones.phone`; trim all strings; `ipv6Subnets` ignored.
- `isnontrackable === "true"` subnets are skipped and counted as `skippedNontrackable`.
- Phone IP = `COALESCE(NULLIF(lr.ip_address,''), NULLIF(p.last_known_ip,''))`.
- Shared IP = an IP used by more than one phone (existing `/shared-ips` rule); such phones are excluded from grouping/import and counted.
- Status: identical CIDR → `match`; overlapping CER CIDR(s) with different mask → `mismatch`; none → `missing`.
- "broad" = CER prefix length < 22; excluded from Import all / Replace all; single-row actions allowed after a confirm.
- Import: name = `erl_name`, description = `location`; existing CIDRs skipped and reported.
- Replace (mismatch rows): delete our subnet, import every overlapping CER subnet that contains ≥1 phone IP; confirm lists removals and additions.
- Sync CER never edits app subnets. Version 1.7.0 → 1.8.0.

## Review Focus
- CER sync fails mid-pagination → previous `cer_subnets` untouched, status shows error.
- App has never synced CER (`cer_subnets` empty, last sync null) → no CER column/status, page still works.
- Phone IP inside two nested CER subnets → grouped under the most specific.
- Replace when none of the overlapping CER subnets contain phones → refuse with a message, our subnet kept.
- Import a CER CIDR that already exists in the app → skipped, counted, no error.

---

### Task 1: Pure CER helpers + checks

**Files:** Create `server/utils/cer.ts`, `scripts/check-cer.ts`.

**Interfaces — Produces:**
- `type CerSubnet = { cidr: string; subnetId: string; mask: string; erlName: string; location: string }`
- `maskToBits(mask: string): number | null` (contiguous dotted masks only)
- `normalizeCerPage(json: any): { subnets: CerSubnet[]; skippedNontrackable: number; count: number; returned: number }`
- `type CerStatus = "match" | "mismatch" | "missing"`
- `buildOverview(input: { appSubnets: {id:number;cidr:string;name:string;description:string}[]; cerSubnets: CerSubnet[] | null; phones: { ip: string | null; cmGroup: string }[] }): Overview` where
  `Overview = { totals: { phones; mapped; noIp; sharedIp; unmappedWithIp }; subnets: { id; cidr; name; description; phones: number; cmGroups: Record<string, number>; cerStatus?: CerStatus; cer?: { cidr; erlName; location; broad: boolean }[]; replaceWith?: string[] }[]; unmapped: { inCer: { cidr; erlName; location; phones: number; broad: boolean }[]; notInCer: { cidr: string; phones: number }[] } }`
  - `cerSubnets === null` → no `cerStatus`/`cer`/`replaceWith`, `inCer` empty, all unmapped go to `notInCer`.
  - Phones mapped by longest-prefix over app subnets; unmapped-with-IP → most specific containing CER subnet, else `/24` guess.
  - Shared IP computed inside from `phones` (IP seen on >1 phone).
  - `replaceWith` (mismatch only) = overlapping CER CIDRs that contain ≥1 phone IP (any phone, mapped or not), sorted.
  - `inCer`/`notInCer` sorted by phones desc; only CER subnets containing phones appear.

- [ ] **Step 1:** Write `scripts/check-cer.ts` (node:assert/strict) covering: `maskToBits("255.255.255.240")===28`, `maskToBits("255.0.255.0")===null`; `normalizeCerPage` with single-object `subnet`, a nontrackable one (skipped, counted), trailing spaces trimmed, `cidr "10.77.131.32/28"`; `buildOverview` with app `10.1.1.0/24` + CER `10.1.1.0/24` → match; app `10.2.0.0/24` + CER `10.2.0.0/25` & `10.2.0.128/25` (phone only in .0/25) → mismatch, `replaceWith ["10.2.0.0/25"]`; app `10.3.0.0/24` no CER → missing; unmapped phone `10.9.1.5` inside CER `10.9.0.0/16` and `10.9.1.0/24` → `inCer` cidr `10.9.1.0/24`; CER `10.9.0.0/16` → `broad: true` when it's the most specific; unmapped `172.16.5.9` no CER → `notInCer 172.16.5.0/24`; two phones on `10.50.0.1` → `sharedIp 2`, not grouped; phone with null IP → `noIp`; `cerSubnets: null` → no `cerStatus`. Prints `cer checks passed`.
- [ ] **Step 2:** Run `npx tsx scripts/check-cer.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `server/utils/cer.ts`, reusing `ipToLong`/`parseCidr` from `server/utils/subnet.ts`.
- [ ] **Step 4:** Run → `cer checks passed`.
- [ ] **Step 5:** Commit `Add CER subnet normalize/match helpers`.

### Task 2: Server — config, table, sync, routes

**Files:** Modify `server/config.ts`, `server/db/schema.sql`, `server/db/queries.ts`, `server/index.ts`, `server/routes/subnets.routes.ts`. Create `server/services/cer.service.ts`, `server/routes/cer.routes.ts`.

**Interfaces — Consumes:** Task 1. **Produces:**
- `config.cer = { host, username, password }`, `config.features.enableCer: boolean`.
- Tables: `cer_subnets (cidr TEXT PRIMARY KEY, subnet_id TEXT, mask TEXT, erl_name TEXT, location TEXT, synced_at TEXT)`; `cer_sync_status (id INTEGER PRIMARY KEY CHECK (id=1), last_success TEXT, subnet_count INTEGER, skipped_nontrackable INTEGER, last_error TEXT, last_attempt TEXT)`.
- `syncCer(): Promise<{ subnets: number; skippedNontrackable: number }>` — fetch all pages, then one transaction: delete + insert; on any error write `last_error`/`last_attempt` and rethrow without touching `cer_subnets`. Invalidates cache prefix `subnet:`.
- `POST /api/cer/sync` (400 `{error:"CER not configured"}` when disabled), `GET /api/cer/status` → `{ enabled, lastSuccess, subnetCount, skippedNontrackable, lastError, lastAttempt }`.
- `GET /api/subnets/overview` → `{ cer: CerStatusJson | null, ...Overview }` (cached under `subnet:overview`; `cerSubnets` passed as `null` unless enabled and `last_success` set).
- `POST /api/subnets/import-cer { cidrs: string[] }` → `{ created, skipped, errors }` (only CIDRs present in `cer_subnets`).
- `POST /api/subnets/replace-cer { subnetIds: number[] }` → `{ replaced, created, skipped, refused: {id, reason}[] }` — recomputes `replaceWith` server-side; refuses when empty.
- Both writes invalidate `subnet:`.
- `/api/features` adds `enableCer`.

- [ ] **Step 1:** Implement config + schema + queries + service + routes.
- [ ] **Step 2:** Verify `npx tsc -p tsconfig.json --noEmit` clean and `npx tsx scripts/check-cer.ts` passes.
- [ ] **Step 3:** Demo smoke: start `dist` server with `DEMO_MODE=true` on port 3911; `GET /api/features` → `enableCer:false`; `GET /api/subnets/overview` returns totals and subnets, no `cer`; `POST /api/cer/sync` → 400.
- [ ] **Step 4:** Commit `Add optional CER subnet sync and subnet overview API`.

### Task 3: Client — Sync CER button, combined Subnets table, Help, version

**Files:** Modify `client/src/api/client.ts`, `client/src/pages/Dashboard.tsx`, `client/src/pages/Subnets.tsx`, `client/src/pages/Help.tsx`, `package.json`.

- [ ] **Step 1:** API types/methods: `getSubnetOverview`, `syncCer`, `getCerStatus`, `importCerSubnets(cidrs)`, `replaceWithCer(subnetIds)`; `FeatureFlags.enableCer`.
- [ ] **Step 2:** Dashboard: "Sync CER" button next to "Sync AXL" when `enableCer`; shows syncing state; error surfaced as today.
- [ ] **Step 3:** Subnets: replace "Phone Distribution by Subnet" and "Defined Subnets" with one table from `/overview`: CIDR, name, description, phones, CER status (when `cer`), actions (edit/delete kept). Row click expands CM group chips + CER subnet(s) with ERL/location/broad. Header totals: subnets, mapped, no IP, shared IP. Filter chips (when `cer`): all / mismatch / missing. CER line: `CER: <n> subnets · last sync <relative>` or last error. Mismatch rows: "Replace with CER" (confirm lists remove/add); "Replace all mismatches" (skips broad).
- [ ] **Step 4:** Unmapped section: "In CER" rows with Import + "Import all" (skips broad, confirm); "Not in CER" view-only; counts for no IP and shared IP.
- [ ] **Step 5:** Help: Subnets section per spec; `package.json` 1.8.0.
- [ ] **Step 6:** Verify client tsc, `npm run build`, both check scripts, eslint error count ≤ 9; demo browser check (table renders, expand works, no CER UI, no page errors).
- [ ] **Step 7:** Commit `Subnets: combined table with CER status, unmapped grouping, import/replace`.

### Task 4: Release + live check
- [ ] Merge to main, push, tag `v1.8.0`, wait for image build, `docker compose pull && up -d` in `biccapps-docker-compose/cucm-avail`.
- [ ] Live: `POST /api/cer/sync` → `subnets ≈ 3417`, `skippedNontrackable 0`; `GET /api/subnets/overview` totals match `/distribution` (mapped + unmapped = 37,705 phones); report status counts. Do **not** run import/replace on prod — that's the user's call.
- [ ] Discard Windmill draft `u/wordenj/cer_ipsubnet_probe`.
