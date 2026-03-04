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

async function withNerdgraphModule(callback) {
  return withEnv(testEnv, async () => {
    const module = await importFreshFromCwd("lib/nerdgraph.js");
    return callback(module);
  });
}

test("tagMapper maps tag arrays into key:value strings recursively", async () => {
  await withNerdgraphModule(({ tagMapper }) => {
    const input = {
      entity: {
        tags: [
          { key: "env", values: ["prod", "staging"] },
          { key: "team", values: ["core"] },
        ],
      },
      untouched: "value",
    };

    const output = tagMapper(input);

    assert.deepEqual(output, {
      entity: {
        tags: ["env:prod", "env:staging", "team:core"],
      },
      untouched: "value",
    });
  });
});

test("tagMapper returns non-plain-object inputs unchanged", async () => {
  await withNerdgraphModule(({ tagMapper }) => {
    assert.equal(tagMapper(null), null);
    assert.equal(tagMapper("value"), "value");
    assert.equal(tagMapper(42), 42);
  });
});

test("nerdgraph sends wrapped account query and returns account data", async (t) => {
  await withNerdgraphModule(async ({ nerdgraph }) => {
    let seenRequest;
    const restoreFetch = installFetchStub(async (input, init = {}) => {
      seenRequest = { input, init };
      return jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [{ count: 10 }],
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const execute = nerdgraph("nrql(query: $nrql) { results }", [
      "$nrql: Nrql!",
    ]);
    const result = await execute({ nrql: "SELECT count(*) FROM Transaction" });

    assert.deepEqual(result, { nrql: { results: [{ count: 10 }] } });
    assert.equal(String(seenRequest.input), testEnv.NERDGRAPH_URL);
    assert.equal(seenRequest.init.method, "POST");

    const payload = JSON.parse(seenRequest.init.body);
    assert.match(payload.query, /\$accountId: Int!/);
    assert.match(payload.query, /nrql\(query: \$nrql\)/);
    assert.equal(payload.variables.accountId, 424242);
    assert.equal(payload.variables.nrql, "SELECT count(*) FROM Transaction");
  });
});

test("nerdgraph returns GraphQL error envelope unchanged", async (t) => {
  await withNerdgraphModule(async ({ nerdgraph }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "GraphQL validation failed" }],
      }),
    );
    t.after(restoreFetch);

    const execute = nerdgraph('nrql(query: "SELECT 1") { results }');
    const result = await execute();

    assert.deepEqual(result, {
      errors: [{ message: "GraphQL validation failed" }],
    });
  });
});

test("nerdgraph throws on non-OK HTTP status", async (t) => {
  await withNerdgraphModule(async ({ nerdgraph }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse(
        { message: "bad gateway" },
        { status: 502, statusText: "Bad Gateway" },
      ),
    );
    t.after(restoreFetch);

    const execute = nerdgraph('nrql(query: "SELECT 1") { results }');

    await assert.rejects(execute(), /HTTP 502 Bad Gateway/);
  });
});

test("nerdgraphRaw posts query and variables and returns raw JSON", async (t) => {
  await withNerdgraphModule(async ({ nerdgraphRaw }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            user: { email: "agent@example.test" },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await nerdgraphRaw(
      "query ($id: Int!) { actor { user(id: $id) { email } } }",
      {
        id: 7,
      },
    );

    assert.equal(seenBody.variables.id, 7);
    assert.deepEqual(result, {
      data: {
        actor: {
          user: { email: "agent@example.test" },
        },
      },
    });
  });
});

test("nerdgraphRaw throws on non-OK HTTP status", async (t) => {
  await withNerdgraphModule(async ({ nerdgraphRaw }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse(
        { message: "service unavailable" },
        { status: 503, statusText: "Service Unavailable" },
      ),
    );
    t.after(restoreFetch);

    await assert.rejects(
      nerdgraphRaw("query { actor { __typename } }"),
      /HTTP 503 Service Unavailable/,
    );
  });
});

test("nerdgraphActor sends actor query and returns actor data", async (t) => {
  await withNerdgraphModule(async ({ nerdgraphActor }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            account: { id: 1 },
          },
        },
      });
    });
    t.after(restoreFetch);

    const execute = nerdgraphActor("account(id: $accountId) { id }", [
      "$accountId: Int!",
    ]);
    const result = await execute({ accountId: 1 });

    assert.deepEqual(result, { account: { id: 1 } });
    assert.match(seenBody.query, /query \(\$accountId: Int!\)/);
    assert.equal(seenBody.variables.accountId, 1);
  });
});

test("nerdgraphActor returns GraphQL error envelope unchanged", async (t) => {
  await withNerdgraphModule(async ({ nerdgraphActor }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "Actor query invalid" }],
      }),
    );
    t.after(restoreFetch);

    const execute = nerdgraphActor("user { name }");
    const result = await execute();

    assert.deepEqual(result, {
      errors: [{ message: "Actor query invalid" }],
    });
  });
});

test("nerdgraphActor throws on non-OK HTTP status", async (t) => {
  await withNerdgraphModule(async ({ nerdgraphActor }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse(
        { message: "forbidden" },
        { status: 403, statusText: "Forbidden" },
      ),
    );
    t.after(restoreFetch);

    const execute = nerdgraphActor("user { name }");
    await assert.rejects(execute(), /HTTP 403 Forbidden/);
  });
});
