import { z } from "zod";
import { nerdgraph, tagMapper } from "../lib/nerdgraph.js";

export const schema = {
  guid: z.string().describe("Entity GUID to filter alerts."),
  days: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Time window in days (default 7)."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max rows (default 25)."),
};

// Execute NRQL asynchronously for alerts and poll until completion,
// then return the cleaned results array.
const startAsyncNrql = nerdgraph(
  `
    nrql(query: $query, async: true) {
      results
      queryProgress {
        completed
        queryId
        retryAfter
        retryDeadline
        resultExpiration
      }
    }
  `,
  "$query: Nrql!",
);

const pollAsyncNrql = nerdgraph(
  `
    nrqlQueryProgress(queryId: $queryId) {
      results
      queryProgress {
        completed
        queryId
        retryAfter
        retryDeadline
        resultExpiration
      }
    }
  `,
  "$queryId: ID!",
);

const ALERTS_POLL_INTERVAL_MS = 3000;
const ALERTS_MAX_WAIT_MS = 10 * 60 * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runAsyncNrqlWithPolling = async (query) => {
  const startedAt = Date.now();
  const first = await startAsyncNrql({ query });

  const firstContainer = first?.nrql;
  if (!firstContainer) {
    return first;
  }

  if (
    Array.isArray(firstContainer.results) &&
    (!firstContainer.queryProgress || firstContainer.queryProgress.completed)
  ) {
    return firstContainer;
  }

  const initialProgress = firstContainer.queryProgress;
  if (!initialProgress?.queryId) {
    return firstContainer;
  }

  let lastContainer = firstContainer;
  const queryId = initialProgress.queryId;

  // Poll for completion using nrqlQueryProgress, honoring retryAfter when present.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > ALERTS_MAX_WAIT_MS) {
      return lastContainer;
    }

    const retryAfterSeconds = lastContainer.queryProgress?.retryAfter ?? 0;
    const waitMs = Math.max(ALERTS_POLL_INTERVAL_MS, retryAfterSeconds * 1000);
    await delay(waitMs);

    const progress = await pollAsyncNrql({ queryId });
    const container = progress?.nrqlQueryProgress;

    if (!container) {
      return progress;
    }

    lastContainer = container;

    if (container.queryProgress?.completed) {
      return container;
    }
  }
};

export const tool = async ({ guid, days = 7, limit = 25 }) => {
  // Prefer incidents but union with violations to keep useful fields when present
  const query = `FROM AlertViolation, NrAiIncident SELECT latest(conditionName) AS conditionName, latest(policyName) AS policyName, latest(incidentId) AS incidentId, latest(violationCallbackUrl) AS url, latest(priority) AS priority WHERE entity.guid = '${guid}' SINCE ${days} days ago LIMIT ${limit}`;
  const container = await runAsyncNrqlWithPolling(query);
  const rows = container?.results ?? [];
  // Normalize: if the aggregation returns a single row with all nulls, return []
  const cleaned = Array.isArray(rows)
    ? rows.filter(
        (r) => r && Object.values(r).some((v) => v !== null && v !== undefined),
      )
    : [];

  return tagMapper(cleaned);
};
