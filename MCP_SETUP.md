# MCP / JIRA setup (MPS dev)

## Which `mcp.json` file matters?

| File | Used when |
|------|-----------|
| `~/.void-editor-dev/mcp.json` | **Primary** — dev build (`./scripts/code.sh`). Open via Agentic → **Open MCP config** or Void Settings → MCP. |
| `~/.void-editor/mcp.json` | **Often empty** — do not put credentials here; the app used to read this path by mistake. |
| `./mcp.json` (workspace root) | **Merged** — `ATLASSIAN_*` env from here overrides/extends the home file. Works only if the **mps_ac folder is open** in the editor. |
| Repo `mcp.json` with only `ATLASSIAN_SITE` | **Not enough alone** — also need email + API token in `~/.void-editor-dev/mcp.json`. |

## Required env for Atlassian API token auth

```json
"env": {
  "ATLASSIAN_EMAIL": "you@company.com",
  "ATLASSIAN_API_TOKEN": "...",
  "ATLASSIAN_SITE": "https://your-site.atlassian.net"
}
```

Copy `mcp.json.example` → `~/.void-editor-dev/mcp.json` and fill in values.

## After editing

1. Save the file opened by **Open MCP config** (home path above).
2. Void Settings → MCP → toggle **atlassian** off/on until **Success**.
3. Cmd+Q and relaunch the app.
