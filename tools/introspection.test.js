import assert from "node:assert/strict";
import test from "node:test";
import { installFetchStub, jsonResponse } from "../test/helpers/fetch-mock.js";
import {
  importFreshFromCwd,
  withEnv,
} from "../test/helpers/module-isolation.js";

const baseEnv = {
  API_KEY: "test-api-key",
  NERDGRAPH_URL: "https://example.test/graphql",
};

async function withToolModule(envOverrides, callback) {
  return withEnv({ ...baseEnv, ...envOverrides }, async () => {
    const module = await importFreshFromCwd("tools/introspection.js");
    return callback(module);
  });
}

test("tool fails when API_KEY is missing", async () => {
  await withToolModule({ API_KEY: undefined }, async ({ tool }) => {
    await assert.rejects(() => tool(), /API_KEY environment variable/);
  });
});

test("tool fails when NERDGRAPH_URL is missing", async () => {
  await withToolModule({ NERDGRAPH_URL: undefined }, async ({ tool }) => {
    await assert.rejects(() => tool(), /NERDGRAPH_URL environment variable/);
  });
});

test("tool fails on HTTP non-OK responses", async (t) => {
  await withToolModule({}, async ({ tool }) => {
    const restoreFetch = installFetchStub(
      async () =>
        new Response("service unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        }),
    );
    t.after(restoreFetch);

    await assert.rejects(() => tool(), /HTTP 503 Service Unavailable/);
  });
});

test("tool returns introspection schema on success", async (t) => {
  await withToolModule({}, async ({ tool }) => {
    let seenHeaders;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenHeaders = init.headers;
      return jsonResponse({
        data: {
          __schema: {
            queryType: { name: "Query" },
            types: [{ kind: "OBJECT", name: "Query" }],
            directives: [{ name: "include" }],
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool();

    assert.equal(seenHeaders["API-Key"], "test-api-key");
    assert.deepEqual(result, {
      queryType: { name: "Query" },
      types: [{ kind: "OBJECT", name: "Query" }],
      directives: [{ name: "include" }],
    });
  });
});
