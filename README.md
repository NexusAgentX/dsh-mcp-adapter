# dsh-mcp-adapter

Use [MCP](https://modelcontextprotocol.io/) servers with [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) without burning the context window.

`0.0.1` is a **name reservation + installable bundle stub**. The proxy-tool implementation is next.

English | [中文](#中文)

## Why this exists

DeepSeek Harness already ships [`@deepseek-ai/dsh-mcp-client`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client). That client connects at startup and registers every advertised MCP tool as a native `mcp__<server>__<tool>` function. Schema cost is paid on every request.

This adapter follows the [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) contract instead:

- one `mcp` proxy tool instead of hundreds of schemas
- lazy server start
- on-demand `search` / `describe` / `call`
- standard `.mcp.json` / `~/.config/mcp/mcp.json` discovery

It is an independent plugin. It is not affiliated with DeepSeek AI.

## Status

| Piece | 0.0.1 |
|---|---|
| npm name `dsh-mcp-adapter` | reserved |
| `dsh plugin add` bundle stub | yes |
| `mcp` proxy tool | not yet |
| `.mcp.json` loader | not yet |
| `/mcp` command | not yet |

## Install

```sh
dsh plugin --profile web add dsh-mcp-adapter
```

The stub loads and prints a placeholder log line. It does not connect to MCP servers yet.

## Planned usage

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
mcp({ tool: "chrome_devtools_take_screenshot", args: { format: "png" } })
```

## License

[MIT](LICENSE)

Inspired by [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) (MIT). See [NOTICE](NOTICE).

---

## 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的 MCP 适配器：一个代理工具，按需搜索/描述/调用，而不是把每个 MCP schema 都塞进上下文。

`0.0.1` 只抢注 npm 名并提供可安装的 bundle 占位。代理工具实现随后补上。

```sh
dsh plugin --profile web add dsh-mcp-adapter
```
