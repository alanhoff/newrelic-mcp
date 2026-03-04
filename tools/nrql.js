import { z } from "zod";
import { nerdgraph, tagMapper } from "../lib/nerdgraph.js";

export const schema = {
  query: z.string().describe("NRQL query string to execute."),
};

// Always execute NRQL asynchronously and transparently poll until it completes.
// This avoids client/HTTP timeouts for long‑running NRQL while keeping the
// return shape the same (an array of result rows when successful).
const startAsyncNrql = nerdgraph(
  `nrql(query: $query, async: true) {
    results
    queryProgress {
      completed
      queryId
      retryAfter
      retryDeadline
      resultExpiration
    }
  }`,
  "$query: Nrql!",
);

const pollAsyncNrql = nerdgraph(
  `nrqlQueryProgress(queryId: $queryId) {
    results
    queryProgress {
      completed
      queryId
      retryAfter
      retryDeadline
      resultExpiration
    }
  }`,
  "$queryId: ID!",
);

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 10 * 60 * 1000; // safety cap to avoid infinite polling

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const tool = async ({ query }) => {
  const startedAt = Date.now();

  // Kick off async NRQL query
  const first = await startAsyncNrql({ query });

  // If NerdGraph returned a raw error envelope, bubble it up unchanged
  const firstContainer = first?.nrql;
  if (!firstContainer) {
    return tagMapper(first);
  }

  // Fast path: results already available (query completed within timeout)
  if (
    Array.isArray(firstContainer.results) &&
    (!firstContainer.queryProgress || firstContainer.queryProgress.completed)
  ) {
    return tagMapper(firstContainer.results);
  }

  const initialProgress = firstContainer.queryProgress;
  if (!initialProgress?.queryId) {
    // No queryId to poll with – fall back to returning whatever we have
    return tagMapper(firstContainer.results ?? first);
  }

  let lastContainer = firstContainer;
  const queryId = initialProgress.queryId;

  // Poll NerdGraph for completion using nrqlQueryProgress
  // at ~3s intervals (or longer if retryAfter suggests it).
  // The caller still just receives the final results array.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > MAX_WAIT_MS) {
      // Give back the latest container we have instead of looping forever
      return tagMapper(lastContainer.results ?? lastContainer);
    }

    const retryAfterSeconds = lastContainer.queryProgress?.retryAfter ?? 0;
    const waitMs = Math.max(POLL_INTERVAL_MS, retryAfterSeconds * 1000);
    await delay(waitMs);

    const progress = await pollAsyncNrql({ queryId });
    const container = progress?.nrqlQueryProgress;

    // If the shape is unexpected (e.g., GraphQL error envelope), return it
    if (!container) {
      return tagMapper(progress);
    }

    lastContainer = container;

    if (container.queryProgress?.completed) {
      return tagMapper(container.results ?? container);
    }
  }
};
