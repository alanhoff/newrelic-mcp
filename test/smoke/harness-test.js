import assert from "node:assert/strict";
import test from "node:test";
import { installFetchStub, jsonResponse } from "../helpers/fetch-mock.js";
import { importFreshFromCwd, withEnv } from "../helpers/module-isolation.js";

test("harness helpers support isolated imports without real network calls", async (t) => {
  await withEnv(
    {
      API_KEY: "test-key",
      ACCOUNT_ID: "1234",
      NERDGRAPH_URL: "https://example.test/graphql",
    },
    async () => {
      const requests = [];
      const restoreFetch = installFetchStub(async (input, init = {}) => {
        requests.push({
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          method: init.method,
          url: String(input),
        });
        return jsonResponse({ data: { ok: true } });
      });
      t.after(restoreFetch);

      const { nerdgraphRaw } = await importFreshFromCwd("lib/nerdgraph.js");
      const result = await nerdgraphRaw("query { __typename }");

      assert.deepEqual(result, { data: { ok: true } });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://example.test/graphql");
      assert.equal(requests[0].method, "POST");
      assert.equal(requests[0].headers["api-key"], "test-key");
    },
  );
});
