import assert from "node:assert/strict";
import test from "node:test";
import {
  importFreshFromCwd,
  withEnv,
} from "../test/helpers/module-isolation.js";

const baseEnv = {
  ACCOUNT_ID: "424242",
};

async function withToolModule(envOverrides, callback) {
  return withEnv({ ...baseEnv, ...envOverrides }, async () => {
    const module = await importFreshFromCwd(
      "tools/generate-nerdgraph-query.js",
    );
    return callback(module);
  });
}

test("tool generates NRQL query template", async () => {
  await withToolModule({}, async ({ tool }) => {
    const result = await tool({ operation: "nrql" });

    assert.match(result.query, /account\(id: \$accountId\)/);
    assert.match(result.query, /nrql\(query: \$query\)/);
    assert.deepEqual(result.variables, {
      accountId: 424242,
      query: "SELECT 1 AS example",
    });
  });
});

test("tool generates entitySearch query template", async () => {
  await withToolModule({}, async ({ tool }) => {
    const result = await tool({
      operation: "entitySearch",
      params: {
        query: 'name LIKE "Checkout API"',
        limit: 5,
      },
    });

    assert.ok(
      result.query.includes(
        'entitySearch(query: "name LIKE \\"Checkout API\\""',
      ),
    );
    assert.deepEqual(result.variables, {
      cursor: null,
      limit: 5,
    });
  });
});

test("tool generates entityByGuid query template", async () => {
  await withToolModule({}, async ({ tool }) => {
    const result = await tool({
      operation: "entityByGuid",
      params: { guid: "ENTITY-123" },
    });

    assert.match(result.query, /entity\(guid: \$guid\)/);
    assert.deepEqual(result.variables, {
      guid: "ENTITY-123",
    });
  });
});

test("tool fails on unsupported operation", async () => {
  await withToolModule({}, async ({ tool }) => {
    await assert.rejects(
      () => tool({ operation: "unsupported" }),
      /Unsupported operation: unsupported/,
    );
  });
});
