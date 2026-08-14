import { discoverConfig, writeProjectServerDisabledOverride } from './config.js'
import { executeAuthStart, executeStatus } from './proxy.js'
import { listAllPromptMetadata } from './prompts.js'
import { connectAndCache } from './runtime.js'
import type { McpRuntimeState } from './state.js'
import { rememberSessionApproval } from './tool-approval.js'
import { isServerDisabled } from './types.js'
import { formatTerminalError } from './utils.js'

export async function handleMcpCommand(state: McpRuntimeState, rawInput: string): Promise<{ kind: 'success' | 'error'; text: string }> {
  const trimmed = rawInput.trim()
  const [verb = '', ...rest] = trimmed.split(/\s+/)
  const arg = rest.join(' ').trim()

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
    const definition = state.config.mcpServers[arg]
    if (definition) definition.disabled = true
    await state.manager.close(arg)
    return { kind: 'success', text: `Disabled ${arg}${written.changed ? ` (wrote ${written.path})` : ''}.` }
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
        'Write a project .mcp.json, or set settings.hostConfigDiscovery to "on" to adopt detected host configs.',
        'Curated remotes: DeepWiki https://mcp.deepwiki.com/mcp , Context7 https://mcp.context7.com/mcp',
        ...discovery.imports.map(entry => `detected ${entry.kind}: ${entry.path}`),
      ].join('\n'),
    }
  }
  if (verb === 'enable') {
    if (!arg) return { kind: 'error', text: 'Usage: /mcp enable <server>' }
    if (!state.config.mcpServers[arg] && !state.programmaticConfig) {
      return { kind: 'error', text: `Unknown server "${arg}".` }
    }
    if (state.programmaticConfig) return { kind: 'error', text: '/mcp enable is unavailable for in-memory config.' }
    const written = writeProjectServerDisabledOverride(state.cwd, arg, false)
    const definition = state.config.mcpServers[arg]
    if (definition) delete definition.disabled
    return { kind: 'success', text: `Enabled ${arg}${written.changed ? ` (wrote ${written.path})` : ''}.` }
  }
  return {
    kind: 'error',
    text: 'Usage: /mcp [status|list|connect <server>|auth <server>|prompts|approve <server> <tool>|setup|enable <server>|disable <server>]',
  }
}
