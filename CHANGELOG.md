# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.3] - 2026-08-14

### Fixed

- Client `/mcp` popup now injects `remote.commands`, matching ui-plan / ui-commands. Entering `/mcp` no longer throws `cannot get property "remote.commands" without inject`.

## [0.6.2] - 2026-08-14

### Fixed

- Re-export `inject` from the package entry so Cordis can see `tools` and `dsh web` no longer crashes with `cannot get property "tools" without inject`.

## [0.6.1] - 2026-08-14

### Changed

- Rewrote the README around the Web `/mcp` configure flow, complete command list, and honest Settings limitation.

## [0.6.0] - 2026-08-14

### Changed

- MCP tool rows now use the official `DisclosureRow` + `Button` + `SearchBlock` + `StateDot` primitives, with zh/en locale copy.

## [0.5.0] - 2026-08-14

### Changed

- Restyled the Web MCP tool row to match Skill/Tool rows: 24px chrome, `--dsw-*` tokens, StateDot, official SearchBlock, and token-based authorization pill.
- Tightened the `/mcp` popup to one primary action per server, with confirmations for disable/remove.

## [0.4.0] - 2026-08-14

### Added

- Web `/mcp` menu now lists live servers and curated presets, and can add/connect/authorize/disable/remove them.
- `/mcp add`, `/mcp add-preset`, `/mcp remove`, and `/mcp json` for Web-driven project `.mcp.json` edits with in-process config reload.

## [0.3.0] - 2026-08-14

### Added

- Web UI approval: gated MCP calls now return `tools/pre-execute` `ask`, so the Chat Ask dialog handles `approveTools`.
- Web client plugin: dedicated `mcp` / `mcpScript` tool cards (status dots, search hits, clickable OAuth button) and a `/mcp` popupSelect menu.

## [0.2.0] - 2026-08-14

### Added

- OAuth browser flow via `mcp({ action: "auth-start"|"auth-complete" })` and `/mcp auth`, with OS credential-store persistence ported from pi-mcp-adapter.
- MCP prompts: cache, `mcp({ prompt })`, `/mcp prompts`, and `/mcp__server__prompt` commands.
- `mcpScript` for multi-call JavaScript MCP workflows.
- Tool approval gates (`approveTools` + `/mcp approve`), Agent Plugins loader, npx resolver, Unix sockets, session recovery, command-secret `!` interpolation, and `/mcp setup`.

## [0.1.0] - 2026-08-14

### Added

- Ported the pi-mcp-adapter contract to DeepSeek Harness: one `mcp` proxy tool, lazy servers, on-demand search/describe/call.
- Standard MCP config merge: `~/.config/mcp/mcp.json`, `~/.agents/mcp.json`, `.mcp.json`, `$DSH_HOME/mcp.json`, `.dsh/mcp.json`.
- Host-config discovery for Cursor, Claude Code, Codex, OpenCode, Windsurf, and VS Code.
- Lifecycle modes: `lazy`, `eager`, `keep-alive`, `lazy-keep-alive`, plus idle shutdown.
- Metadata cache so search/describe work before a live connection.
- `/mcp` human command and `dsh-mcp-adapter init|status` CLI.
- Optional `directTools`, include/exclude filters, search keywords, resource `read_*` tools, and output guard.

## [0.0.1] - 2026-08-14

### Added

- Reserved the `dsh-mcp-adapter` npm name with an installable bundle stub.
