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
    const module = await importFreshFromCwd("tools/get-dashboard-by-guid.js");
    return callback(module);
  });
}

test("tool returns dashboard entity when guid belongs to scoped account", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "DASH-1",
              name: "Main Dashboard",
              accountId: 424242,
              type: "DASHBOARD",
              tags: [{ key: "team", values: ["core"] }],
              pages: [],
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "DASH-1" });

    assert.equal(seenBody.variables.guid, "DASH-1");
    assert.equal(result.count, 1);
    assert.equal(result.results.entities.length, 1);
    assert.deepEqual(result.results.entities[0].tags, ["team:core"]);
  });
});

test("tool returns GraphQL errors unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "invalid dashboard guid" }],
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "DASH-ERROR" });

    assert.deepEqual(result, {
      errors: [{ message: "invalid dashboard guid" }],
    });
  });
});

test("tool returns empty envelope when entity is not a scoped dashboard", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "APP-1",
              name: "App",
              accountId: 7,
              type: "APPLICATION",
            },
          },
        },
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "APP-1" });

    assert.equal(result.count, 0);
    assert.equal(result.results.nextCursor, null);
    assert.deepEqual(result.results.entities, []);
  });
});
