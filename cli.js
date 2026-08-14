#!/usr/bin/env node

const version = '0.0.1'

const help = `dsh-mcp-adapter ${version}

MCP adapter for DeepSeek Harness.

Usage:
  dsh-mcp-adapter --help
  dsh-mcp-adapter --version

This 0.0.1 release only reserves the npm name and ships an installable
dsh bundle stub. The MCP proxy CLI (init / status / auth) lands later.

Install into a Harness profile:

  dsh plugin --profile web add dsh-mcp-adapter
`

const arg = process.argv[2]

if (arg === '-v' || arg === '--version' || arg === 'version') {
  console.log(version)
  process.exit(0)
}

if (arg === undefined || arg === '-h' || arg === '--help' || arg === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

console.error(`dsh-mcp-adapter: unknown command ${JSON.stringify(arg)}`)
console.error('Run dsh-mcp-adapter --help')
process.exit(1)
