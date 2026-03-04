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
      "tools/get-service-levels-for-guid.js",
    );
    return callback(module);
  });
}

test("tool returns service level indicators and mapped tags", async (t) => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "SERVICE-1",
              name: "Checkout API",
              tags: [{ key: "team", values: ["platform"] }],
              serviceLevel: {
                indicators: [
                  {
                    guid: "SLI-1",
                    name: "Availability",
                    objectives: [
                      {
                        name: "30-day",
                        target: 99.9,
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "SERVICE-1" });

    assert.equal(seenBody.variables.guid, "SERVICE-1");
    assert.deepEqual(result.tags, ["team:platform"]);
    assert.equal(result.serviceLevel.indicators[0].name, "Availability");
  });
});

test("tool returns GraphQL error envelope unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "service level unavailable" }],
      }),
    );
    t.after(restoreFetch);

    const result = await tool({ guid: "SERVICE-MISSING" });

    assert.deepEqual(result, {
      errors: [{ message: "service level unavailable" }],
    });
  });
});
