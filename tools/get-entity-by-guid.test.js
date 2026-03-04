import assert from "node:assert/strict";
import test from "node:test";
import { installFetchStub, jsonResponse } from "../test/helpers/fetch-mock.js";
import {
  importFreshFromCwd,
  withEnv,
} from "../test/helpers/module-isolation.js";

const testEnv = {
  API_KEY: "test-api-key",
  ACCOUNT_ID: "424242",
  NERDGRAPH_URL: "https://example.test/graphql",
};

async function withToolModule(callback) {
  return withEnv(testEnv, async () => {
    const module = await importFreshFromCwd("tools/get-entity-by-guid.js");
    return callback(module);
  });
}

test("tool returns one entity when guid belongs to scoped account", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "GUID-1",
              name: "Checkout API",
              accountId: 424242,
              tags: [{ key: "env", values: ["prod"] }],
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "GUID-1" });

    assert.equal(seenBody.variables.guid, "GUID-1");
    assert.equal(result.count, 1);
    assert.equal(result.results.nextCursor, null);
    assert.equal(result.results.entities.length, 1);
    assert.deepEqual(result.results.entities[0].tags, ["env:prod"]);
  });
});

test("tool returns empty result when account id does not match scope", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "GUID-2",
              name: "Another Service",
              accountId: 7,
              tags: [{ key: "env", values: ["dev"] }],
            },
          },
        },
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "GUID-2" });

    assert.equal(result.count, 0);
    assert.deepEqual(result.results.entities, []);
    assert.equal(result.results.nextCursor, null);
  });
});
