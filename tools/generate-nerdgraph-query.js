import { z } from "zod";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  operation: z
    .enum(["nrql", "entitySearch", "entityByGuid"])
    .describe(
      "Template to generate. Supported: nrql, entitySearch, entityByGuid.",
    ),
  params: z
    .record(z.any())
    .optional()
    .describe("Operation-specific parameters."),
};

export const tool = async ({ operation, params = {} }) => {
  if (operation === "nrql") {
    const query = `
      query ($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
            }
          }
        }
      }
    `;
    const variables = { accountId: ACCOUNT_ID, query: "SELECT 1 AS example" };
    return { query, variables };
  }

  if (operation === "entitySearch") {
    const q =
      params.query || `accountId = ${ACCOUNT_ID} AND type IN ('APPLICATION')`;
    const query = `
      query ($cursor: String, $limit: Int) {
        actor {
          entitySearch(query: "${q.replace(/"/g, '\\"')}", options: { limit: $limit }) {
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
        }
      }
    `;
    const variables = { cursor: null, limit: params.limit ?? 1 };
    return { query, variables };
  }

  if (operation === "entityByGuid") {
    const query = `
      query ($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
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
    `;
    const variables = { guid: params.guid ?? "" };
    return { query, variables };
  }

  throw new Error(`Unsupported operation: ${operation}`);
};
