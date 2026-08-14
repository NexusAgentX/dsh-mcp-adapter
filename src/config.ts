import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import stripJsonComments from 'strip-json-comments'
import { loadAgentPluginConfigs } from './agent-plugin-loader.js'
import { getHarnessPath } from './agent-dir.js'
import type { HostConfigDiscovery, ImportKind, McpConfig, McpSettings, ServerEntry } from './types.js'
import { toStringRecord } from './utils.js'

const GENERIC_GLOBAL_CONFIG_PATH = join(homedir(), '.config', 'mcp', 'mcp.json')
const AGENTS_GLOBAL_CONFIG_PATHS = [
  join(homedir(), '.agents', 'mcp.json'),
  join(homedir(), '.agents', 'mcp', 'mcp.json'),
] as const
const PROJECT_CONFIG_NAME = '.mcp.json'
const PROJECT_DSH_CONFIG_NAME = '.dsh/mcp.json'

export type ImportKindName = ImportKind

const IMPORT_PATHS: Record<ImportKind, string[]> = {
  cursor: [join(homedir(), '.cursor', 'mcp.json')],
  'claude-code': [
    join(homedir(), '.claude', 'mcp.json'),
    join(homedir(), '.claude.json'),
    join(homedir(), '.claude', 'claude_desktop_config.json'),
  ],
  'claude-desktop': [join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')],
  codex: [
    join(homedir(), '.codex', 'config.toml'),
    join(homedir(), '.codex', 'config.json'),
  ],
  opencode: [
    join(homedir(), '.config', 'opencode', 'opencode.json'),
    './opencode.json',
  ],
  windsurf: [join(homedir(), '.windsurf', 'mcp.json')],
  vscode: ['.vscode/mcp.json'],
}

const URL_BOUND_AUTH_FIELDS = ['headers', 'bearerToken', 'bearerTokenEnv'] as const

interface ConfigSourceSpec {
  id: string
  label: string
  readPath: string
  writePath: string
  shared: boolean
  scope: 'global' | 'project'
}

export interface ConfigDiscoverySource {
  id: string
  label: string
  path: string
  exists: boolean
  scope: 'global' | 'project'
  shared: boolean
  serverCount: number
}

export interface DiscoveredImportConfig {
  kind: ImportKind
  path: string
  serverCount: number
}

export function getDshGlobalConfigPath(): string {
  return getHarnessPath('mcp.json')
}

export function getGenericGlobalConfigPath(): string {
  return GENERIC_GLOBAL_CONFIG_PATH
}

export function getProjectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, PROJECT_CONFIG_NAME)
}

export function getProjectDshConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, PROJECT_DSH_CONFIG_NAME)
}

export function cloneMcpConfig(config: McpConfig): McpConfig {
  return structuredClone(config)
}

export function loadMcpConfig(overridePath?: string, cwd = process.cwd()): McpConfig {
  const sourceSpecs = getConfigSources(overridePath, cwd)
  const hostConfigDiscovery = getConfiguredHostConfigDiscovery(overridePath, cwd)
  let config: McpConfig = hostConfigDiscovery === 'on'
    ? loadDiscoveredHostConfigs(cwd)
    : { mcpServers: {} }

  for (const source of sourceSpecs) {
    const loaded = readValidatedConfig(source.readPath)
    if (!loaded) continue
    config = mergeConfigs(config, expandImports(loaded, cwd))
  }
  const pluginConfig = loadAgentPluginConfigs(config.settings?.agentPluginPaths, cwd)
  return mergeConfigs(pluginConfig, config)
}

export function resolveConfiguredOAuthDir(raw: unknown, cwd = process.cwd()): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') throw new Error('settings.oauthDir must be a string')
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return resolve(cwd, trimmed)
}

