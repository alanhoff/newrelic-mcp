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
    const module = await importFreshFromCwd("tools/get-logs.js");
    return callback(module);
  });
}

function installImmediateTimers(t) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, _ms, ...args) => {
    callback(...args);
    return 0;
  };
  t.after(() => {
    global.setTimeout = originalSetTimeout;
  });
}

function installDateNowSequence(t, values) {
  const originalDateNow = Date.now;
  let index = 0;
  const fallback = values[values.length - 1];
  Date.now = () => {
    if (index < values.length) {
      return values[index++];
    }
    return fallback;
  };
  t.after(() => {
    Date.now = originalDateNow;
  });
}

test("tool returns immediate log results with default query window and limit", async () => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [{ message: "log line" }],
                queryProgress: { completed: true, queryId: "q1" },
              },
            },
          },
        },
      });
    });

    const result = await tool({ guid: "ENTITY-1" });

    restoreFetch();
    assert.match(
      seenBody.variables.query,
      /FROM Log SELECT timestamp, message/,
    );
    assert.match(seenBody.variables.query, /entity\.guid = 'ENTITY-1'/);
    assert.match(seenBody.variables.query, /SINCE 60 minutes ago/);
    assert.match(seenBody.variables.query, /LIMIT 25/);
    assert.deepEqual(result.results, [{ message: "log line" }]);
  });
});

test("tool polls logs query until completion", async (t) => {
  await withToolModule(async ({ tool }) => {
    installImmediateTimers(t);
    const requests = [];
    const responses = [
      jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [],
                queryProgress: {
                  completed: false,
                  queryId: "logs-progress",
                  retryAfter: 0,
                },
              },
            },
          },
        },
      }),
      jsonResponse({
        data: {
          actor: {
            account: {
              nrqlQueryProgress: {
                results: [{ message: "final" }],
                queryProgress: { completed: true, queryId: "logs-progress" },
              },
            },
          },
        },
      }),
    ];
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      requests.push(JSON.parse(init.body));
      return responses.shift();
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-2", minutes: 5, limit: 3 });

    assert.equal(requests.length, 2);
    assert.match(requests[0].variables.query, /SINCE 5 minutes ago/);
    assert.match(requests[0].variables.query, /LIMIT 3/);
    assert.equal(requests[1].variables.queryId, "logs-progress");
    assert.deepEqual(result.results, [{ message: "final" }]);
  });
});

test("tool returns latest log container when polling times out", async (t) => {
  await withToolModule(async ({ tool }) => {
    installDateNowSequence(t, [0, 600001]);
    let calls = 0;
    const restoreFetch = installFetchStub(async () => {
      calls += 1;
      return jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [{ message: "stale-result" }],
                queryProgress: {
                  completed: false,
                  queryId: "logs-timeout",
                },
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-3" });

    assert.equal(calls, 1);
    assert.deepEqual(result.results, [{ message: "stale-result" }]);
    assert.equal(result.queryProgress.queryId, "logs-timeout");
  });
});

test("tool returns unexpected polling response envelopes unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    installImmediateTimers(t);
    const responses = [
      jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [],
                queryProgress: { completed: false, queryId: "logs-error" },
              },
            },
          },
        },
      }),
      jsonResponse({
        errors: [{ message: "progress endpoint unavailable" }],
      }),
    ];
    const restoreFetch = installFetchStub(async () => responses.shift());
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-4" });

    assert.deepEqual(result, {
      errors: [{ message: "progress endpoint unavailable" }],
    });
  });
});
