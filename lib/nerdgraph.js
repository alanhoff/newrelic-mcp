import { tagMapper } from "./tag-mapper.js";

const ACCOUNT_ID = Number(process.env.ACCOUNT_ID);
const NERDGRAPH_URL = process.env.NERDGRAPH_URL;
const API_KEY = process.env.API_KEY;

export { tagMapper };

if (!ACCOUNT_ID) {
  throw new Error("Please set the ACCOUNT_ID environment variable.");
}

if (!API_KEY) {
  throw new Error("Please set the API_KEY environment variable.");
}

if (!NERDGRAPH_URL) {
  throw new Error("Please set the NERDGRAPH_URL environment variable.");
}

export function nerdgraph(query, variables = null) {
  const payload = `
    query (${["$accountId: Int!"].concat(variables || []).join(", ")}) {
      actor {
        account(id: $accountId) {
          ${query}
        }
      }
    }
  `;

  return async (variables = null) => {
    const response = await fetch(NERDGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Key": API_KEY,
      },
      body: JSON.stringify({
        query: payload,
        variables: {
          accountId: ACCOUNT_ID,
          ...variables,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      return result;
    }

    return result?.data?.actor?.account;
  };
}

export async function nerdgraphRaw(query, variables = null) {
  const response = await fetch(NERDGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Key": API_KEY,
    },
    body: JSON.stringify({
      query,
      variables: {
        ...variables,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Executes a NerdGraph query at the actor scope (no account wrapper)
export function nerdgraphActor(query, variables = null) {
  const payload = `
    query (${[].concat(variables || []).join(", ")}) {
      actor {
        ${query}
      }
    }
  `;

  return async (variables = null) => {
    const response = await fetch(NERDGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-Key": API_KEY,
      },
      body: JSON.stringify({
        query: payload,
        variables: {
          ...variables,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      return result;
    }

    return result?.data?.actor;
  };
}