export function discoverConfig(cwd = process.cwd()): {
  sources: ConfigDiscoverySource[]
  imports: DiscoveredImportConfig[]
  hostConfigDiscovery: HostConfigDiscovery
  totalServerCount: number
} {
  const sourceSpecs = getConfigSources(undefined, cwd)
  const sources = sourceSpecs.map((source) => {
    const loaded = readValidatedConfig(source.readPath)
    return {
      id: source.id,
      label: source.label,
      path: source.readPath,
      exists: existsSync(source.readPath),
      scope: source.scope,
      shared: source.shared,
      serverCount: loaded ? Object.keys(loaded.mcpServers).length : 0,
    }
  })
  const imports: DiscoveredImportConfig[] = []
  for (const kind of Object.keys(IMPORT_PATHS) as ImportKind[]) {
    const imported = loadImportedConfig(kind, cwd)
    if (!imported) continue
    imports.push({
      kind,
      path: imported.path,
      serverCount: Object.keys(extractServers(imported.value, kind)).length,
    })
  }
  const config = loadMcpConfig(undefined, cwd)
  return {
    sources,
    imports,
    hostConfigDiscovery: config.settings?.hostConfigDiscovery ?? 'off',
    totalServerCount: Object.keys(config.mcpServers).length,
  }
}

export function writeProjectServerDisabledOverride(
  cwd: string,
  serverName: string,
  disabled: boolean,
): { path: string; changed: boolean } {
  const filePath = getProjectDshConfigPath(cwd)
  let raw: Record<string, unknown> = {}
  if (existsSync(filePath)) {
    try {
      const parsed = parseJsonConfig(readFileSync(filePath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>
    } catch {
      raw = {}
    }
  }
  const servers = getServersObject(raw)
  const previous = servers[serverName]
  const nextEntry: ServerEntry = { ...(previous ?? {}), disabled }
  if (!disabled && previous && previous.disabled !== true) {
    delete nextEntry.disabled
  }
  if (Object.keys(nextEntry).length === 0) {
    delete servers[serverName]
  } else {
    servers[serverName] = nextEntry
  }
  setServersObject(raw, servers)
  const before = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const after = `${JSON.stringify(raw, null, 2)}\n`
  if (before === after) return { path: filePath, changed: false }
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(tmpPath, after, 'utf8')
  renameSync(tmpPath, filePath)
  return { path: filePath, changed: true }
}

function getConfiguredHostConfigDiscovery(overridePath?: string, cwd = process.cwd()): HostConfigDiscovery {
  let configured: HostConfigDiscovery = 'off'
  for (const source of getConfigSources(overridePath, cwd)) {
    const loaded = readValidatedConfig(source.readPath)
    const value = loaded?.settings?.hostConfigDiscovery
    if (value === 'off' || value === 'prompt' || value === 'on') configured = value
  }
  return configured
}

function loadDiscoveredHostConfigs(cwd: string): McpConfig {
  let config: McpConfig = { mcpServers: {} }
  for (const importKind of Object.keys(IMPORT_PATHS) as ImportKind[]) {
    const imported = loadImportedConfig(importKind, cwd)
    if (!imported) continue
    config = mergeConfigs(config, { mcpServers: extractServers(imported.value, importKind) })
  }
  return config
}

function getConfigSources(overridePath?: string, cwd = process.cwd()): ConfigSourceSpec[] {
  const userPath = overridePath ? resolve(overridePath) : getDshGlobalConfigPath()
  const projectPath = getProjectConfigPath(cwd)
  const projectDshPath = getProjectDshConfigPath(cwd)
  const sources: ConfigSourceSpec[] = []

  if (GENERIC_GLOBAL_CONFIG_PATH !== userPath) {
    sources.push({
      id: 'shared-global',
      label: 'user-global standard MCP',
      readPath: GENERIC_GLOBAL_CONFIG_PATH,
      writePath: userPath,
      shared: true,
      scope: 'global',
    })
  }

  for (const [index, agentsPath] of AGENTS_GLOBAL_CONFIG_PATHS.entries()) {
    if (agentsPath === userPath || agentsPath === GENERIC_GLOBAL_CONFIG_PATH) continue
    sources.push({
      id: index === 0 ? 'agents-global' : 'agents-nested-global',
      label: index === 0 ? 'user-global .agents MCP' : 'user-global .agents nested MCP',
      readPath: agentsPath,
      writePath: userPath,
      shared: true,
      scope: 'global',
    })
  }

  sources.push({
    id: 'dsh-global',
    label: 'dsh global override',
    readPath: userPath,
    writePath: userPath,
    shared: false,
    scope: 'global',
  })

  if (projectPath !== userPath) {
    sources.push({
      id: 'shared-project',
      label: 'project standard MCP',
      readPath: projectPath,
      writePath: projectPath,
      shared: true,
      scope: 'project',
    })
  }

  if (projectDshPath !== userPath && projectDshPath !== projectPath) {
    sources.push({
      id: 'dsh-project',
      label: 'project dsh override',
      readPath: projectDshPath,
      writePath: projectDshPath,
      shared: false,
      scope: 'project',
    })
  }

  return sources
}

export function mergeConfigs(base: McpConfig, next: McpConfig): McpConfig {
  const imports = mergeImports(base.imports, next.imports)
  const settings = next.settings ? { ...base.settings, ...next.settings } : base.settings
  return {
    mcpServers: mergeServerMaps(base.mcpServers, next.mcpServers),
    ...(imports !== undefined ? { imports } : {}),
    ...(settings !== undefined ? { settings } : {}),
  }
}

export function mergeServerMaps(
  base: Record<string, ServerEntry>,
  next: Record<string, ServerEntry>,
): Record<string, ServerEntry> {
  const merged = { ...base }
  for (const [name, definition] of Object.entries(next)) {
    const existing = merged[name]
    let baseEntry: ServerEntry = existing ?? {}
    if (existing && typeof definition.socket === 'string') {
      baseEntry = { ...existing }
      for (const field of [
        'command', 'args', 'env', 'cwd', 'url', 'headers', 'auth',
        'bearerToken', 'bearerTokenEnv', 'oauth',
      ] as const) {
        delete baseEntry[field]
      }
    } else if (existing?.socket && (typeof definition.command === 'string' || typeof definition.url === 'string')) {
      baseEntry = { ...existing }
      delete baseEntry.socket
    }
    if (existing && typeof definition.url === 'string' && definition.url !== existing.url) {
      if (baseEntry === existing) baseEntry = { ...existing }
      for (const field of URL_BOUND_AUTH_FIELDS) delete baseEntry[field]
      if (baseEntry.oauth !== false) delete baseEntry.oauth
    }
    merged[name] = { ...baseEntry, ...definition }
  }
  return merged
}

function mergeImports(left: ImportKind[] | undefined, right: ImportKind[] | undefined): ImportKind[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])]
  if (merged.length === 0) return undefined
  return [...new Set(merged)]
}

