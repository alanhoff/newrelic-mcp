import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  guid: z.string().describe("Exact match by dashboard GUID."),
};

const run = nerdgraphActor(
  `
  entity(guid: $guid) {
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
    ... on DashboardEntity {
      description
      permissions
      variables {
        name
        title
        type
        items {
          title
          value
        }
        defaultValues {
          value {
            string
          }
        }
        replacementStrategy
      }
      pages {
        guid
        name
        description
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
          linkedEntities {
            guid
          }
        }
      }
    }
  }
`,
  "$guid: EntityGuid!",
);

export const tool = async ({ guid }) => {
  const actor = await run({ guid });

  if (Array.isArray(actor?.errors) && actor.errors.length > 0) {
    return actor;
  }

  const entity = actor?.entity ?? null;
  const ok =
    entity &&
    Number(entity.accountId) === ACCOUNT_ID &&
    entity.type === "DASHBOARD";
  return {
    count: ok ? 1 : 0,
    results: {
      nextCursor: null,
      entities: ok ? [tagMapper(entity)] : [],
    },
  };
};
