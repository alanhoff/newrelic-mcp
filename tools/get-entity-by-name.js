import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  name: z.string().describe("Fuzzy match by entity name (LIKE)."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum entities to return."),
  cursor: z.string().optional().describe("Pagination cursor."),
};

const run = nerdgraphActor(
  `
  entitySearch(query: $query, options: { limit: $limit }) {
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
  "$query: String!, $limit: Int, $cursor: String",
);

export const tool = async ({ name, limit = 10, cursor = null }) => {
  const q = `(accountId = ${ACCOUNT_ID}) AND (name LIKE '${name}')`;
  const actor = await run({ query: q, limit, cursor });
  return tagMapper(actor?.entitySearch ?? actor);
};
