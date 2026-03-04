# newrelic-mcp

MCP server for New Relic workflows (NRQL, NerdGraph, entity lookup, logs, alerts, dashboards, and service levels).

## Prerequisites

- Node.js 22+ (this repo uses `npx`; `.nvmrc` is `v24`)
- New Relic account ID
- New Relic user API key

Required environment variables:

- `ACCOUNT_ID` (numeric account id)
- `API_KEY` (New Relic user API key)
- `NERDGRAPH_URL` (usually `https://api.newrelic.com/graphql`)

## Quick Start

Run the MCP server directly:

```bash
ACCOUNT_ID=123456 \
API_KEY=your_new_relic_user_key \
NERDGRAPH_URL=https://api.newrelic.com/graphql \
npx -y git@github.com:alanhoff/newrelic-mcp.git
```

This server speaks MCP over stdio, so it is normally started by an MCP client/agent.

## Install In Common CLI Agents

### Codex CLI

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.newrelic]
command = "npx"
args = ["-y", "git@github.com:alanhoff/newrelic-mcp.git"]
env = { ACCOUNT_ID = "123456", API_KEY = "your_new_relic_user_key", NERDGRAPH_URL = "https://api.newrelic.com/graphql" }
```

Verify:

```bash
codex mcp list
```

### Claude Code CLI

Use the CLI installer:

```bash
claude mcp add-json newrelic '{"type":"stdio","command":"npx","args":["-y","git@github.com:alanhoff/newrelic-mcp.git"],"env":{"ACCOUNT_ID":"123456","API_KEY":"your_new_relic_user_key","NERDGRAPH_URL":"https://api.newrelic.com/graphql"}}'
```

Verify:

```bash
claude mcp get newrelic
```

### Gemini CLI

Add this to `~/.gemini/settings.json` (or `.gemini/settings.json` for project scope):

```json
{
  "mcpServers": {
    "newrelic": {
      "command": "npx",
      "args": ["-y", "git@github.com:alanhoff/newrelic-mcp.git"],
      "env": {
        "ACCOUNT_ID": "123456",
        "API_KEY": "your_new_relic_user_key",
        "NERDGRAPH_URL": "https://api.newrelic.com/graphql"
      }
    }
  }
}
```

Verify inside Gemini CLI:

```text
/mcp
```

### Cursor (`cursor-agent` CLI)

Add this to `~/.cursor/mcp.json` (or `.cursor/mcp.json` for project scope):

```json
{
  "mcpServers": {
    "newrelic": {
      "command": "npx",
      "args": ["-y", "git@github.com:alanhoff/newrelic-mcp.git"],
      "env": {
        "ACCOUNT_ID": "123456",
        "API_KEY": "your_new_relic_user_key",
        "NERDGRAPH_URL": "https://api.newrelic.com/graphql"
      }
    }
  }
}
```

Verify:

```bash
cursor-agent mcp list
cursor-agent mcp list-tools newrelic
```

## Install The Skills

This repo ships three skills:

- `newrelic-entity-scout`
- `newrelic-incident-correlation`
- `newrelic-nrql-debug-ladder`

If you are running inside this repository with `AGENTS.md`, they are already available from `.agents/skills/`.

To install them globally for Codex:

```bash
mkdir -p ~/.codex/skills
for skill in newrelic-entity-scout newrelic-incident-correlation newrelic-nrql-debug-ladder; do
  cp -R ".agents/skills/$skill" "$HOME/.codex/skills/$skill"
done
```

Alternative (keep them synced to this repo with symlinks):

```bash
mkdir -p ~/.codex/skills
for skill in newrelic-entity-scout newrelic-incident-correlation newrelic-nrql-debug-ladder; do
  ln -sfn "$(pwd)/.agents/skills/$skill" "$HOME/.codex/skills/$skill"
done
```

## Local Development

```bash
npm install
npm test
```

Main server entrypoint: `index.js`
