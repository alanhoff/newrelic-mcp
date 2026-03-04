# Entity Discovery Flow Reference

Use this reference while running `newrelic-entity-scout`.

## Credential Preflight Checklist

Run this checklist before entity lookup:
- [ ] New Relic MCP call succeeds (`mcp__newrelic__introspection` or one lightweight entity read).
- [ ] Target account scope is explicitly known for the run.
- [ ] Input hint (`name` or `guid`) is captured as provided.
- [ ] Absolute time window is set for follow-up metric checks.
- [ ] Any credential/scope failure is classified immediately as `auth-or-scope`.

## Operator Compatibility for `searchEntity`

Treat this table as a safety guide. Anything not executed in the current run must remain `unverified`.

| Pattern | Status | Usage Rule |
| --- | --- | --- |
| Single service/entity term without punctuation (for example `checkoutservice`) | verified-safe | Preferred first fallback query when `getEntityByName` is empty/ambiguous |
| Single hyphenated term (for example `checkout-service`) | verified-risky | May return `INVALID_INPUT` in scoped queries; if it fails, mark tested pattern as `tooling-unverified` and switch to narrower `getEntityByName` lookups |
| Quoted exact phrase (for example `"checkout-service"`) | verified-risky | Can fail in scoped query wrapping; prefer `getEntityByName` narrowing when this pattern errors |
| `OR` clauses combining multiple terms | unverified-risky | Avoid as first pass; test only after baseline discovery succeeds |
| Boolean predicates such as `IS TRUE` | unverified-risky | Do not assume support without direct execution evidence |
| Custom field/operator pairs (for example `domainType = ...`) | unverified-risky | Validate in isolation before using in production workflow |
| Multi-constraint expressions in first query | unverified-risky | Start simple, then add one constraint at a time |

## Deterministic Execution Ladder

1. Preflight credentials and scope.
2. Discover candidate with `getEntityByName`.
3. Fallback to `searchEntity` with minimal terms.
4. If `searchEntity` pattern fails with `INVALID_INPUT`, return to `getEntityByName` with narrower hints or exact target name.
5. Validate one candidate GUID via `getEntityByGuid`.
6. Bootstrap baseline metrics via `getGoldenMetricsByGuid`.

## Investigation Example 1: Service-Name Lookup

Goal: Find GUID for `checkout-service` and collect baseline health.

1. Preflight
- Tool: `mcp__newrelic__introspection`
- Result target: tools callable and account context known

2. Discovery by name
- Tool: `mcp__newrelic__getEntityByName`
- Input: `name="checkout-service"`, `limit=5`
- Decision: if one clear match, continue; otherwise fallback to `searchEntity`

3. Fallback query (if needed)
- Tool: `mcp__newrelic__searchEntity`
- Input: `query="checkout-service"`, `limit=10`
- Decision: choose top candidate only after checking name/type fit
- On `INVALID_INPUT`: switch back to `mcp__newrelic__getEntityByName` with a narrower or exact name hint

4. GUID validation
- Tool: `mcp__newrelic__getEntityByGuid`
- Input: candidate GUID
- Decision: confirm `name`, `type`, and `domain`

5. Metrics bootstrap
- Tool: `mcp__newrelic__getGoldenMetricsByGuid`
- Input: validated GUID, optional `minutes=60`
- Output: baseline golden metrics snapshot

## Investigation Example 2: GUID-First Lookup

Goal: Validate provided GUID and bootstrap metrics without name search.

1. Preflight
- Tool: `mcp__newrelic__introspection`
- Result target: credentials and scope usable

2. GUID validation
- Tool: `mcp__newrelic__getEntityByGuid`
- Input: provided GUID
- Decision: if not found or mismatched type/domain, mark `guid-invalid-or-out-of-scope`

3. Optional reverse discovery
- Tool: `mcp__newrelic__searchEntity`
- Input: known name fragments from caller (only if GUID check fails)
- Decision: capture replacement candidate GUID for caller approval

4. Metrics bootstrap
- Tool: `mcp__newrelic__getGoldenMetricsByGuid`
- Input: validated GUID
- Output: baseline health metrics and null/empty notes

## Failure Classes

Use one primary class per run:
- `auth-or-scope`
- `entity-not-found`
- `guid-invalid-or-out-of-scope`
- `no-baseline-metrics`
- `tooling-unverified`

## Reporting Skeleton

Return:
1. Primary failure class (or `resolved`).
2. Evidence table (`step`, `tool`, `input`, `result`, `verified|inference`).
3. Final selected entity (`guid`, `name`, `type`, `domain`).
4. Baseline metrics summary.
5. One next action.
