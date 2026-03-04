import { z } from "zod";
import { nerdgraphActor, tagMapper } from "../lib/nerdgraph.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);

export const schema = {
  guid: z.string().describe("Exact match by entity GUID."),
};

const run = nerdgraphActor(
  `
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
`,
  "$guid: EntityGuid!",
);

export const tool = async ({ guid }) => {
  const actor = await run({ guid });
  const entity = actor?.entity ?? null;
  const ok = entity && Number(entity.accountId) === ACCOUNT_ID;
  return tagMapper({
    count: ok ? 1 : 0,
    results: {
      nextCursor: null,
      entities: ok ? [entity] : [],
    },
  });
};
