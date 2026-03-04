import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

// Note: tool name follows the requested spelling "getRelatinshipsForGuid"
export const schema = {
  guid: z.string().describe("Entity GUID."),
  cursor: z.string().optional().describe("Pagination cursor."),
};

// Use the non-deprecated relatedEntities shape.
// We return source/target entity details without deprecated fields.
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
      relatedEntities(cursor: $cursor) {
        nextCursor
        results {
          source {
            entity {
              guid
              name
              type
              domain
              tags {
                key
                values
              }
            }
          }
          target {
            entity {
              guid
              name
              type
              domain
              tags {
                key
                values
              }
            }
          }
        }
      }
    }
  `,
  "$guid: EntityGuid!, $cursor: String",
);

export const tool = async ({ guid, cursor = null }) => {
  const actor = await run({ guid, cursor });
  return tagMapper(actor?.entity ?? actor);
};
