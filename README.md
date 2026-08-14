# dsh-mcp-adapter

Use [MCP](https://modelcontextprotocol.io/) servers with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) without burning the context window.

One `mcp` proxy tool. Lazy server start. On-demand `search` / `describe` / `call`.

English | [中文](#中文)

## Why this exists

DeepSeek Harness already ships [`@deepseek-ai/dsh-mcp-client`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client). That client connects at startup and registers every advertised MCP tool as a native `mcp__<server>__<tool>` function. Schema cost is paid on every request.

This adapter follows the [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) contract instead:

- one `mcp` proxy tool instead of hundreds of schemas
- lazy server start
- on-demand `search` / `describe` / `call`
- standard `.mcp.json` / `~/.config/mcp/mcp.json` discovery
- optional `directTools` promotion for hot-path tools
- metadata cache so search works before a live connect

It is an independent plugin. It is not affiliated with DeepSeek AI.

Do not mount this adapter and `@deepseek-ai/dsh-mcp-client` against the same servers. They would double-connect and fight over names.

## Install

```sh
dsh plugin --profile web add dsh-mcp-adapter
```

Restart `dsh web` after install. The package is a dual-face plugin: the Host half registers tools/commands, and the Web client half adds the `/mcp` popup and MCP tool cards.

## Quick start

Preferred project config: `.mcp.json`

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@1.6.0"]
    }
  }
}
```

Then:

```
mcp({ search: "screenshot" })
mcp({ describe: "chrome-devtools_take_screenshot" })
mcp({ tool: "chrome-devtools_take_screenshot", args: { format: "png" } })
```

`args` can be a JSON object or a JSON string.

## Config files

| File | Purpose |
|---|---|
| `~/.config/mcp/mcp.json` | User-global shared MCP config |
| `~/.agents/mcp.json` | User-global tool-agnostic MCP config |
| `~/.agents/mcp/mcp.json` | User-global tool-agnostic MCP config |
| `.mcp.json` | Project-local shared MCP config |
| `$DSH_HOME/mcp.json` | dsh global override (`~/.dsh/mcp.json` by default) |
| `.dsh/mcp.json` | dsh project override |

Later files win. `/mcp disable` and `/mcp enable` write only the `disabled` field to `.dsh/mcp.json`. They never copy credentials.

Host-specific configs (Cursor, Claude Code, Codex, OpenCode, Windsurf, VS Code) are detected by `dsh-mcp-adapter init` and `/mcp list`. They are **not** loaded unless you set `settings.hostConfigDiscovery` to `"on"` or list them in `imports`.

```json
{
  "imports": ["cursor"],
  "settings": {
    "hostConfigDiscovery": "off",
    "toolPrefix": "server",
    "idleTimeout": 10
  },
  "mcpServers": {}
}
```

## Server options

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "lifecycle": "lazy",
      "idleTimeout": 10,
      "requestTimeoutMs": 30000,
      "directTools": ["search"],
      "includeTools": ["search", "get_*"],
      "excludeTools": ["admin_*"],
      "searchKeywords": {
        "search": ["find", "lookup"]
      }
    }
  }
}
```

| Field | Meaning |
|---|---|
| `lifecycle` | `lazy` (default), `eager`, `keep-alive`, `lazy-keep-alive` |
| `idleTimeout` | Minutes before an idle lazy server is closed (default 10, `0` disables) |
| `directTools` | `true` or a name list — register those tools as native dsh tools |
| `url` / `headers` / `bearerToken` / `bearerTokenEnv` | Streamable HTTP; SSE fallback on 404/405 |
| `disabled` | Keep the entry visible but do not connect |

## OAuth

```js
mcp({ action: "auth-start", server: "notion" })
mcp({ action: "auth-complete", server: "notion", args: { redirectUrl: "http://localhost:.../callback?code=..." } })
```

Or `/mcp auth notion`. Tokens persist in the OS credential store.

## Prompts and scripting

```
mcp({ prompt: "create_plan", server: "agent-board", args: "harden retry policy" })
/mcp prompts
```

`mcpScript` can loop/search/call multiple MCP tools in one JavaScript request.

## Web UI

After `dsh plugin --profile web add dsh-mcp-adapter` and a Web restart:

- Type `/mcp` for a popup: Status / Config sources / Setup / Prompts.
- `/mcp connect <server>` and `/mcp auth <server>` stay typed commands.
- `approveTools` opens the same Chat Ask dialog as other sensitive tools.
- `mcp` / `mcpScript` cards show server dots, search hits, and an **Open authorization** button when OAuth starts.

## Human command

```
/mcp
/mcp list
/mcp connect <server>
/mcp auth <server>
/mcp enable <server>
/mcp disable <server>
```

## CLI

```sh
dsh-mcp-adapter init
dsh-mcp-adapter status
```

## Status

| Piece | 0.3.0 |
|---|---|
| `mcp` proxy tool | yes |
| `.mcp.json` merge + host discovery | yes |
| lazy / eager / keep-alive | yes |
| metadata cache | yes |
| `/mcp` command | yes |
| `directTools` | yes |
| resources as `read_*` tools | yes |
| output guard | yes |
| OAuth browser flow | yes |
| MCP prompts | yes |
| `mcpScript` | yes |
| `approveTools` | yes |
| Agent Plugins / unix sockets / npx resolver | yes |
| Web `/mcp` popup + MCP tool cards | yes |
| Web Ask dialog for `approveTools` | yes |
| elicitation / sampling / MCP UI apps | not in dsh host yet |

## License

[MIT](LICENSE)

Inspired by [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的 MCP 适配器：一个代理工具，按需搜索 / 描述 / 调用，而不是把每个 MCP schema 都塞进上下文。机制对齐 [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter)。

```sh
dsh plugin --profile web add dsh-mcp-adapter
```

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@1.6.0"]
    }
  }
}
```

```
mcp({ search: "screenshot" })
mcp({ tool: "chrome-devtools_take_screenshot", args: { format: "png" } })
```
