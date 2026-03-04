import { z } from "zod";
import { nerdgraph, tagMapper } from "../lib/nerdgraph.js";

export const schema = {
  guid: z.string().describe("Entity GUID to filter logs."),
  minutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Time window in minutes (default 60)."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max rows (default 25)."),
};

// Execute NRQL asynchronously for logs and poll until completion,
// returning the standard NRDB result container (with `results`).
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

const LOGS_POLL_INTERVAL_MS = 3000;
const LOGS_MAX_WAIT_MS = 10 * 60 * 1000;

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
    if (elapsed > LOGS_MAX_WAIT_MS) {
      return lastContainer;
    }

    const retryAfterSeconds = lastContainer.queryProgress?.retryAfter ?? 0;
    const waitMs = Math.max(LOGS_POLL_INTERVAL_MS, retryAfterSeconds * 1000);
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

export const tool = async ({ guid, minutes = 60, limit = 25 }) => {
  const nrql = `FROM Log SELECT timestamp, message, log.level, entity.guid WHERE entity.guid = '${guid}' SINCE ${minutes} minutes ago LIMIT ${limit}`;
  const container = await runAsyncNrqlWithPolling(nrql);
  return tagMapper(container);
};
