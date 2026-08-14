# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
