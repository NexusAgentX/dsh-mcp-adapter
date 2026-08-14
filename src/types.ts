export type ImportKind =
  | 'cursor'
  | 'claude-code'
  | 'claude-desktop'
  | 'codex'
  | 'opencode'
  | 'windsurf'
  | 'vscode'

export type ToolPrefix = 'server' | 'none' | 'short' | 'mcp'
export type HostConfigDiscovery = 'off' | 'prompt' | 'on'
export type Lifecycle = 'keep-alive' | 'lazy' | 'lazy-keep-alive' | 'eager'

export interface OAuthConfig {
  grantType?: 'authorization_code' | 'client_credentials'
  clientId?: string
  clientSecret?: string
  scope?: string
  authorizationParams?: Record<string, string>
  redirectUri?: string
  clientName?: string
  clientUri?: string
  logoUri?: string
  skipIssuerMetadataValidation?: boolean
}

export interface McpOutputGuardSettings {
  maxBytes?: number
  maxLines?: number
  detailsMaxBytes?: number
}

export interface ServerEntry {
  command?: string
  args?: string[]
  socket?: string
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  auth?: 'oauth' | 'bearer' | false
  bearerToken?: string
  bearerTokenEnv?: string
  oauth?: OAuthConfig | false
  lifecycle?: Lifecycle
  idleTimeout?: number
  requestTimeoutMs?: number
  exposeResources?: boolean
  directTools?: boolean | string[]
  toolPrefix?: ToolPrefix
  includeTools?: string[]
  excludeTools?: string[]
  searchKeywords?: Record<string, string[]>
  approveTools?: boolean | string[]
  debug?: boolean
  protocolVersion?: 'legacy' | 'auto' | '2026-07-28'
  disabled?: boolean
  httpTransport?: 'streamable-http' | 'sse'
  pluginDataDir?: string
  literalEnv?: boolean
  trace?: boolean
}

export function isServerDisabled(definition: ServerEntry | undefined): boolean {
  return definition?.disabled === true
}

export interface McpTraceSettings {
  enabled?: boolean
  file?: string
  maxBytes?: number
  maxEvents?: number
}

export interface McpSettings {
  toolPrefix?: ToolPrefix
  hostConfigDiscovery?: HostConfigDiscovery
  idleTimeout?: number
  requestTimeoutMs?: number
  directTools?: boolean
  disableProxyTool?: boolean
  freezeDirectTools?: boolean
  scriptMode?: boolean
  autoAuth?: boolean
  sampling?: boolean
  samplingAutoApprove?: boolean
  elicitation?: boolean
  outputGuard?: boolean | McpOutputGuardSettings
  authRequiredMessage?: string
  oauthDir?: string
  agentPluginPaths?: string[]
  approveTools?: boolean | string[]
  trace?: McpTraceSettings
}

export interface PromptMetadata {
  serverName: string
  originalName: string
  commandName: string
  title?: string
  description: string
  arguments: Array<{ name: string; description?: string; required?: boolean }>
}

export type McpToolApprovalOrigin = 'proxy' | 'direct' | 'script' | 'resource'
export type McpToolApprovalDecision = 'allow_once' | 'allow_for_session' | 'deny' | 'abstain'

export interface McpConfig {
  mcpServers: Record<string, ServerEntry>
  imports?: ImportKind[]
  settings?: McpSettings
}

export type ServerDefinition = ServerEntry

export interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema?: unknown
}

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface McpPrompt {
  name: string
  title?: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

export interface ToolMetadata {
  name: string
  originalName: string
  description: string
  resourceUri?: string
  inputSchema?: unknown
}

export interface DirectToolSpec {
  serverName: string
  originalName: string
  prefixedName: string
  description: string
  inputSchema?: unknown
  resourceUri?: string
}

export interface CachedTool {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface CachedResource {
  uri: string
  name: string
  description?: string
}

export interface CachedPrompt {
  name: string
  title?: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
}

export interface ServerCacheEntry {
  configHash: string
  tools: CachedTool[]
  resources: CachedResource[]
  prompts?: CachedPrompt[]
  instructions?: string
  cachedAt: number
}

export interface MetadataCache {
  version: number
  servers: Record<string, ServerCacheEntry>
}

export interface ProxyResult {
  text: string
  details: Record<string, unknown>
}

function sanitizeServerPrefix(serverName: string, preserveProviderValid = true): string {
  const validCharacters = preserveProviderValid ? /^[A-Za-z0-9_-]$/ : /^[A-Za-z0-9]$/
  return Array.from(serverName, char =>
    validCharacters.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`,
  ).join('')
}

export function getServerPrefix(serverName: string, mode: ToolPrefix): string {
  if (mode === 'none') return ''
  if (mode === 'short') {
    let short = sanitizeServerPrefix(serverName.replace(/-?mcp$/i, ''))
    if (!short) short = 'mcp'
    return short
  }
  if (mode === 'mcp') return `mcp__${sanitizeServerPrefix(serverName)}`
  return sanitizeServerPrefix(serverName)
}

export function formatToolName(toolName: string, serverName: string, prefix: ToolPrefix): string {
  const p = getServerPrefix(serverName, prefix)
  const sanitized = toolName.replace(/\./g, '_')
  return p ? `${p}_${sanitized}` : sanitized
}

export function resolveToolPrefix(
  definition?: Pick<ServerEntry, 'toolPrefix'>,
  globalPrefix?: ToolPrefix,
): ToolPrefix {
  return definition?.toolPrefix ?? globalPrefix ?? 'server'
}

export function resolveServerFromToolName(
  toolName: string,
  serverNames: Iterable<string>,
  prefix: ToolPrefix,
): string | undefined {
  if (prefix === 'none') return undefined
  const candidates: Array<{ name: string; prefix: string }> = []
  for (const name of serverNames) {
    const p = getServerPrefix(name, prefix)
    if (p && toolName.startsWith(`${p}_`)) candidates.push({ name, prefix: p })
  }
  if (candidates.length === 0) return undefined
  candidates.sort((a, b) => b.prefix.length - a.prefix.length)
  const best = candidates[0]
  if (!best) return undefined
  if (candidates.some(c => c.prefix === best.prefix && c.name !== best.name)) return undefined
  return best.name
}

function getLegacyServerPrefix(serverName: string, mode: ToolPrefix): string {
  if (mode === 'none') return ''
  if (mode === 'short') return sanitizeServerPrefix(serverName.replace(/-?mcp$/i, ''), false) || 'mcp'
  if (mode === 'mcp') return `mcp__${sanitizeServerPrefix(serverName, false)}`
  return sanitizeServerPrefix(serverName, false)
}

function formatLegacyToolName(toolName: string, serverName: string, prefix: ToolPrefix): string {
  const serverPrefix = getLegacyServerPrefix(serverName, prefix)
  const sanitizedToolName = toolName.replace(/[.-]/g, '_')
  return serverPrefix ? `${serverPrefix}_${sanitizedToolName}` : sanitizedToolName
}

export function getToolNameCandidates(toolName: string, serverName: string, prefix: ToolPrefix, includeLegacy = true): Set<string> {
  const candidates = new Set<string>([
    toolName,
    formatToolName(toolName, serverName, prefix),
    formatToolName(toolName, serverName, 'server'),
    formatToolName(toolName, serverName, 'short'),
    formatToolName(toolName, serverName, 'mcp'),
  ])
  if (includeLegacy) {
    const legacyToolName = toolName.replace(/-/g, '_')
    candidates.add(legacyToolName)
    candidates.add(formatToolName(legacyToolName, serverName, prefix))
    candidates.add(formatToolName(legacyToolName, serverName, 'server'))
    candidates.add(formatToolName(legacyToolName, serverName, 'short'))
    candidates.add(formatToolName(legacyToolName, serverName, 'mcp'))
    candidates.add(formatLegacyToolName(toolName, serverName, prefix))
    candidates.add(formatLegacyToolName(toolName, serverName, 'server'))
    candidates.add(formatLegacyToolName(toolName, serverName, 'short'))
    candidates.add(formatLegacyToolName(toolName, serverName, 'mcp'))
    candidates.add(formatToolName(toolName, serverName, prefix).replace(/-/g, '_'))
    candidates.add(formatToolName(toolName, serverName, 'server').replace(/-/g, '_'))
    candidates.add(formatToolName(toolName, serverName, 'short').replace(/-/g, '_'))
    candidates.add(formatToolName(toolName, serverName, 'mcp').replace(/-/g, '_'))
  }
  return candidates
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

export function matchesToolPattern(candidates: Set<string>, patterns?: unknown): boolean {
  if (!Array.isArray(patterns) || patterns.length === 0) return false
  for (const pattern of patterns) {
    if (typeof pattern !== 'string') continue
    if (!pattern.includes('*') && !pattern.includes('?') && candidates.has(pattern)) return true
    if ((pattern.includes('*') || pattern.includes('?')) && [...candidates].some(candidate => globToRegExp(pattern).test(candidate))) {
      return true
    }
  }
  return false
}

function matchesToolSelector(
  toolName: string,
  serverName: string,
  prefix: ToolPrefix,
  patterns: unknown,
  otherCurrentCandidates?: Set<string>,
): boolean {
  const currentCandidates = getToolNameCandidates(toolName, serverName, prefix, false)
  if (matchesToolPattern(currentCandidates, patterns)) return true
  if (!otherCurrentCandidates) return matchesToolPattern(getToolNameCandidates(toolName, serverName, prefix), patterns)
  const legacyCandidates = getToolNameCandidates(toolName, serverName, prefix)
  for (const candidate of currentCandidates) legacyCandidates.delete(candidate)
  if (!Array.isArray(patterns)) return false
  return patterns.some(pattern =>
    typeof pattern === 'string'
    && !matchesToolPattern(otherCurrentCandidates, [pattern])
    && matchesToolPattern(legacyCandidates, [pattern]),
  )
}

export function isToolAllowed(
  toolName: string,
  serverName: string,
  prefix: ToolPrefix,
  includeTools?: unknown,
  excludeTools?: unknown,
  otherCurrentCandidates?: Set<string>,
): boolean {
  const included = !Array.isArray(includeTools) || includeTools.length === 0
    || matchesToolSelector(toolName, serverName, prefix, includeTools, otherCurrentCandidates)
  const excluded = matchesToolSelector(toolName, serverName, prefix, excludeTools, otherCurrentCandidates)
  return included && !excluded
}

export function sanitizePromptName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '')
  if (!cleaned) return 'prompt'
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
}

export function formatPromptCommandName(
  promptName: string,
  serverName: string,
  prefix: ToolPrefix,
): string {
  const serverPart = getServerPrefix(serverName, prefix) || sanitizeServerPrefix(serverName) || 'server'
  return `mcp__${serverPart}__${sanitizePromptName(promptName)}`
}
