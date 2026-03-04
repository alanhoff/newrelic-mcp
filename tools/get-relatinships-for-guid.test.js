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
    const module = await importFreshFromCwd(
      "tools/get-relatinships-for-guid.js",
    );
    return callback(module);
  });
}

test("tool returns related entities with mapped tags and cursor support", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "ENTITY-1",
              tags: [{ key: "team", values: ["core"] }],
              relatedEntities: {
                nextCursor: "cursor-2",
                results: [
                  {
                    source: {
                      entity: {
                        guid: "SOURCE-1",
                        tags: [{ key: "env", values: ["prod"] }],
                      },
                    },
                    target: {
                      entity: {
                        guid: "TARGET-1",
                        tags: [{ key: "env", values: ["staging"] }],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-1", cursor: "cursor-1" });

    assert.equal(seenBody.variables.guid, "ENTITY-1");
    assert.equal(seenBody.variables.cursor, "cursor-1");

    assert.deepEqual(result.tags, ["team:core"]);
    assert.deepEqual(result.relatedEntities.results[0].source.entity.tags, [
      "env:prod",
    ]);
    assert.deepEqual(result.relatedEntities.results[0].target.entity.tags, [
      "env:staging",
    ]);
  });
});

test("tool sends null cursor by default", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "ENTITY-2",
              relatedEntities: {
                nextCursor: null,
                results: [],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-2" });

    assert.equal(seenBody.variables.cursor, null);
    assert.equal(result.guid, "ENTITY-2");
  });
});

test("tool returns GraphQL error envelope unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "relationship query failed" }],
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-ERR" });

    assert.deepEqual(result, {
      errors: [{ message: "relationship query failed" }],
    });
  });
});
