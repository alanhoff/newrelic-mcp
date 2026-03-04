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
    const module = await importFreshFromCwd("tools/get-entity-by-name.js");
    return callback(module);
  });
}

test("tool scopes entity lookup by account and maps tags", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entitySearch: {
              count: 1,
              results: {
                nextCursor: "cursor-2",
                entities: [
                  {
                    guid: "GUID-1",
                    name: "Checkout API",
                    accountId: 424242,
                    tags: [{ key: "team", values: ["core", "platform"] }],
                  },
                ],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({
      name: "Checkout API",
      limit: 5,
      cursor: "cursor-1",
    });

    assert.equal(
      seenBody.variables.query,
      "(accountId = 424242) AND (name LIKE 'Checkout API')",
    );
    assert.equal(seenBody.variables.limit, 5);
    assert.equal(seenBody.variables.cursor, "cursor-1");

    assert.equal(result.count, 1);
    assert.equal(result.results.nextCursor, "cursor-2");
    assert.deepEqual(result.results.entities[0].tags, [
      "team:core",
      "team:platform",
    ]);
  });
});

test("tool returns GraphQL error envelope unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "invalid entity search query" }],
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ name: "Checkout API" });

    assert.deepEqual(result, {
      errors: [{ message: "invalid entity search query" }],
    });
  });
});
