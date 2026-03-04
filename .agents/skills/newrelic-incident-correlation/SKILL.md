---
name: newrelic-incident-correlation
description: Correlate New Relic incident signals across alerts, logs, related entities, and service levels with deterministic sequencing and time-bounded evidence. Use when asked to triage an active incident, determine whether concurrent failures are part of the same stream, or summarize impact for a bounded window such as the last 48 hours or a custom absolute range.
---

# New Relic Incident Correlation

Use this fixed order:
1. Investigation preflight
2. Alert stream capture (`getAlerts`)
3. Log stream capture (`getLogs`)
4. Relationship mapping (`getRelatinshipsForGuid`)
5. Service-level impact (`getServiceLevelsForGuid`)

Load [references/correlation-checklist.md](references/correlation-checklist.md) before running triage.

## Required Inputs

- Primary entity identifier (`guid` preferred, otherwise strongest known name)
- Incident question to resolve (for example, "same incident or separate streams")
- Investigation window start and end in absolute UTC timestamps

If any input is missing, set it to `unknown` and continue with explicit uncertainty notes.

## Procedure

### 1) Run Investigation Preflight

- Confirm New Relic MCP calls succeed (`mcp__newrelic__introspection` or one lightweight entity read).
- Confirm the target entity GUID. If only a name is provided, resolve/validate the GUID first.
- Normalize the window to absolute UTC start/end.
- If auth, scope, or entity identity cannot be validated, classify as `auth-scope-or-entity-blocked` and stop.

### 2) Capture Alert Stream

- Run `mcp__newrelic__getAlerts` for the validated GUID.
- Restrict interpretation to the normalized window.
- If alert rows do not include temporal fields (`timestamp`, `openTime`, `closeTime`), run a supplemental `mcp__newrelic__nrql` query (same window) keyed by `incidentId` or condition/entity filters to fetch timestamps before asserting time overlap.
- Group alert items by condition/policy/title and start time proximity.
- Do not merge alert groups with logs yet.

### 3) Capture Log Stream

- Run `mcp__newrelic__getLogs` for the same GUID and window.
- Cluster logs by error signature plus service/host attributes.
- Keep each cluster isolated until a correlation rule from the checklist is satisfied.
- Mark uncertain links as `inference`.

### 4) Map Related Entities

- Run `mcp__newrelic__getRelatinshipsForGuid` for dependency context.
- Validate high-signal neighbors before including them in the incident narrative.
- Record candidate upstream/downstream impact chains separately from the primary stream.

### 5) Assess Service-Level Impact

- Run `mcp__newrelic__getServiceLevelsForGuid`.
- Identify breached or degraded objectives inside the same window.
- Link service-level impact only to streams with verified time/attribute overlap.

## Output Contract

Return:
1. `status` (`resolved`, `partial`, or `blocked`) with one primary failure class when blocked.
2. Window block with absolute `start_utc` and `end_utc`.
3. Evidence table columns: `step`, `tool`, `input`, `result`, `stream_id`, `verified|inference`.
4. Stream-separation summary listing which signals are confirmed same-stream vs separate-stream.
5. One next action only.

## Guardrails

- Keep the triage order deterministic; do not start with logs or service levels before alerts.
- Use absolute UTC timestamps in outputs, even when user input is relative.
- Do not mark same-stream overlap as `verified` without timestamp evidence from alert-side data or supplemental NRQL enrichment.
- Keep concurrent streams separated until checklist correlation rules are met.
- Label every conclusion as `verified` or `inference`.
- Keep scope to New Relic incident correlation only.

## Non-Goals

- Deep NRQL rewrite flows (use `newrelic-nrql-debug-ladder`).
- Initial broad entity hunting without a primary candidate (use `newrelic-entity-scout`).
- External postmortem authoring in Jira or Confluence.
