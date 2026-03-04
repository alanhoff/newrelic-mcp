#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serializeError } from "serialize-error";

// Create an MCP server
export const server = new McpServer({
  name: "newrelic",
  version: "1.0.0",
});

const tools = {
  nrql: {
    title: "Run NRQL Query",
    description: "Executes a NRQL query and returns the result.",
    tool: await import("./tools/nrql.js"),
  },
  introspection: {
    title: "Fetch NerdGraph Introspection Schema",
    description: "Returns the GraphQL introspection schema from NerdGraph.",
    tool: await import("./tools/introspection.js"),
  },
  searchEntity: {
    title: "Search Entities (Freeform)",
    description:
      "Search entities using a freeform search string; the server automatically scopes results to the configured ACCOUNT_ID.",
    tool: await import("./tools/search-entity.js"),
  },
  getEntityByName: {
    title: "Get Entity By Name",
    description:
      "Fuzzy match entities by name (LIKE), scoped to the configured ACCOUNT_ID.",
    tool: await import("./tools/get-entity-by-name.js"),
  },
  getEntityByGuid: {
    title: "Get Entity By GUID",
    description:
      "Exact match entities by GUID, scoped to the configured ACCOUNT_ID.",
    tool: await import("./tools/get-entity-by-guid.js"),
  },
  getDashboardByName: {
    title: "Get Dashboard By Name",
    description:
      "Fuzzy match dashboards by name (LIKE), scoped to the configured ACCOUNT_ID.",
    tool: await import("./tools/get-dashboard-by-name.js"),
  },
  getDashboardByGuid: {
    title: "Get Dashboard By GUID",
    description:
      "Exact match dashboards by GUID, scoped to the configured ACCOUNT_ID.",
    tool: await import("./tools/get-dashboard-by-guid.js"),
  },
  getGoldenMetricsByGuid: {
    title: "Get Golden Metrics By GUID",
    description: "Fetch golden metrics for a given entity GUID.",
    tool: await import("./tools/get-golden-metrics-by-guid.js"),
  },
  getLogs: {
    title: "Get Logs",
    description: "Fetch recent logs for an entity GUID via NRQL.",
    tool: await import("./tools/get-logs.js"),
  },
  getAlerts: {
    title: "Get Alerts",
    description: "Fetch recent alert items for an entity GUID via NRQL.",
    tool: await import("./tools/get-alerts.js"),
  },
  getServiceLevelsForGuid: {
    title: "Get Service Levels For GUID",
    description:
      "Fetch service level definition/details for a given entity GUID.",
    tool: await import("./tools/get-service-levels-for-guid.js"),
  },
  getRelatinshipsForGuid: {
    title: "Get Relationships For GUID",
    description: "Fetch related entities for a given entity GUID.",
    tool: await import("./tools/get-relatinships-for-guid.js"),
  },
  "run-raw-nerdgraph-query": {
    title: "Run Raw NerdGraph",
    description:
      "Execute a raw GraphQL document (query or mutation) with optional variables.",
    tool: await import("./tools/run-raw-nerdgraph-query.js"),
  },
  "generate-nerdgraph-query": {
    title: "Generate NerdGraph Query",
    description:
      "Generate a commonly used NerdGraph query document and example variables.",
    tool: await import("./tools/generate-nerdgraph-query.js"),
  },
};

for (const [name, data] of Object.entries(tools)) {
  server.registerTool(
    name,
    {
      title: data.title,
      description: data.description,
      inputSchema: data.tool?.schema ? data.tool.schema : {},
    },
    async (input) => {
      try {
        const result = await data.tool.tool(input);

        return {
          isError: Array.isArray(result?.errors) && result.errors.length > 0,
          content: [{ text: JSON.stringify(result), type: "text" }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { text: JSON.stringify(serializeError(err)), type: "text" },
          ],
        };
      }
    },
  );
}

if (process.env.NODE_ENV !== "test") {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
