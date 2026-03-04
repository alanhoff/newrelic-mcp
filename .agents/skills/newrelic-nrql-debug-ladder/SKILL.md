---
name: newrelic-nrql-debug-ladder
description: Deterministically diagnose New Relic NRQL and NerdGraph queries that fail, return zero or null unexpectedly, or reference missing fields and mismatched event types. Use when asked to debug query correctness, schema mismatches, false-zero metrics, or to safely rewrite a failing New Relic query with verified evidence.
---

# New Relic NRQL Debug Ladder

Use a fixed ladder every time:
1. Environment preflight
2. `count(*)` sanity check
3. `keyset()` schema discovery
4. Full query rewrite
5. Fallback linkage strategy

Load [references/query-ladder.md](references/query-ladder.md) before writing or rewriting queries.

## Required Inputs

- Capture the failing query text exactly.
- Capture expected behavior and observed behavior.
- Capture explicit time window in absolute timestamps.
- Capture target account/entity context when available.

If one of these is missing, mark it as `unknown` and continue.

## Procedure

### 1) Run Environment Preflight

- Confirm New Relic MCP tools are callable (`mcp__newrelic__introspection` or a lightweight NRQL call).
- Confirm the target account/entity context used for diagnosis.
- If credential or permission errors appear, classify as `auth-or-scope` and stop rewriting queries.

### 2) Run `count(*)` Sanity Check

- Extract the event type from the failing query.
- Run the count template from `references/query-ladder.md`.
- If count is zero, do not trust downstream aggregations yet.
- Validate that the investigation window is correct before changing query logic.

### 3) Run `keyset()` Schema Discovery

- Run `keyset()` on the same event type and time window.
- Compare every referenced field in the failing query against discovered schema.
- If a field is absent, classify as `wrong-event-type` or `missing-field` before rewriting.
- If an absent field appears to be a near-match typo of a discovered field (for example `conditionNam` vs `conditionName`), record the corrected candidate and verify it by re-running the query with the corrected field.
- If a field exists but values are mostly null, classify as `sparse-or-null-field`.

### 4) Rewrite Query Deterministically

- Keep the original intent, but rewrite in this order:
1. Baseline query with only event type + time window.
2. Add one filter or aggregation at a time.
3. Re-run after each addition and record first breaking step.
- Prefer explicit aliases and explicit time windows.
- Never introduce unverified fields or functions.

### 5) Apply Fallback Linkage Strategy

- If the primary event type is empty or missing critical fields:
1. Identify likely sibling event types.
2. Run `count(*)` and `keyset()` on each candidate.
3. Propose migration of the query to the best-supported event type.
- Mark fallback mappings as `inference` until validated by executable query results.

## Output Contract

- Return:
1. Failure class from the checklist in `references/query-ladder.md`.
2. Evidence table with step, command/query, result, and `verified|inference`.
3. Final rewritten query (or explicit stop reason when blocked).
4. Next-step recommendation limited to one concrete action.

## Guardrails

- Always execute the ladder in order; do not jump to rewrite first.
- Keep findings time-bounded with explicit absolute timestamps.
- Label each conclusion as `verified` or `inference`.
- Keep scope to query-debug only; do not expand into entity cataloging or incident synthesis.

## Non-Goals

- Do not perform initial entity-hunting workflows.
- Do not produce cross-signal incident timelines.
