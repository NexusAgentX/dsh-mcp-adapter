import {
  discoverConfig,
  KNOWN_SERVER_PRESETS,
  parseServerAddSpec,
  removeProjectServer,
  writeProjectServer,
  writeProjectServerDisabledOverride,
} from './config.js'
import { supportsOAuth } from './mcp-auth-flow.js'
import { executeAuthStart, executeStatus } from './proxy.js'
import { listAllPromptMetadata } from './prompts.js'
import { connectAndCache, reloadRuntimeConfig } from './runtime.js'
import type { McpRuntimeState } from './state.js'
import { rememberSessionApproval } from './tool-approval.js'
import { isServerDisabled } from './types.js'
import { formatTerminalError } from './utils.js'

export function mcpSnapshot(state: McpRuntimeState) {
  const discovery = discoverConfig(state.cwd)
  const servers = Object.entries(state.config.mcpServers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definition]) => {
      const connection = state.manager.getConnection(name)
      const tools = state.toolMetadata.get(name) ?? []
      let status = 'cached'
      if (isServerDisabled(definition)) status = 'disabled'
      else if (connection?.status === 'connected') status = 'connected'
      else if (connection?.status === 'needs-auth') status = 'needs-auth'
      else if (state.manager.isConnecting(name)) status = 'connecting'
      else if (state.failureMessages.get(name)) status = 'failed'
      else if (tools.length === 0) status = 'not-connected'
      return {
        name,
        status,
        toolCount: tools.length,
        disabled: isServerDisabled(definition),
        lifecycle: definition.lifecycle ?? 'lazy',
        hasUrl: Boolean(definition.url),
        oauth: supportsOAuth(definition),
      }
    })
  return {
    servers,
    presets: KNOWN_SERVER_PRESETS.map(preset => ({
      id: preset.id,
      name: preset.name,
      summary: preset.summary,
      configured: state.config.mcpServers[preset.id] !== undefined,
    })),
    sources: discovery.sources,
    imports: discovery.imports,
    hostConfigDiscovery: discovery.hostConfigDiscovery,
  }
}

