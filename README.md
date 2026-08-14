# dsh-mcp-adapter

Use [MCP](https://modelcontextprotocol.io/) servers with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) without burning the context window.

One `mcp` proxy tool. Lazy server start. On-demand `search` / `describe` / `call`. Configure from the Web `/mcp` menu.

English | [中文](#中文)

## Why this exists

DeepSeek Harness already ships [`@deepseek-ai/dsh-mcp-client`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client). That client connects at startup and registers every advertised MCP tool as a native `mcp__<server>__<tool>` function. Schema cost is paid on every request.

This adapter follows the [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) contract instead:

- one `mcp` proxy tool instead of hundreds of schemas
- lazy server start
- on-demand `search` / `describe` / `call`
- standard `.mcp.json` discovery, plus a Web `/mcp` menu that can write the project file
- optional `directTools` promotion for hot-path tools
- metadata cache so search works before a live connect

It is an independent plugin. It is not affiliated with DeepSeek AI.

Do not mount this adapter and `@deepseek-ai/dsh-mcp-client` against the same servers. They would double-connect and fight over names.

## Install

```sh
dsh plugin --profile web add dsh-mcp-adapter
```

Restart `dsh web` and hard-refresh the browser. The package is dual-face: the Host half registers tools and commands; the Web client half adds the `/mcp` popup and MCP tool cards.

There is **no** MCP form under Settings → Plugins. Official plugin settings are an allowlist; out-of-tree plugins cannot register a card there. Configuration happens in the `/mcp` menu or in JSON files.

## Web UI (primary)

In Chat, type `/mcp`:

| Menu | What it does |
|---|---|
| Status / Sources / Prompts | Inspect state |
| DeepWiki, Context7, Notion, GitHub, Chrome DevTools | One-click add to project `.mcp.json` |
| *server* · Connect / Authorize | Connect, or open the OAuth browser flow |
| *server* · Disable / Remove | Confirm, then stop or delete |

Custom server (also writes `.mcp.json` and reloads in-process):

```
/mcp add docs url=https://mcp.example.com/mcp
/mcp add fs command=npx args=-y,@modelcontextprotocol/server-filesystem,/tmp
```

Then ask the model to `mcp({ search: "screenshot" })`. Tool cards use the same `DisclosureRow` / `StateDot` / `SearchBlock` chrome as first-party Skill and Tool rows. `approveTools` uses the Chat Ask dialog.

## File config (shared / power user)

Preferred project file is still `.mcp.json` if you want the same servers in Cursor or other hosts:

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

| File | Purpose |
|---|---|
| `~/.config/mcp/mcp.json` | User-global shared MCP config |
| `~/.agents/mcp.json` | User-global tool-agnostic MCP config |
| `~/.agents/mcp/mcp.json` | User-global tool-agnostic MCP config |
| `.mcp.json` | Project-local shared MCP config (Web add/remove writes here) |
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
| `auth` / `oauth` | `"oauth"` or `"bearer"`; OAuth tokens go in the OS credential store |
| `socket` | `rmcp-mux` Unix-domain socket (mutually exclusive with `command` / `url`) |
| `approveTools` | `true` or globs — Chat Ask before those tools run |
| `disabled` | Keep the entry visible but do not connect |

## Model tools

```
mcp({ search: "screenshot" })
mcp({ describe: "chrome-devtools_take_screenshot" })
mcp({ tool: "chrome-devtools_take_screenshot", args: { format: "png" } })
mcp({ connect: "chrome-devtools" })
mcp({ action: "auth-start", server: "notion" })
mcp({ action: "auth-complete", server: "notion", args: { redirectUrl: "http://localhost:.../callback?code=..." } })
mcp({ prompt: "create_plan", server: "agent-board", args: "harden retry policy" })
```

`args` can be a JSON object or a JSON string. `mcpScript` can loop / search / call several MCP tools in one JavaScript request.

## Human commands

```
/mcp
/mcp status
/mcp list
/mcp json
/mcp setup
/mcp prompts
/mcp add-preset <deepwiki|context7|notion|github|chrome-devtools>
/mcp add <name> url=<url>
/mcp add <name> command=<cmd> [args=a,b] [auth=oauth]
/mcp connect <server>
/mcp auth <server>
/mcp enable <server>
/mcp disable <server>
/mcp remove <server>
```

## CLI

```sh
dsh-mcp-adapter init
dsh-mcp-adapter status
```

## Status

| Piece | 0.6.2 |
|---|---|
| `mcp` proxy + lazy lifecycle + metadata cache | yes |
| Web `/mcp` configure / connect / auth | yes |
| Web cards (`DisclosureRow` / `SearchBlock`) | yes |
| Web Ask for `approveTools` | yes |
| OAuth, prompts, `mcpScript`, Agent Plugins, sockets | yes |
| Settings → Plugins form | no (host allowlist) |
| elicitation / sampling / MCP UI apps | not in dsh host yet |

## License

[MIT](LICENSE)

Inspired by [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的 MCP 适配器：一个代理工具，按需搜索 / 描述 / 调用，不把每个 MCP schema 塞进上下文。

**配置入口是 Web 的 `/mcp`，不是 Settings。** 官方插件设置页不允许外部插件挂表单。

```sh
dsh plugin --profile web add dsh-mcp-adapter
```

重启 `dsh web`，硬刷新，在输入框敲 `/mcp`：

- 一键添加 DeepWiki / Context7 / Notion / GitHub / Chrome DevTools（写入项目 `.mcp.json`，立刻生效）
- 对已有 server：连接、授权、停用、移除
- 自定义：`/mcp add docs url=https://…` 或 `/mcp add fs command=npx args=-y,pkg`

然后让模型 `mcp({ search: "screenshot" })`。卡片和官方 Skill / Tool 行同一套 `DisclosureRow` / `StateDot` / `SearchBlock`。

也可以继续用手写 `.mcp.json` / `~/.config/mcp/mcp.json`，和其他 MCP 宿主共用。不要和 `@deepseek-ai/dsh-mcp-client` 挂同一批 server。
