import assert from "node:assert/strict";
import test from "node:test";
import { installFetchStub, jsonResponse } from "../test/helpers/fetch-mock.js";
import {
  importFreshFromCwd,
  withEnv,
} from "../test/helpers/module-isolation.js";

const baseEnv = {
  ACCOUNT_ID: "424242",
  API_KEY: "test-api-key",
  NERDGRAPH_URL: "https://example.test/graphql",
};

async function withToolModule(envOverrides, callback) {
  return withEnv({ ...baseEnv, ...envOverrides }, async () => {
    const module = await importFreshFromCwd("tools/run-raw-nerdgraph-query.js");
    return callback(module);
  });
}

test("tool fails when API_KEY is missing", async () => {
  await withToolModule({ API_KEY: undefined }, async ({ tool }) => {
    await assert.rejects(
      () => tool({ query: "query { actor { user { id } } }" }),
      /API_KEY environment variable/,
    );
  });
});

test("tool fails when NERDGRAPH_URL is missing", async () => {
  await withToolModule({ NERDGRAPH_URL: undefined }, async ({ tool }) => {
    await assert.rejects(
      () => tool({ query: "query { actor { user { id } } }" }),
      /NERDGRAPH_URL environment variable/,
    );
  });
});

test("tool fails on HTTP non-OK responses", async (t) => {
  await withToolModule({}, async ({ tool }) => {
    const restoreFetch = installFetchStub(
      async () =>
        new Response("gateway timeout", {
          status: 504,
          statusText: "Gateway Timeout",
        }),
    );
    t.after(restoreFetch);

    await assert.rejects(
      () =>
        tool({
          query:
            "query Test($guid: EntityGuid!) { actor { entity(guid: $guid) { guid } } }",
          variables: { guid: "ENTITY-1" },
        }),
      /HTTP 504 Gateway Timeout/,
    );
  });
});

test("tool forwards raw query payload and maps tag arrays", async (t) => {
  await withToolModule({}, async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            entity: {
              guid: "ENTITY-1",
              tags: [{ key: "team", values: ["core", "platform"] }],
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({
      query:
        "query Test($guid: EntityGuid!) { actor { entity(guid: $guid) { guid tags { key values } } } }",
      variables: { guid: "ENTITY-1" },
    });

    assert.equal(seenBody.variables.guid, "ENTITY-1");
    assert.match(seenBody.query, /query Test/);
    assert.deepEqual(result.data.actor.entity.tags, [
      "team:core",
      "team:platform",
    ]);
  });
});
