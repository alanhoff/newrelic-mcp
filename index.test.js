import assert from "node:assert/strict";
import test from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { installFetchStub, jsonResponse } from "./test/helpers/fetch-mock.js";
import {
  importFreshFromCwd,
  withEnv,
} from "./test/helpers/module-isolation.js";

const EXPECTED_TOOL_IDS = [
  "nrql",
  "introspection",
  "searchEntity",
  "getEntityByName",
  "getEntityByGuid",
  "getDashboardByName",
  "getDashboardByGuid",
  "getGoldenMetricsByGuid",
  "getLogs",
  "getAlerts",
  "getServiceLevelsForGuid",
  "getRelatinshipsForGuid",
  "run-raw-nerdgraph-query",
  "generate-nerdgraph-query",
];

const DEFAULT_ENV = {
  NODE_ENV: "test",
  API_KEY: "test-api-key",
  ACCOUNT_ID: "1234",
  NERDGRAPH_URL: "https://example.test/graphql",
};

async function withIndexModule(overrides, callback) {
  return withEnv({ ...DEFAULT_ENV, ...overrides }, async () =>
    callback(await importFreshFromCwd("index.js")),
  );
}

function getToolHandler(server, toolId) {
  const registeredTool = server?._registeredTools?.[toolId];
  assert.ok(registeredTool, `Expected tool ${toolId} to be registered.`);
  assert.equal(typeof registeredTool.callback, "function");
  return registeredTool.callback;
}

test("index registers every expected tool exactly once", async () => {
  await withIndexModule({}, async ({ server }) => {
    const registeredToolIds = Object.keys(server._registeredTools);

    assert.equal(registeredToolIds.length, EXPECTED_TOOL_IDS.length);
    assert.deepEqual(
      [...registeredToolIds].sort(),
      [...EXPECTED_TOOL_IDS].sort(),
    );
  });
});

test("index tool handler returns MCP content envelope for successful results", async (t) => {
  await withIndexModule({}, async ({ server }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        data: {
          __schema: {
            queryType: { name: "RootQuery" },
          },
        },
      }),
    );
    t.after(restoreFetch);

    const handler = getToolHandler(server, "introspection");
    const response = await handler({});

    assert.equal(response.isError, false);
    assert.equal(response.content.length, 1);
    assert.equal(response.content[0].type, "text");
    assert.deepEqual(JSON.parse(response.content[0].text), {
      queryType: { name: "RootQuery" },
    });
  });
});

test("index tool handler marks result.errors payloads as MCP errors", async (t) => {
  await withIndexModule({}, async ({ server }) => {
    const restoreFetch = installFetchStub(async () =>
      jsonResponse({
        errors: [{ message: "query failed" }],
      }),
    );
    t.after(restoreFetch);

    const handler = getToolHandler(server, "introspection");
    const response = await handler({});

    assert.equal(response.isError, true);
    assert.equal(response.content.length, 1);
    assert.equal(response.content[0].type, "text");
    assert.deepEqual(JSON.parse(response.content[0].text), {
      errors: [{ message: "query failed" }],
    });
  });
});

test("index tool handler serializes thrown exceptions into MCP error payloads", async () => {
  await withIndexModule({}, async ({ server }) => {
    const handler = getToolHandler(server, "generate-nerdgraph-query");
    const response = await handler({});

    assert.equal(response.isError, true);
    assert.equal(response.content.length, 1);
    assert.equal(response.content[0].type, "text");

    const payload = JSON.parse(response.content[0].text);
    assert.equal(payload.name, "Error");
    assert.match(payload.message, /Unsupported operation/);
    assert.equal(typeof payload.stack, "string");
  });
});

test("index does not connect stdio transport while NODE_ENV is test", async (t) => {
  const originalConnect = McpServer.prototype.connect;
  let connectCalls = 0;

  McpServer.prototype.connect = async function connectSpy(...args) {
    connectCalls += 1;
    return originalConnect.apply(this, args);
  };

  t.after(() => {
    McpServer.prototype.connect = originalConnect;
  });

  await withIndexModule({}, async () => {});

  assert.equal(connectCalls, 0);
});
