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
    const module = await importFreshFromCwd("tools/get-dashboard-by-name.js");
    return callback(module);
  });
}

test("tool short-circuits when dashboard search returns no entities", async (t) => {
  await withToolModule(async ({ tool }) => {
    const seenBodies = [];
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBodies.push(JSON.parse(init.body));
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

    const result = await tool({ name: "Ops", limit: 3, cursor: "cursor-1" });

    assert.equal(seenBodies.length, 1);
    assert.equal(
      seenBodies[0].variables.query,
      "(accountId = 424242) AND (type IN ('DASHBOARD')) AND (name LIKE '%Ops%')",
    );
    assert.equal(seenBodies[0].variables.limit, 3);
    assert.equal(seenBodies[0].variables.cursor, "cursor-1");

    assert.equal(result.count, 0);
    assert.deepEqual(result.results.entities, []);
  });
});

test("tool merges dashboard outline results with details by guid", async (t) => {
  await withToolModule(async ({ tool }) => {
    const seenBodies = [];
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      const body = JSON.parse(init.body);
      seenBodies.push(body);

      if (seenBodies.length === 1) {
        return jsonResponse({
          data: {
            actor: {
              entitySearch: {
                count: 2,
                results: {
                  nextCursor: "cursor-2",
                  entities: [
                    {
                      guid: "DASH-1",
                      name: "Overview",
                      accountId: 424242,
                      type: "DASHBOARD",
                      tags: [{ key: "team", values: ["core"] }],
                    },
                    {
                      guid: "DASH-2",
                      name: "Errors",
                      accountId: 424242,
                      type: "DASHBOARD",
                      tags: [{ key: "team", values: ["sre"] }],
                    },
                  ],
                },
              },
            },
          },
        });
      }

      return jsonResponse({
        data: {
          actor: {
            entities: [
              {
                guid: "DASH-1",
                name: "Overview Detailed",
                description: "Primary dashboard",
                pages: [
                  {
                    guid: "PAGE-1",
                    name: "Page 1",
                    widgets: [],
                  },
                ],
              },
            ],
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ name: "Board", limit: 2 });

    assert.equal(seenBodies.length, 2);
    assert.deepEqual(seenBodies[1].variables.guids, ["DASH-1", "DASH-2"]);

    assert.equal(result.count, 2);
    assert.equal(result.results.nextCursor, "cursor-2");
    assert.equal(result.results.entities[0].guid, "DASH-1");
    assert.equal(result.results.entities[0].name, "Overview Detailed");
    assert.equal(result.results.entities[0].description, "Primary dashboard");
    assert.deepEqual(result.results.entities[0].tags, ["team:core"]);

    assert.equal(result.results.entities[1].guid, "DASH-2");
    assert.equal(result.results.entities[1].name, "Errors");
    assert.deepEqual(result.results.entities[1].tags, ["team:sre"]);
  });
});
