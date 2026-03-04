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
    const module = await importFreshFromCwd("tools/get-alerts.js");
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

test("tool returns immediate alerts and removes all-null aggregate rows", async () => {
  await withToolModule(async ({ tool }) => {
    let seenBody;
    const restoreFetch = installFetchStub(async (_input, init = {}) => {
      seenBody = JSON.parse(init.body);
      return jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [
                  {
                    conditionName: null,
                    policyName: null,
                    incidentId: null,
                    url: null,
                    priority: null,
                  },
                  {
                    conditionName: "CPU high",
                    policyName: "Core policy",
                    incidentId: 101,
                    url: "https://example.test/incidents/101",
                    priority: "critical",
                  },
                ],
                queryProgress: { completed: true, queryId: "alerts-immediate" },
              },
            },
          },
        },
      });
    });

    const result = await tool({ guid: "ENTITY-1" });

    restoreFetch();
    assert.match(seenBody.variables.query, /FROM AlertViolation, NrAiIncident/);
    assert.match(seenBody.variables.query, /entity\.guid = 'ENTITY-1'/);
    assert.match(seenBody.variables.query, /SINCE 7 days ago/);
    assert.match(seenBody.variables.query, /LIMIT 25/);
    assert.equal(result.length, 1);
    assert.equal(result[0].conditionName, "CPU high");
  });
});

test("tool polls alerts query until completion", async (t) => {
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
                  queryId: "alerts-progress",
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
                results: [
                  { conditionName: "Error budget burn", priority: "high" },
                ],
                queryProgress: { completed: true, queryId: "alerts-progress" },
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

    const result = await tool({ guid: "ENTITY-2", days: 1, limit: 2 });

    assert.equal(requests.length, 2);
    assert.match(requests[0].variables.query, /SINCE 1 days ago/);
    assert.match(requests[0].variables.query, /LIMIT 2/);
    assert.equal(requests[1].variables.queryId, "alerts-progress");
    assert.deepEqual(result, [
      { conditionName: "Error budget burn", priority: "high" },
    ]);
  });
});

test("tool returns latest alert results when polling times out", async (t) => {
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
                results: [
                  { conditionName: "Last known alert", priority: "critical" },
                ],
                queryProgress: {
                  completed: false,
                  queryId: "alerts-timeout",
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
    assert.deepEqual(result, [
      { conditionName: "Last known alert", priority: "critical" },
    ]);
  });
});

test("tool handles unexpected polling response shape", async (t) => {
  await withToolModule(async ({ tool }) => {
    installImmediateTimers(t);
    const responses = [
      jsonResponse({
        data: {
          actor: {
            account: {
              nrql: {
                results: [],
                queryProgress: { completed: false, queryId: "alerts-error" },
              },
            },
          },
        },
      }),
      jsonResponse({
        errors: [{ message: "temporary backend failure" }],
      }),
    ];
    const restoreFetch = installFetchStub(async () => responses.shift());
    t.after(restoreFetch);

    const result = await tool({ guid: "ENTITY-4" });

    assert.deepEqual(result, []);
  });
});
