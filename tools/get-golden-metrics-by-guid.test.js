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
      "tools/get-golden-metrics-by-guid.js",
    );
    return callback(module);
  });
}

test("tool returns entity golden metrics and mapped tags", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "ENTITY-1",
              name: "Checkout API",
              tags: [{ key: "team", values: ["core"] }],
              goldenMetrics: {
                context: {
                  guid: "ENTITY-1",
                  account: 424242,
                },
                metrics: [
                  {
                    name: "latency",
                    title: "Latency",
                    unit: "ms",
                  },
                ],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-1" });

    assert.equal(seenBody.variables.guid, "ENTITY-1");
    assert.equal(result.guid, "ENTITY-1");
    assert.deepEqual(result.tags, ["team:core"]);
    assert.equal(result.goldenMetrics.metrics[0].name, "latency");
  });
});

test("tool returns GraphQL error envelope unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "entity not found" }],
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "MISSING" });

    assert.deepEqual(result, {
      errors: [{ message: "entity not found" }],
    });
  });
});
