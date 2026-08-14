import { guardText } from './output-guard.js'
import { connectAndCache } from './runtime.js'
import { paginate, rankSuggestions, rankToolMatches } from './search-ranking.js'
import type { McpRuntimeState } from './state.js'
import { findToolByName } from './tool-metadata.js'
import { formatSchema } from './ts-shape.js'
import type { ProxyResult, ToolMetadata } from './types.js'
import { isServerDisabled } from './types.js'
import { formatTerminalError } from './utils.js'

const MAX_REGEX_SEARCH_QUERY_LENGTH = 256

export interface ProxyParams {
  tool?: string
  args?: unknown
  connect?: string
  describe?: string
  instructions?: string
  search?: string
  regex?: boolean
  includeSchemas?: boolean
  limit?: number
  offset?: number
  server?: string
}

export async function dispatchProxy(state: McpRuntimeState, params: ProxyParams, signal?: AbortSignal): Promise<ProxyResult> {
  if (params.tool) return executeCall(state, params.tool, asObject(params.args), params.server, signal)
  if (params.connect) return executeConnect(state, params.connect, signal)
  if (params.describe) return executeDescribe(state, params.describe)
  if (params.instructions) return executeInstructions(state, params.instructions)
  if (params.search !== undefined) {
    return executeSearch(state, params.search, params.regex, params.server, params.includeSchemas, params.limit, params.offset)
  }
  if (params.server) return executeList(state, params.server)
  return executeStatus(state)
}

function asObject(args: unknown): Record<string, unknown> | undefined {
  if (args === undefined || args === null || args === '') return undefined
  if (typeof args === 'object' && !Array.isArray(args)) return args as Record<string, unknown>
  throw new Error('args must be a JSON object')
}

function result(text: string, details: Record<string, unknown>): ProxyResult {
  return { text, details }
}

function disabledResult(mode: string, serverName: string): ProxyResult {
  const message = `Server "${serverName}" is disabled. Run /mcp enable ${serverName} to enable it.`
  return result(message, { mode, error: 'server_disabled', server: serverName, message })
}

function getEnabledToolMatches(state: McpRuntimeState, toolName: string, exact: boolean): Array<{ server: string; tool: ToolMetadata }> {
  const matches: Array<{ server: string; tool: ToolMetadata }> = []
  for (const [server, metadata] of state.toolMetadata) {
    if (isServerDisabled(state.config.mcpServers[server])) continue
    for (const tool of metadata) {
      if (exact ? tool.name === toolName : tool.name.replace(/-/g, '_') === toolName.replace(/-/g, '_')) {
        matches.push({ server, tool })
      }
    }
  }
  return matches
}

export async function executeStatus(state: McpRuntimeState): Promise<ProxyResult> {
  const lines: string[] = []
  const servers: Array<Record<string, unknown>> = []
  let totalTools = 0
  for (const [name, definition] of Object.entries(state.config.mcpServers).sort(([a], [b]) => a.localeCompare(b))) {
    const disabled = isServerDisabled(definition)
    const connection = state.manager.getConnection(name)
    const tools = state.toolMetadata.get(name) ?? []
    const connecting = state.manager.isConnecting(name)
    const failed = state.failureMessages.get(name)
    let status = 'cached'
    if (disabled) status = 'disabled'
    else if (connection?.status === 'connected') status = 'connected'
    else if (connection?.status === 'needs-auth') status = 'needs-auth'
    else if (connecting) status = 'connecting'
    else if (failed) status = 'failed'
    else if (tools.length === 0) status = 'not-connected'
    if (!disabled) totalTools += tools.length
    const lifecycle = definition.lifecycle ?? 'lazy'
    lines.push(`${name}: ${status} (${tools.length} tools, ${lifecycle})`)
    if (failed && status === 'failed') lines.push(`  error: ${failed}`)
    servers.push({ name, status, toolCount: tools.length, disabled, lifecycle })
  }
  if (lines.length === 0) {
    return result('No MCP servers configured. Add servers to .mcp.json or ~/.config/mcp/mcp.json.', {
      mode: 'status',
      servers: [],
      totalTools: 0,
    })
  }
  return result(`${lines.join('\n')}\n\n${totalTools} tools cached. Use mcp({ search: "..." }) to discover.`, {
    mode: 'status',
    servers,
    totalTools,
  })
}

