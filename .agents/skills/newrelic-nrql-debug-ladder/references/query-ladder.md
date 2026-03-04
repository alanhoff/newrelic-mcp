# NRQL Debug Ladder Reference

Use these templates in order. Keep the same absolute time window across all steps.

## Query Templates

### 1) Count Sanity Check
```sql
FROM <EVENT_TYPE>
SELECT count(*) AS row_count
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
```

Use to prove whether the event stream has any data in the investigation window.

### 2) Schema Discovery with `keyset()`
```sql
FROM <EVENT_TYPE>
SELECT keyset()
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
```

Use to validate that every query field exists on the exact event type.

### 3) Baseline Rewrite Skeleton
```sql
FROM <EVENT_TYPE>
SELECT count(*) AS baseline_count
WHERE <OPTIONAL_MINIMAL_FILTER>
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
```

Start from this baseline and add one filter, facet, or aggregation at a time.

### 4) Fallback Event-Type Comparison
```sql
FROM <EVENT_TYPE_A>, <EVENT_TYPE_B>, <EVENT_TYPE_C>
SELECT count(*)
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
FACET eventType()
```

Use when the original event type is empty or misses required fields.

## Failure Classification Checklist

Apply exactly one primary class, then list any secondary classes.

| Class | Trigger Signal | Primary Action |
| --- | --- | --- |
| `auth-or-scope` | NerdGraph/MCP permission or account errors | Fix credentials/account scope before query rewrites |
| `empty-data-window` | `count(*) = 0` for target event type | Expand or correct time window; verify ingestion state |
| `wrong-event-type` | Key fields absent on target event type but present on sibling type | Migrate query to correct event type and re-validate |
| `missing-field` | Referenced field absent in `keyset()` output | Remove/replace field with available schema field; check near-match typos (for example `conditionNam` -> `conditionName`) and verify with re-run |
| `sparse-or-null-field` | Field exists but yields mostly nulls | Add null guards or choose a denser field |
| `query-shape` | Syntax/aggregation/facet structure invalid | Rebuild from baseline and add clauses incrementally |
| `tooling-unverified` | Required query could not be executed | Mark outputs as inference and report exact blocker |

## Reporting Format

Return results as:
1. Failure class.
2. Evidence table (`step`, `query`, `result`, `verified|inference`).
3. Final query or explicit block reason.
