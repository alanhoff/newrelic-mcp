import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  name: z.string().describe("Search dashboards by name."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum dashboards to return."),
  cursor: z.string().optional().describe("Pagination cursor."),
};

const searchDashboards = nerdgraphActor(
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
        permalink
        reporting
        tags {
          key
          values
        }
        ... on DashboardEntityOutline {
            permissions
        }
      }
    }
  }
`,
  "$query: String!, $limit: Int, $cursor: String",
);

const getDashboardDetails = nerdgraphActor(
  `
  entities(guids: $guids) {
      guid
      ... on DashboardEntity {
          name
          description
          permissions
          pages {
              guid
              name
              widgets {
                  id
                  title
                  visualization {
                      id
                  }
                  layout {
                      column
                      row
                      width
                      height
                  }
                  rawConfiguration
              }
          }
      }
  }
  `,
  "$guids: [EntityGuid]!",
);

export const tool = async ({ name, limit = 1, cursor = null }) => {
  const q = `(accountId = ${ACCOUNT_ID}) AND (type IN ('DASHBOARD')) AND (name LIKE '%${name}%')`;
  const searchResult = await searchDashboards({ query: q, limit, cursor });

  const entities = searchResult?.entitySearch?.results?.entities || [];

  if (entities.length === 0) {
    return tagMapper(searchResult?.entitySearch ?? searchResult);
  }

  const guids = entities.map((e) => e.guid);
  const detailsResult = await getDashboardDetails({ guids });
  const detailedEntities = detailsResult?.entities || [];

  // Create a map of guid -> details
  const detailsMap = new Map(detailedEntities.map((e) => [e.guid, e]));

  const mergedEntities = entities.map((e) => {
    const details = detailsMap.get(e.guid);
    // Merge search outline with full details. Details should take precedence.
    return { ...e, ...details };
  });

  return tagMapper({
    ...searchResult.entitySearch,
    results: {
      ...searchResult.entitySearch.results,
      entities: mergedEntities,
    },
  });
};