export async function executeList(state: McpRuntimeState, serverName: string): Promise<ProxyResult> {
  const definition = state.config.mcpServers[serverName]
  if (!definition) return result(`Unknown server "${serverName}".`, { mode: 'list', error: 'unknown_server', server: serverName })
  if (isServerDisabled(definition)) return disabledResult('list', serverName)
  const tools = state.toolMetadata.get(serverName) ?? []
  if (tools.length === 0) {
    const connecting = state.manager.isConnecting(serverName)
    return result(
      connecting
        ? `Server "${serverName}" is still connecting; retry in a moment.`
        : `No cached tools for "${serverName}". Run mcp({ connect: "${serverName}" }) first.`,
      { mode: 'list', server: serverName, tools: [], connecting },
    )
  }
  const text = tools.map(tool => `${tool.name}\n  ${tool.description || '(no description)'}`).join('\n\n')
  return result(text, { mode: 'list', server: serverName, tools: tools.map(tool => tool.name) })
}

export async function executeConnect(state: McpRuntimeState, serverName: string, signal?: AbortSignal): Promise<ProxyResult> {
  const definition = state.config.mcpServers[serverName]
  if (!definition) return result(`Unknown server "${serverName}".`, { mode: 'connect', error: 'unknown_server', server: serverName })
  if (isServerDisabled(definition)) return disabledResult('connect', serverName)
  try {
    await connectAndCache(state, serverName, definition, signal)
    const tools = state.toolMetadata.get(serverName) ?? []
    const instructions = state.serverInstructions.get(serverName)
    const extra = instructions ? `\n\nInstructions:\n${instructions}` : ''
    return result(`Connected to "${serverName}" (${tools.length} tools).${extra}`, {
      mode: 'connect',
      server: serverName,
      toolCount: tools.length,
      tools: tools.map(tool => tool.name),
    })
  } catch (error) {
    const message = formatTerminalError(error)
    state.failureTracker.set(serverName, Date.now())
    state.failureMessages.set(serverName, message)
    return result(`Failed to connect to "${serverName}": ${message}`, {
      mode: 'connect',
      error: 'connect_failed',
      server: serverName,
      message,
    })
  }
}