function expandImports(config: McpConfig, cwd = process.cwd()): McpConfig {
  if (!config.imports?.length) return config
  const importedServers: Record<string, ServerEntry> = {}
  for (const importKind of config.imports) {
    const imported = loadImportedConfig(importKind, cwd)
    if (!imported) continue
    const servers = extractServers(imported.value, importKind)
    for (const [name, definition] of Object.entries(servers)) {
      if (!importedServers[name]) importedServers[name] = definition
    }
  }
  return {
    imports: config.imports,
    ...(config.settings !== undefined ? { settings: config.settings } : {}),
    mcpServers: mergeServerMaps(importedServers, config.mcpServers),
  }
}

function parseJsonConfig(text: string): unknown {
  return JSON.parse(stripJsonComments(text))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLoadedConfig(raw: unknown): McpConfig | null {
  if (!isRecord(raw)) return null
  const serversRaw = raw.mcpServers ?? raw['mcp-servers']
  const mcpServers: Record<string, ServerEntry> = {}
  if (isRecord(serversRaw)) {
    for (const [name, entry] of Object.entries(serversRaw)) {
      if (!isRecord(entry)) continue
      mcpServers[name] = entry as ServerEntry
    }
  }
  const settings = isRecord(raw.settings) ? raw.settings as McpSettings : undefined
  const imports = Array.isArray(raw.imports)
    ? raw.imports.filter((value): value is ImportKind => typeof value === 'string' && value in IMPORT_PATHS)
    : undefined
  return {
    mcpServers,
    ...(imports?.length ? { imports } : {}),
    ...(settings ? { settings } : {}),
  }
}

function readValidatedConfig(filePath: string): McpConfig | null {
  if (!existsSync(filePath)) return null
  try {
    const text = readFileSync(filePath, 'utf8')
    const raw = filePath.endsWith('.toml') ? parseToml(text) : parseJsonConfig(text)
    return normalizeLoadedConfig(raw)
  } catch (error) {
    console.error(`[dsh-mcp] Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function loadImportedConfig(kind: ImportKind, cwd: string): { path: string; value: unknown } | null {
  for (const candidate of resolveImportCandidates(kind, cwd)) {
    if (!existsSync(candidate)) continue
    try {
      const text = readFileSync(candidate, 'utf8')
      const value = candidate.endsWith('.toml') ? parseToml(text) : parseJsonConfig(text)
      return { path: candidate, value }
    } catch {
      continue
    }
  }
  return null
}

function resolveImportCandidates(importKind: ImportKind, cwd: string): string[] {
  return (IMPORT_PATHS[importKind] ?? []).map((candidate) => {
    if (candidate.startsWith('/')) return candidate
    return resolve(cwd, candidate)
  })
}

function extractServers(config: unknown, kind: ImportKind): Record<string, ServerEntry> {
  if (!isRecord(config)) return {}
  let servers: unknown
  switch (kind) {
    case 'claude-desktop':
    case 'claude-code':
      servers = config.mcpServers
      break
    case 'codex':
      servers = config.mcp_servers ?? config.mcpServers
      break
    case 'cursor':
    case 'windsurf':
    case 'vscode':
      servers = config.mcpServers ?? config['mcp-servers']
      break
    case 'opencode':
      servers = config.mcp
      break
    default:
      return {}
  }
  if (!isRecord(servers)) return {}
  const mapped: Record<string, ServerEntry> = {}
  for (const [name, entry] of Object.entries(servers)) {
    if (kind === 'opencode') {
      if (!isRecord(entry) || entry.enabled === false) continue
      if (entry.type === 'local' && Array.isArray(entry.command) && entry.command.length > 0 && entry.command.every(value => typeof value === 'string')) {
        const env = toStringRecord(entry.environment)
        const command = entry.command[0]
        if (!command) continue
        mapped[name] = {
          command,
          args: entry.command.slice(1) as string[],
          ...(env ? { env } : {}),
          ...(typeof entry.cwd === 'string' ? { cwd: entry.cwd } : {}),
        }
        continue
      }
      if (entry.type === 'remote' && typeof entry.url === 'string') {
        const headers = toStringRecord(entry.headers)
        mapped[name] = {
          url: entry.url,
          ...(headers ? { headers } : {}),
        }
      }
      continue
    }
    if (!isRecord(entry)) continue
    if (kind !== 'codex') {
      mapped[name] = entry as ServerEntry
      continue
    }
    const next = { ...entry } as ServerEntry & Record<string, unknown>
    if (typeof next.bearer_token_env_var === 'string') {
      next.bearerTokenEnv = next.bearer_token_env_var
      if (next.auth === undefined) next.auth = 'bearer'
    }
    delete next.bearer_token_env_var
    delete next.http_headers
    delete next.env_http_headers
    mapped[name] = next
  }
  return mapped
}

function getServersObject(raw: Record<string, unknown>): Record<string, ServerEntry> {
  const existing = raw.mcpServers ?? raw['mcp-servers'] ?? {}
  if (!isRecord(existing)) return {}
  return existing as Record<string, ServerEntry>
}

function setServersObject(raw: Record<string, unknown>, servers: Record<string, ServerEntry>): void {
  delete raw['mcp-servers']
  raw.mcpServers = servers
}
