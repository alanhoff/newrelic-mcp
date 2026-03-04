# Incident Correlation Checklist

Use this checklist while running `newrelic-incident-correlation`.

## Correlation Preconditions

- [ ] Primary entity GUID is validated and in scope.
- [ ] Investigation window is normalized to absolute UTC (`start_utc`, `end_utc`).
- [ ] Alerts and logs are captured independently before linking.
- [ ] Alert-side timestamps are present directly or enriched via supplemental NRQL.
- [ ] Every claim is tagged `verified` or `inference`.
- [ ] Possible concurrent streams are tracked with separate `stream_id` values.

## Alert Timestamp Enrichment Fallback

Use this when `getAlerts` returns condition/policy/incident fields but no time fields.

1. Keep the same absolute window.
2. If `incidentId` exists, run:

```sql
FROM NrAiIncident
SELECT latest(openTime) AS openTime, latest(closeTime) AS closeTime, latest(timestamp) AS timestamp
WHERE incidentId = '<INCIDENT_ID>'
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
```

3. If `incidentId` is missing, run:

```sql
FROM NrAiIncident
SELECT latest(openTime) AS openTime, latest(closeTime) AS closeTime, latest(timestamp) AS timestamp
WHERE entity.guid = '<ENTITY_GUID>' AND conditionName = '<CONDITION_NAME>'
SINCE '<START_ISO_UTC>'
UNTIL '<END_ISO_UTC>'
```

4. If both queries fail or return null-only rows, keep overlap decisions as `inference` and set run status to at most `partial`.

## Time-Window Patterns

Always convert relative requests into explicit absolute timestamps.

### Pattern A: Last 48 Hours

Use when the request says "last 48h" or equivalent.

1. Set `end_utc` to collection time in UTC.
2. Set `start_utc` to `end_utc - 48 hours`.
3. Reuse this exact pair across alerts, logs, relationships, and service levels.

Example:
- `end_utc = 2026-03-04T18:30:00Z`
- `start_utc = 2026-03-02T18:30:00Z`

### Pattern B: Custom Absolute Range

Use when an explicit date range is provided.

1. Parse user bounds exactly as UTC timestamps.
2. Reject ambiguous local timestamps until clarified.
3. Apply the same bounds to every tool call.

Example:
- `start_utc = 2026-02-27T00:00:00Z`
- `end_utc = 2026-03-01T23:59:59Z`

## Stream-Separation Rules

Treat each candidate stream as separate unless all checks below pass:

1. Time overlap is within the selected window.
2. Entity/service attributes point to the same impacted component.
3. Error/alert signature indicates the same failure mode.

If one or more checks fail, keep streams separate and mark cross-stream links as `inference`.

## Signal Collection Order

1. `getAlerts`
2. `getLogs`
3. `getRelatinshipsForGuid`
4. `getServiceLevelsForGuid`

Only run downstream steps after upstream evidence is captured.

## Failure Classes

Apply one primary class per run:
- `auth-scope-or-entity-blocked`
- `empty-alert-and-log-window`
- `alerts-missing-timestamps`
- `concurrent-streams-unresolved`
- `service-level-impact-unverified`
- `tooling-unverified`

## Reporting Skeleton

Return:
1. Primary class (or `resolved`).
2. Absolute window block.
3. Evidence table (`step`, `tool`, `input`, `result`, `stream_id`, `verified|inference`).
4. Confirmed same-stream links and separate-stream links.
5. One next action.
