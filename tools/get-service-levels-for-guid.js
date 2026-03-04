import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

export const schema = {
  guid: z.string().describe("Entity GUID."),
};

// Query the supported shape on entity.serviceLevel:
// indicators { guid, name, entityGuid, objectives { name, target, timeWindow { rolling { count, unit } } } }
const run = nerdgraphActor(
  `
    entity(guid: $guid) {
      guid
      name
      serviceLevel {
        indicators {
          guid
          name
          entityGuid
          objectives {
            name
            target
            timeWindow {
              rolling {
                count
                unit
              }
            }
          }
        }
      }
      tags {
        key
        values
      }
    }
  `,
  "$guid: EntityGuid!",
);

export const tool = async ({ guid }) => {
  const actor = await run({ guid });
  return tagMapper(actor?.entity ?? actor);
};
