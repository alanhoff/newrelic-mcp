---
name: newrelic-entity-scout
description: Find and validate New Relic entities, establish correct account scope, and bootstrap baseline health metrics with New Relic MCP tools. Use when asked to find an entity GUID, confirm entity identity, troubleshoot entity search syntax/scope, or gather first-pass golden metrics before deeper NRQL or incident work.
---

# New Relic Entity Scout

Use this fixed order:
1. Credential and scope preflight
2. Entity discovery (`getEntityByName`, then `searchEntity` fallback)
3. GUID validation (`getEntityByGuid`)
4. Baseline metrics bootstrap (`getGoldenMetricsByGuid`)

Load [references/discovery-flow.md](references/discovery-flow.md) before running discovery.

## Required Inputs

- Entity hint (`name` or `guid`)
- Expected entity type/domain when known
- Absolute investigation window

If input is missing, set it to `unknown` and continue.

## Procedure

### 1) Run Credential and Scope Preflight

- Confirm New Relic MCP tools respond (`mcp__newrelic__introspection` or a minimal entity call).
- Confirm target account scope for the run.
- If credentials or account scope fail, classify as `auth-or-scope` and stop.

### 2) Run Entity Discovery

- If a GUID is not provided:
1. Run `mcp__newrelic__getEntityByName` with the strongest known name hint.
2. If empty or ambiguous, run `mcp__newrelic__searchEntity` with minimal query terms.
3. If `searchEntity` returns `INVALID_INPUT` for the tested pattern (common with hyphenated bare terms), mark that query pattern as `tooling-unverified` and continue discovery with narrower `getEntityByName` hints instead of retrying the same failing pattern.
- If a GUID is already provided, skip to Step 3 and mark discovery as `not-needed`.

### 3) Validate the GUID

- Run `mcp__newrelic__getEntityByGuid` on the selected candidate.
- Confirm name/type/domain match expected target.
- If mismatch or not found, return to Step 2 with narrower query terms.

### 4) Bootstrap Baseline Metrics

- Run `mcp__newrelic__getGoldenMetricsByGuid` for the validated GUID.
- Record metric availability and obvious null/empty gaps.
- If no metrics are returned, classify as `no-baseline-metrics` and report next action.

## Output Contract

Return:
1. `status` (`resolved`, `blocked`, or `partial`) and primary failure class if blocked.
2. Evidence table with `step`, `tool`, `input`, `result`, and `verified|inference`.
3. Final entity block (`guid`, `name`, `type`, `domain`).
4. Baseline metric summary from `getGoldenMetricsByGuid`.
5. One next action only.

## Guardrails

- Keep ordering deterministic; do not fetch metrics before GUID validation.
- Separate verified tool outputs from inference.
- Mark any non-executed query/filter pattern as `unverified`.
- Keep scope to entity discovery and bootstrap only.

## Non-Goals

- Deep NRQL rewrite workflows.
- Cross-signal incident correlation narratives.
