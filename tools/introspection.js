// No input required for introspection
export const schema = {};

const NERDGRAPH_URL = process.env.NERDGRAPH_URL;
const API_KEY = process.env.API_KEY;

export const tool = async () => {
  if (!API_KEY) {
    throw new Error("Please set the API_KEY environment variable.");
  }
  if (!NERDGRAPH_URL) {
    throw new Error("Please set the NERDGRAPH_URL environment variable.");
  }

  const query = `
    query __Introspection__ {
      __schema {
        queryType { name }
        mutationType { name }
        subscriptionType { name }
        types { kind name }
        directives { name }
      }
    }
  `;

  const response = await fetch(NERDGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Key": API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    return result;
  }
  return result?.data?.__schema ?? result;
};