export function executeDescribe(state: McpRuntimeState, toolName: string): ProxyResult {
  const exactMatches = getEnabledToolMatches(state, toolName, true)
  if (exactMatches.length > 1) {
    return result(`Tool "${toolName}" matches multiple servers. Specify a server.`, {
      mode: 'describe',
      error: 'ambiguous_tool',
      requestedTool: toolName,
    })
  }
  let match = exactMatches[0]
  if (!match && getEnabledToolMatches(state, toolName, false).length > 1) {
    return result(`Tool "${toolName}" matches multiple servers. Specify a server.`, {
      mode: 'describe',
      error: 'ambiguous_tool',
      requestedTool: toolName,
    })
  }
  match ??= getEnabledToolMatches(state, toolName, false)[0]
  if (!match) {
    for (const [server, metadata] of state.toolMetadata) {
      const found = findToolByName(metadata, toolName)
      if (!found) continue
      if (isServerDisabled(state.config.mcpServers[server])) {
        return disabledResult('describe', server)
      }
      match = { server, tool: found }
      break
    }
  }
  if (!match) {
    const suggestions = rankSuggestions(state, toolName, 5)
    const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}` : ''
    return result(`Tool "${toolName}" not found. Use mcp({ search: "..." }) to search.${suggestionText}`, {
      mode: 'describe',
      error: 'tool_not_found',
      requestedTool: toolName,
      suggestions,
    })
  }
  let text = `${match.tool.name}\nServer: ${match.server}\n`
  if (match.tool.resourceUri) text += `Type: Resource (reads from ${match.tool.resourceUri})\n`
  text += `\n${match.tool.description || '(no description)'}\n`
  if (match.tool.inputSchema && !match.tool.resourceUri) {
    text += `\nShape:\n${formatSchema(match.tool.inputSchema)}`
  } else if (match.tool.resourceUri) {
    text += '\nNo parameters required (resource tool).'
  } else {
    text += '\nNo parameters defined.'
  }
  return result(text.trim(), { mode: 'describe', tool: match.tool, server: match.server })
}

export function executeSearch(
  state: McpRuntimeState,
  query: string,
  regex?: boolean,
  server?: string,
  includeSchemas?: boolean,
  limit = 12,
  offset = 0,
): ProxyResult {
  const showSchemas = includeSchemas !== false
  if (server && isServerDisabled(state.config.mcpServers[server])) return disabledResult('search', server)

  let matches: Array<{ server: string; tool: ToolMetadata; score: number }>
  if (regex) {
    if (query.length > MAX_REGEX_SEARCH_QUERY_LENGTH) {
      return result(`Regex query is too long; maximum length is ${MAX_REGEX_SEARCH_QUERY_LENGTH} characters.`, {
        mode: 'search',
        error: 'query_too_long',
        query,
      })
    }
    let pattern: RegExp
    try {
      pattern = new RegExp(query, 'i')
    } catch {
      return result(`Invalid regex: ${query}`, { mode: 'search', error: 'invalid_pattern', query })
    }
    matches = []
    for (const [serverName, metadata] of state.toolMetadata) {
      const definition = state.config.mcpServers[serverName]
      if (isServerDisabled(definition)) continue
      if (server && serverName !== server) continue
      for (const tool of metadata) {
        if (pattern.test(tool.name) || pattern.test(tool.description)) matches.push({ server: serverName, tool, score: 0 })
      }
    }
  } else if (query.trim().length === 0) {
    if (!server) return result('Search query cannot be empty', { mode: 'search', error: 'empty_query' })
    matches = (state.toolMetadata.get(server) ?? [])
      .map(tool => ({ server, tool, score: 0 }))
      .sort((a, b) => a.tool.name.localeCompare(b.tool.name))
  } else {
    matches = rankToolMatches(state, query, server)
  }

  const page = paginate(matches, offset, limit)
  if (page.total === 0) {
    const connectingServers = server
      ? state.config.mcpServers[server] && state.manager.isConnecting(server) ? [server] : []
      : Object.keys(state.config.mcpServers)
        .filter(name => !isServerDisabled(state.config.mcpServers[name]) && state.manager.isConnecting(name))
        .sort((a, b) => a.localeCompare(b))
    const msg = server ? `No tools matching "${query}" in "${server}"` : `No tools matching "${query}"`
    const connectingMessage = connectingServers.length === 1
      ? ` Server "${connectingServers[0]}" is still connecting; retry in a moment.`
      : connectingServers.length > 1
        ? ` Servers ${connectingServers.map(name => `"${name}"`).join(', ')} are still connecting; retry in a moment.`
        : ''
    return result(`${msg}${connectingMessage}`, {
      mode: 'search',
      matches: [],
      count: 0,
      hasMore: false,
      nextOffset: null,
      query,
      ...(connectingServers.length > 0 ? { connectingServers } : {}),
    })
  }

  let text = `Found ${page.total} tool${page.total === 1 ? '' : 's'} matching "${query}":\n\n`
  for (const match of page.items) {
    text += `${match.tool.name}\n  ${match.tool.description || '(no description)'}\n`
    if (showSchemas && match.tool.inputSchema && !match.tool.resourceUri) {
      text += `  ${formatSchema(match.tool.inputSchema).split('\n').join('\n  ')}\n`
    }
    text += '\n'
  }
  if (page.hasMore) text += `More results available. Use offset: ${page.nextOffset}\n`
  return result(text.trim(), {
    mode: 'search',
    matches: page.items.map(match => ({
      name: match.tool.name,
      server: match.server,
      description: match.tool.description,
    })),
    count: page.total,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    query,
  })
}

export function executeInstructions(state: McpRuntimeState, serverName: string): ProxyResult {
  const definition = state.config.mcpServers[serverName]
  if (!definition) return result(`Unknown server "${serverName}".`, { mode: 'instructions', error: 'unknown_server', server: serverName })
  if (isServerDisabled(definition)) return disabledResult('instructions', serverName)
  const instructions = state.serverInstructions.get(serverName)
  if (!instructions) {
    return result(`No cached instructions for "${serverName}". Connect first with mcp({ connect: "${serverName}" }).`, {
      mode: 'instructions',
      server: serverName,
      error: 'not_cached',
    })
  }
  return result(instructions, { mode: 'instructions', server: serverName })
}

export async function executeCall(
  state: McpRuntimeState,
  toolName: string,
  args: Record<string, unknown> | undefined,
  server?: string,
  signal?: AbortSignal,
): Promise<ProxyResult> {
  const resolved = resolveCallTarget(state, toolName, server)
  if ('error' in resolved) return resolved.error
  const { serverName, tool } = resolved
  const definition = state.config.mcpServers[serverName]
  if (!definition) return result(`Unknown server "${serverName}".`, { mode: 'call', error: 'unknown_server', server: serverName })
  if (isServerDisabled(definition)) return disabledResult('call', serverName)

  try {
    await connectAndCache(state, serverName, definition, signal)
    const liveTool = findToolByName(state.toolMetadata.get(serverName), tool.name) ?? tool
    const raw = liveTool.resourceUri
      ? await state.manager.readResource(serverName, definition, liveTool.resourceUri, signal)
      : await state.manager.callTool(serverName, definition, liveTool.originalName, args, signal)
    const text = projectMcpResult(raw)
    const guarded = await guardText(text, state.config.settings)
    return result(guarded.text, {
      mode: 'call',
      server: serverName,
      tool: liveTool.name,
      ...(guarded.truncated ? { truncated: guarded.truncated } : {}),
    })
  } catch (error) {
    const message = formatTerminalError(error)
    return result(`Failed to call ${tool.name}: ${message}`, {
      mode: 'call',
      error: 'call_failed',
      server: serverName,
      tool: tool.name,
      message,
    })
  }
}

function resolveCallTarget(
  state: McpRuntimeState,
  toolName: string,
  server?: string,
): { serverName: string; tool: ToolMetadata } | { error: ProxyResult } {
  if (server) {
    if (isServerDisabled(state.config.mcpServers[server])) return { error: disabledResult('call', server) }
    const tool = findToolByName(state.toolMetadata.get(server), toolName)
    if (!tool) {
      return {
        error: result(`Tool "${toolName}" not found on "${server}".`, {
          mode: 'call',
          error: 'tool_not_found',
          requestedTool: toolName,
          server,
        }),
      }
    }
    return { serverName: server, tool }
  }
  const exact = getEnabledToolMatches(state, toolName, true)
  const matches = exact.length > 0 ? exact : getEnabledToolMatches(state, toolName, false)
  if (matches.length > 1) {
    return {
      error: result(`Tool "${toolName}" matches multiple servers. Specify a server.`, {
        mode: 'call',
        error: 'ambiguous_tool',
        requestedTool: toolName,
      }),
    }
  }
  const match = matches[0]
  if (!match) {
    const suggestions = rankSuggestions(state, toolName, 5)
    const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}` : ''
    return {
      error: result(`Tool "${toolName}" not found. Use mcp({ search: "..." }) to search.${suggestionText}`, {
        mode: 'call',
        error: 'tool_not_found',
        requestedTool: toolName,
        suggestions,
      }),
    }
  }
  return { serverName: match.server, tool: match.tool }
}

export function projectMcpResult(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return String(raw ?? '')
  const record = raw as Record<string, unknown>
  if (record.isError === true) {
    const content = projectContent(record.content)
    return content ? `Error: ${content}` : 'MCP tool returned an error'
  }
  const content = projectContent(record.content)
  if (content) return content
  if (record.structuredContent !== undefined) {
    try {
      return JSON.stringify(record.structuredContent, null, 2)
    } catch {
      return String(record.structuredContent)
    }
  }
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

function projectContent(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const item = block as Record<string, unknown>
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
    else if (item.type === 'image') parts.push('[image]')
    else if (item.type === 'audio') parts.push('[audio]')
    else if (item.type === 'resource' || item.type === 'resource_link') parts.push('[resource]')
  }
  return parts.join('\n')
}
