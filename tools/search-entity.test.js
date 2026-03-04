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
    const module = await importFreshFromCwd("tools/search-entity.js");
    return callback(module);
  });
}

test("tool appends account scope and forwards pagination and tag filters", async (t) => {
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
                    guid: "GUID-APP-1",
                    accountId: 424242,
                    name: "Checkout API",
                    tags: [{ key: "team", values: ["core"] }],
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
      query: "type = 'APPLICATION'",
      cursor: "cursor-1",
      limit: 10,
      tagFilter: ["team"],
    });

    assert.equal(
      seenBody.variables.query,
      "(accountId = 424242) AND (type = 'APPLICATION')",
    );
    assert.equal(seenBody.variables.cursor, "cursor-1");
    assert.equal(seenBody.variables.limit, 10);
    assert.deepEqual(seenBody.variables.tagFilter, ["team"]);
    assert.match(seenBody.query, /tagFilter/);

    assert.equal(result.count, 1);
    assert.deepEqual(result.results.entities[0].tags, ["team:core"]);
  });
});

test("tool delegates simple name queries to get-entity-by-name", async (t) => {
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
                nextCursor: null,
                entities: [
                  {
                    guid: "GUID-APP-2",
                    accountId: 424242,
                    name: "Checkout API",
                    tags: [{ key: "env", values: ["prod"] }],
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
      query: "name LIKE 'Checkout API'",
      cursor: "cursor-9",
      limit: 2,
      tagFilter: ["should-not-be-forwarded"],
    });

    assert.doesNotMatch(seenBody.query, /tagFilter/);
    assert.equal(
      seenBody.variables.query,
      "(accountId = 424242) AND (name LIKE 'Checkout API')",
    );
    assert.equal(seenBody.variables.cursor, "cursor-9");
    assert.equal(seenBody.variables.limit, 2);
    assert.equal(result.count, 1);
    assert.deepEqual(result.results.entities[0].tags, ["env:prod"]);
  });
});

test("tool falls back to account-only query when query is blank", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entitySearch: {
              count: 0,
              results: {
                nextCursor: null,
                entities: [],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ query: "   " });

    assert.equal(seenBody.variables.query, "accountId = 424242");
    assert.equal(result.count, 0);
    assert.deepEqual(result.results.entities, []);
  });
});
