const NERDGRAPH_URL = process.env.NERDGRAPH_URL;
const API_KEY = process.env.API_KEY;

import { z } from "zod";
import { tagMapper } from "../lib/tag-mapper.js";

export const schema = {
  query: z.string().describe("Raw GraphQL document (query or mutation)."),
  variables: z
    .record(z.any())
    .optional()
    .describe("Optional variables map for the GraphQL document."),
};

export const tool = async ({ query, variables = undefined }) => {
  if (!API_KEY) throw new Error("Please set the API_KEY environment variable.");
  if (!NERDGRAPH_URL)
    throw new Error("Please set the NERDGRAPH_URL environment variable.");

  const response = await fetch(NERDGRAPH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "API-Key": API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const json = await response.json();
  // Return data with errors preserved if any
  return tagMapper(json);
};
