# AG Pick-and-Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Blast Zones and Upgrade Pairs on the Availability Groups tab with click-to-select / click-to-compare on the priority matrix.

**Architecture:** Pure helpers in `client/src/lib/agCompare.ts`, pinned by a `node:assert` script run with `npx tsx` (client has no test runner). `AvailabilityGroups.tsx` keeps the matrix, adds selection state, and drops the zone/pair sections.

**Tech Stack:** React 19 + TypeScript (Vite), Tailwind `noc-*` tokens, tsx.

**Spec:** `docs/superpowers/specs/2026-11-15-ag-pick-and-compare-design.md`

## Global Constraints
- Client-only. No device pools or phone counts.
- Server keys are `shortName(m.server_name)`, as the matrix already uses.
- Verdict copy: `✓ Safe pair: no shared servers` / `✗ Not safe: shares <servers>` (servers comma-separated).
- AG labels `AG-1`…`AG-N`, unique per distinct server set, numbered by first appearance in CMG name order (case-insensitive).

## Review Focus
- Clicking the selected row again clears both selection and compare.
- Clicking the compare row again clears only the compare; a third distinct row replaces the compare.
- Sorting the matrix while a selection exists keeps the selection (selection keyed by CMG id, not row index).
- A CMG with identical server set to the selected one shows ✗ shares all its servers, never ✓.
- A one-member CMG (e.g. Default, CMG-Test) compares correctly.

---

### Task 1: Pure helpers + check script

**Files:**
- Create: `client/src/lib/agCompare.ts`
- Create: `scripts/check-ag-compare.ts`

**Interfaces:**
- Produces:
  - `sharedServers(a: { members: { server_name: string }[] }, b: same): string[]` — sorted short names present in both.
  - `agNumbers<T extends { id: number; name: string; members: { server_name: string }[] }>(cmgs: T[]): Map<number, number>` — CMG id → AG number.

- [ ] **Step 1: Write `scripts/check-ag-compare.ts`** asserting:
  - `sharedServers` of `[a.x.com, b.x.com]` vs `[b.y.com, c.x.com]` → `["b"]`; disjoint → `[]`; identical sets → both names.
  - `agNumbers` on CMGs named `Zeta`{a,b}, `alpha`{c}, `Beta`{b,a} → alpha=1, Beta=2, Zeta=2.
  - prints `ag-compare checks passed`.
- [ ] **Step 2: Run** `npx tsx scripts/check-ag-compare.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `client/src/lib/agCompare.ts`.
- [ ] **Step 4: Run** the script. Expected: `ag-compare checks passed`.
- [ ] **Step 5: Commit** `Add AG compare helpers`.

### Task 2: Matrix selection, remove zones/pairs, Help, version

**Files:**
- Modify: `client/src/pages/AvailabilityGroups.tsx`
- Modify: `client/src/pages/Help.tsx` (Availability Groups section)
- Modify: `package.json` (1.5.0 → 1.6.0)

- [ ] **Step 1:** State `selectedId: number | null`, `compareId: number | null`. Row click rules per Review Focus. Selected row highlighted; with a selection, a trailing status column shows `✓` (green) or `✗ <shared>` (red) for other rows.
- [ ] **Step 2:** Header panel above the matrix: hint `Click a CM group to see which others share no servers with it.` when nothing selected; otherwise `Selected: <name> (<servers>)` + clear, and the verdict line when `compareId` is set.
- [ ] **Step 3:** AG column uses `agNumbers`; replace the cycling color label with `AG-<n>` (neutral styling). Delete Blast Zones, How to read this, `UpgradePairs`, union-find, `CHANNEL_COLORS`.
- [ ] **Step 4:** Help: replace Blast Zones / Cross-AG Servers / Upgrade Pairs with one "Comparing CM groups" entry; fix AG Numbering text (name order, not phone count).
- [ ] **Step 5: Verify** `cd client && npx tsc -p tsconfig.app.json --noEmit && cd .. && npm run build && npx tsx scripts/check-ag-compare.ts`; eslint error count ≤ 9 baseline.
- [ ] **Step 6: Browser check** on demo seed: select, compare safe + unsafe, re-click clears, sort keeps selection, no page errors.
- [ ] **Step 7: Commit** `Availability Groups: pick-and-compare on the matrix`.
