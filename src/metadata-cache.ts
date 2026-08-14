import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { getHarnessPath } from './agent-dir.js'
import { buildToolMetadata } from './tool-metadata.js'
import type { MetadataCache, McpConfig, McpResource, McpTool, ServerCacheEntry, ServerEntry, ToolMetadata } from './types.js'
import { isServerDisabled } from './types.js'
import { interpolateEnvRecord, resolveBearerToken, resolveServerUrl } from './utils.js'

const CACHE_VERSION = 1

export function getMetadataCachePath(): string {
  return getHarnessPath('mcp-cache.json')
}

export function loadMetadataCache(): MetadataCache | null {
  const cachePath = getMetadataCachePath()
  if (!existsSync(cachePath)) return null
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf8')) as MetadataCache
    if (!raw || raw.version !== CACHE_VERSION || !raw.servers || typeof raw.servers !== 'object') return null
    return raw
  } catch {
    return null
  }
}

export function saveMetadataCache(cache: MetadataCache): void {
  const cachePath = getMetadataCachePath()
  mkdirSync(dirname(cachePath), { recursive: true })
  let merged: MetadataCache = { version: CACHE_VERSION, servers: {} }
  try {
    if (existsSync(cachePath)) {
      const existing = JSON.parse(readFileSync(cachePath, 'utf8')) as MetadataCache
      if (existing?.version === CACHE_VERSION && existing.servers) merged.servers = { ...existing.servers }
    }
  } catch {
    // replace
  }
  merged = { version: CACHE_VERSION, servers: { ...merged.servers, ...cache.servers } }
  const tmpPath = `${cachePath}.${process.pid}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, cachePath)
}

export function computeServerHash(definition: ServerEntry): string {
  const snapshot = {
    command: definition.command,
    args: definition.args,
    cwd: definition.cwd,
    url: resolveServerUrl(definition),
    socket: definition.socket,
    env: interpolateEnvRecord(definition.env),
    headers: definition.headers,
    bearer: Boolean(resolveBearerToken(definition)),
    includeTools: definition.includeTools,
    excludeTools: definition.excludeTools,
    exposeResources: definition.exposeResources,
    toolPrefix: definition.toolPrefix,
    disabled: definition.disabled === true,
  }
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

export function reconstructToolMetadata(
  config: McpConfig,
  cache: MetadataCache | null,
): Map<string, ToolMetadata[]> {
  const metadata = new Map<string, ToolMetadata[]>()
  if (!cache) return metadata
  const prefix = config.settings?.toolPrefix ?? 'server'
  for (const [serverName, definition] of Object.entries(config.mcpServers)) {
    if (isServerDisabled(definition)) continue
    const entry = cache.servers[serverName]
    if (!entry || entry.configHash !== computeServerHash(definition)) continue
    const tools: McpTool[] = entry.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
    const resources: McpResource[] = entry.resources ?? []
    metadata.set(serverName, buildToolMetadata(tools, resources, definition, serverName, prefix, config.mcpServers, metadata))
  }
  return metadata
}

export function serializeServerCache(
  definition: ServerEntry,
  tools: McpTool[],
  resources: McpResource[],
  instructions?: string,
  prompts?: Array<{ name: string; title?: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> }>,
): ServerCacheEntry {
  return {
    configHash: computeServerHash(definition),
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
    resources: resources.map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
    })),
    ...(prompts ? { prompts: prompts.map(prompt => ({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      arguments: prompt.arguments,
    })) } : {}),
    ...(instructions !== undefined ? { instructions } : {}),
    cachedAt: Date.now(),
  }
}
