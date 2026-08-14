#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverConfig, getDshGlobalConfigPath, getProjectConfigPath } from './config.js'
import { createRuntime, stopRuntime } from './runtime.js'
import { executeStatus } from './proxy.js'

const version = readPackageVersion()

const help = `dsh-mcp-adapter ${version}

MCP adapter for DeepSeek Harness.

Usage:
  dsh-mcp-adapter --help
  dsh-mcp-adapter --version
  dsh-mcp-adapter init
  dsh-mcp-adapter status

init     Discover MCP config files and print how the adapter will load them
status   Load config and print server / cached-tool status
`

const command = process.argv[2]

if (command === undefined || command === '-h' || command === '--help' || command === 'help') {
  process.stdout.write(help)
  process.exit(0)
}

if (command === '-v' || command === '--version' || command === 'version') {
  console.log(version)
  process.exit(0)
}

if (command === 'init') {
  const discovery = discoverConfig()
  console.log(`dsh-mcp-adapter ${version}`)
  console.log(`cwd: ${process.cwd()}`)
  console.log(`hostConfigDiscovery: ${discovery.hostConfigDiscovery}`)
  console.log(`configured servers: ${discovery.totalServerCount}`)
  console.log('')
  console.log('sources (later wins):')
  for (const source of discovery.sources) {
    console.log(`  ${source.exists ? '•' : '○'} ${source.label}`)
    console.log(`      ${source.path}${source.exists ? ` (${source.serverCount} servers)` : ''}`)
  }
  if (discovery.imports.length > 0) {
    console.log('')
    console.log('detected host configs (not auto-loaded; set settings.hostConfigDiscovery to "on" or add imports):')
    for (const entry of discovery.imports) {
      console.log(`  • ${entry.kind} (${entry.serverCount}) ${entry.path}`)
    }
  }
  console.log('')
  console.log(`Preferred project file: ${getProjectConfigPath()}`)
  console.log(`dsh global override:    ${getDshGlobalConfigPath()}`)
  process.exit(0)
}

if (command === 'status') {
  const state = createRuntime()
  void executeStatus(state).then(async (status) => {
    console.log(status.text)
    await stopRuntime(state)
  }).catch(async (error) => {
    console.error(error instanceof Error ? error.message : error)
    await stopRuntime(state)
    process.exitCode = 1
  })
} else {
  console.error(`dsh-mcp-adapter: unknown command ${JSON.stringify(command)}`)
  console.error('Run dsh-mcp-adapter --help')
  process.exit(1)
}

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}
