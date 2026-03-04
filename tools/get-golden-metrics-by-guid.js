import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

export const schema = {
  guid: z.string().describe("Entity GUID."),
  // Optional golden metrics time window in minutes (not all entities use this)
  minutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional time window in minutes for NRQL-based queries."),
};

// Use the stable goldenMetrics shape from NerdGraph:
// - context { guid, account }
// - metrics { name, title, unit, query, metricName }
const run = nerdgraphActor(
  `
    entity(guid: $guid) {
      guid
      name
      type
      domain
      tags {
        key
        values
      }
      goldenMetrics {
        context {
          guid
          account
        }
        metrics {
          name
          title
          unit
          query
          metricName
        }
      }
    }
  `,
  "$guid: EntityGuid!",
);

export const tool = async ({ guid }) => {
  const actor = await run({ guid });
  return tagMapper(actor?.entity ?? actor);
};
