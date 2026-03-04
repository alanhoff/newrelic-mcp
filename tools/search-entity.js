import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  query: z
    .string()
    .describe(
      "Freeform entitySearch query string (we append account scoping).",
    ),
  cursor: z.string().optional().describe("Pagination cursor."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum entities to return."),
  tagFilter: z
    .array(z.string())
    .optional()
    .describe("Tag keys to include with results."),
};

const run = nerdgraphActor(
  `
    entitySearch(query: $query, options: { limit: $limit, tagFilter: $tagFilter }) {
      query
      count
      results(cursor: $cursor) {
        nextCursor
        entities {
          guid
          name
          accountId
          domain
          type
          reporting
          permalink
          tags {
            key
            values
          }
        }
      }
    }
  `,
  "$query: String!, $cursor: String, $limit: Int, $tagFilter: [String!]",
);

export const tool = async ({
  query,
  cursor = null,
  limit = null,
  tagFilter = null,
}) => {
  // If the query is a simple name search, delegate to the by-name tool (more compatible across schemas)
  try {
    const m = /name\s*(?:LIKE|=)\s*'([^']+)'/i.exec(query || "");
    if (m?.[1]) {
      const { tool: byName } = await import("./get-entity-by-name.js");
      return tagMapper(await byName({ name: m[1], cursor, limit }));
    }
  } catch {}

  const accountClause = `accountId = ${ACCOUNT_ID}`;
  const q =
    query && query.trim().length > 0
      ? `(${accountClause}) AND (${query})`
      : accountClause;

  // General path: direct string query
  const actor = await run({ query: q, cursor, limit, tagFilter });
  return tagMapper(actor?.entitySearch ?? actor);
};