export async function handleMcpCommand(state: McpRuntimeState, rawInput: string): Promise<{ kind: 'success' | 'error'; text: string }> {
  const trimmed = rawInput.trim()
  const [verb = '', ...rest] = trimmed.split(/\s+/)
  const arg = rest.join(' ').trim()

  if (verb === 'json') {
    return { kind: 'success', text: JSON.stringify(mcpSnapshot(state)) }
  }
  if (!verb || verb === 'status') {
    const status = await executeStatus(state)
    return { kind: 'success', text: status.text }
  }
  if (verb === 'list') {
    const discovery = discoverConfig(state.cwd)
    const lines = [
      `hostConfigDiscovery: ${discovery.hostConfigDiscovery}`,
      `configured servers: ${discovery.totalServerCount}`,
      '',
      'sources:',
      ...discovery.sources.map(source => `  ${source.exists ? '•' : '○'} ${source.label} (${source.serverCount}) ${source.path}`),
    ]
    if (discovery.imports.length > 0) {
      lines.push('', 'detected host configs (not loaded unless hostConfigDiscovery=on or imports includes them):')
      lines.push(...discovery.imports.map(entry => `  • ${entry.kind} (${entry.serverCount}) ${entry.path}`))
    }
    return { kind: 'success', text: lines.join('\n') }
  }
  if (verb === 'connect' || verb === 'reconnect') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp connect <server>' }
    const definition = state.config.mcpServers[arg]
    if (!definition) return { kind: 'error', text: `Unknown server "${arg}".` }
    if (isServerDisabled(definition)) return { kind: 'error', text: `Server "${arg}" is disabled.` }
    try {
      if (verb === 'reconnect') await state.manager.close(arg)
      await connectAndCache(state, arg, definition)
      const count = state.toolMetadata.get(arg)?.length ?? 0
      return { kind: 'success', text: `Connected ${arg} (${count} tools).` }
    } catch (error) {
      return { kind: 'error', text: `Failed to connect ${arg}: ${formatTerminalError(error)}` }
    }
  }
  if (verb === 'disable') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp disable <server>' }
    if (!state.config.mcpServers[arg]) return { kind: 'error', text: `Unknown server "${arg}".` }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp disable is unavailable for in-memory config.' }
    const written = writeProjectServerDisabledOverride(state.cwd, arg, true)
    reloadRuntimeConfig(state)
    await state.manager.close(arg)
    return { kind: 'success', text: `Disabled ${arg}${written.changed ? ` (wrote ${written.path})` : ''}.` }
  }
  if (verb === 'enable') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp enable <server>' }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp enable is unavailable for in-memory config.' }
    const written = writeProjectServerDisabledOverride(state.cwd, arg, false)
    reloadRuntimeConfig(state)
    return { kind: 'success', text: `Enabled ${arg}${written.changed ? ` (wrote ${written.path})` : ''}.` }
  }
  if (verb === 'add-preset') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp add-preset <deepwiki|context7|notion|github|chrome-devtools>' }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp add-preset is unavailable for in-memory config.' }
    const preset = KNOWN_SERVER_PRESETS.find(item => item.id === arg)
    if (!preset) return { kind: 'error', text: `Unknown preset "${arg}".` }
    const written = writeProjectServer(state.cwd, preset.id, preset.entry)
    reloadRuntimeConfig(state)
    return { kind: 'success', text: `Added ${preset.name} to ${written.path}.` }
  }
  if (verb === 'add') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp add <name> url=<url> | command=<cmd> [args=a,b] [auth=oauth]' }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp add is unavailable for in-memory config.' }
    try {
      const spec = parseServerAddSpec(arg)
      const written = writeProjectServer(state.cwd, spec.name, spec.entry)
      reloadRuntimeConfig(state)
      return { kind: 'success', text: `Added ${spec.name} to ${written.path}.` }
    } catch (error) {
      return { kind: 'error', text: formatTerminalError(error) }
    }
  }
  if (verb === 'remove') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp remove <server>' }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp remove is unavailable for in-memory config.' }
    const written = removeProjectServer(state.cwd, arg)
    if (!written.removed) {
      const disabled = writeProjectServerDisabledOverride(state.cwd, arg, true)
      reloadRuntimeConfig(state)
      await state.manager.close(arg)
      return { kind: 'success', text: `Server ${arg} was not in .mcp.json; disabled via ${disabled.path}.` }
    }
    reloadRuntimeConfig(state)
    await state.manager.close(arg)
    return { kind: 'success', text: `Removed ${arg} from ${written.path}.` }
  }
  if (verb === 'auth') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp auth <server>' }
    const started = await executeAuthStart(state, arg)
    return { kind: started.details.error ? 'error' : 'success', text: started.text }
  }
  if (verb === 'prompts') {
    const prompts = listAllPromptMetadata(state)
    if (prompts.length === 0) return { kind: 'success', text: 'No cached MCP prompts. Connect a server first.' }
    return {
      kind: 'success',
      text: prompts.map(prompt => `/${prompt.commandName} — ${prompt.description || prompt.originalName} (${prompt.serverName})`).join('\n'),
    }
  }
  if (verb === 'approve') {
    const [serverName, toolName] = rest
    if (!serverName || !toolName) return { kind: 'error', text: 'Usage: /mcp approve <server> <tool>' }
    rememberSessionApproval(state, serverName, toolName)
    return { kind: 'success', text: `Approved ${serverName}/${toolName} for this session.` }
  }
  if (verb === 'setup') {
    const discovery = discoverConfig(state.cwd)
    return {
      kind: 'success',
      text: [
        'MCP setup',
        `configured servers: ${discovery.totalServerCount}`,
        `hostConfigDiscovery: ${discovery.hostConfigDiscovery}`,
        '',
        'In Web UI, open /mcp and pick a preset or server action.',
        'Custom server: /mcp add <name> url=https://...   or   /mcp add <name> command=npx args=-y,pkg',
        ...discovery.imports.map(entry => `detected ${entry.kind}: ${entry.path}`),
      ].join('\n'),
    }
  }
  return {
    kind: 'error',
    text: 'Usage: /mcp [status|json|list|connect <server>|auth <server>|add-preset <id>|add <name> url=...|remove <server>|enable <server>|disable <server>|prompts|setup]',
  }
}
