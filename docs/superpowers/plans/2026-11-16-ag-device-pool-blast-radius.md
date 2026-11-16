# AG Device Pool Blast Radius Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List device pools in the blast radius of the selected CMG(s) under the Availability Groups matrix.

**Architecture:** Pure classifier in `client/src/lib/agCompare.ts`, pinned by `scripts/check-ag-compare.ts`. A `PoolBlastRadius` component in `AvailabilityGroups.tsx` fetches `api.getDevicePools()` once and renders the result.

**Tech Stack:** React 19 + TypeScript (Vite), Tailwind `noc-*`, tsx.

**Spec:** `docs/superpowers/specs/2026-11-16-ag-device-pool-blast-radius-design.md`

## Global Constraints
- Client-only; existing `GET /api/devicepools`.
- Down servers = union of selected CMGs' `shortName` server keys.
- Header copy per spec. Version 1.6.1 → 1.7.0.

## Review Focus
- Pool whose `cm_group_name` is null/unknown → not impacted, no crash.
- Compare CMG pools count as "on selected", not "also impacted".
- Pool counted once even if its CMG shares several servers.
- Selection cleared → panel hidden.
- 0-phone pools listed (dimmed), still counted in pool totals.

---

### Task 1: `classifyPools` + checks
**Interfaces — Produces:** `classifyPools(pools: DevicePoolInfo-like[], cmGroups: CmgWithName[], selectedNames: string[]): { onSelected: P[]; alsoImpacted: (P & { shared: string[] })[]; notImpacted: P[] }` — each list sorted by `phone_count` desc.
- [ ] Add assertions to `scripts/check-ag-compare.ts` (selected pool, shared-server pool with `shared` list, disjoint pool, null-CMG pool → notImpacted, compare-CMG pool → onSelected); run → FAIL; implement; run → `ag-compare checks passed`; commit.

### Task 2: Panel + version
- [ ] `PoolBlastRadius` under the matrix, hidden with no selection; header totals; two tables; 0-phone rows dimmed.
- [ ] Bump `package.json` to 1.7.0.
- [ ] Verify: client tsc, `npm run build`, check script, eslint count ≤ 9; browser check on demo seed (select one, select two, clear, no page errors).
- [ ] Commit; merge; tag v1.7.0; deploy.
