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
    const module = await importFreshFromCwd("tools/nrql.js");
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

test("tool returns immediate results when async NRQL is already complete", async () => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [{ count: 2 }],
                queryProgress: { completed: true, queryId: "q-immediate" },
              },
            },
          },
        },
      });
    });

    const result = await tool({ query: "SELECT count(*) FROM Transaction" });

    restoreFetch();
    assert.equal(seenBody.variables.query, "SELECT count(*) FROM Transaction");
    assert.deepEqual(result, [{ count: 2 }]);
  });
});

test("tool polls NRQL progress until completion", async (t) => {
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
                  queryId: "q-progress",
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
                results: [{ value: "done" }],
                queryProgress: { completed: true, queryId: "q-progress" },
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

    const result = await tool({ query: "SELECT 1" });

    assert.equal(requests.length, 2);
    assert.equal(requests[0].variables.query, "SELECT 1");
    assert.equal(requests[1].variables.queryId, "q-progress");
    assert.deepEqual(result, [{ value: "done" }]);
  });
});

test("tool returns latest results when polling exceeds max wait", async (t) => {
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
                results: [{ value: "last-known-result" }],
                queryProgress: { completed: false, queryId: "q-timeout" },
              },
            },
          },
        },
      });
    });
    t.after(restoreFetch);

    const result = await tool({
      query: "SELECT latest(duration) FROM Transaction",
    });

    assert.equal(calls, 1);
    assert.deepEqual(result, [{ value: "last-known-result" }]);
  });
});

test("tool returns unexpected poll response envelopes unchanged", async (t) => {
  await withToolModule(async ({ tool }) => {
    installImmediateTimers(t);
    const responses = [
      jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [],
                queryProgress: { completed: false, queryId: "q-error" },
              },
            },
          },
        },
      }),
      jsonResponse({
        errors: [{ message: "query progress lookup failed" }],
      }),
    ];
    const restoreFetch = installFetchStub(async () => responses.shift());
    t.after(restoreFetch);

    const result = await tool({ query: "SELECT 1" });

    assert.deepEqual(result, {
      errors: [{ message: "query progress lookup failed" }],
    });
  });
});
