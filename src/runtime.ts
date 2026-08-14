import { cloneMcpConfig, loadMcpConfig } from './config.js'
import { McpLifecycleManager } from './lifecycle.js'
import { computeServerHash, loadMetadataCache, reconstructToolMetadata, saveMetadataCache, serializeServerCache } from './metadata-cache.js'
import { McpServerManager } from './server-manager.js'
import type { McpRuntimeState } from './state.js'
import { buildToolMetadata } from './tool-metadata.js'
import type { McpConfig, ServerDefinition } from './types.js'
import { isServerDisabled } from './types.js'
import { logger } from './logger.js'
import { formatTerminalError } from './utils.js'

export interface CreateRuntimeOptions {
  config?: McpConfig
  configPath?: string
  cwd?: string
  signal?: AbortSignal
}

export function createRuntime(options: CreateRuntimeOptions = {}): McpRuntimeState {
  const cwd = options.cwd ?? process.cwd()
  const programmaticConfig = options.config !== undefined
  const config = programmaticConfig ? cloneMcpConfig(options.config!) : loadMcpConfig(options.configPath, cwd)
  const manager = new McpServerManager(cwd)
  manager.setRuntimeSignal(options.signal)
  manager.setDefaultRequestTimeoutMs(config.settings?.requestTimeoutMs)
  const lifecycle = new McpLifecycleManager(manager)
  if (config.settings?.idleTimeout !== undefined) lifecycle.setGlobalIdleTimeout(config.settings.idleTimeout)

  const cache = programmaticConfig ? null : loadMetadataCache()
  const toolMetadata = reconstructToolMetadata(config, cache)
  const resourceCounts = new Map<string, number>()
  const serverInstructions = new Map<string, string>()
  if (cache) {
    for (const [name, entry] of Object.entries(cache.servers)) {
      resourceCounts.set(name, entry.resources.length)
      if (entry.instructions) serverInstructions.set(name, entry.instructions)
    }
  }

  for (const [name, definition] of Object.entries(config.mcpServers)) {
    if (isServerDisabled(definition)) continue
    lifecycle.registerServer(name, definition, { idleTimeout: definition.idleTimeout })
    if (definition.lifecycle === 'keep-alive' || definition.lifecycle === 'eager' || definition.lifecycle === 'lazy-keep-alive') {
      if (definition.lifecycle !== 'lazy-keep-alive') lifecycle.markKeepAlive(name, definition)
    }
  }

  const state: McpRuntimeState = {
    manager,
    lifecycle,
    config,
    programmaticConfig,
    cwd,
    toolMetadata,
    resourceCounts,
    serverInstructions,
    failureTracker: new Map(),
    failureMessages: new Map(),
    stopped: false,
  }

  lifecycle.setReconnectCallback(serverName => {
    void refreshServerMetadata(state, serverName).catch(error => {
      logger.warn(`metadata refresh after reconnect failed for ${serverName}: ${formatTerminalError(error)}`)
    })
  })

  return state
}

export async function startRuntime(state: McpRuntimeState, signal?: AbortSignal): Promise<void> {
  state.lifecycle.startHealthChecks(signal)
  const startups: Promise<void>[] = []
  for (const [name, definition] of Object.entries(state.config.mcpServers)) {
    if (isServerDisabled(definition)) continue
    if (definition.lifecycle === 'eager' || definition.lifecycle === 'keep-alive') {
      startups.push(connectAndCache(state, name, definition, signal).catch(error => {
        state.failureTracker.set(name, Date.now())
        state.failureMessages.set(name, formatTerminalError(error))
        logger.warn(`startup connect ${name} failed: ${formatTerminalError(error)}`)
      }))
    }
  }
  await Promise.all(startups)
}

export async function connectAndCache(
  state: McpRuntimeState,
  name: string,
  definition: ServerDefinition,
  signal?: AbortSignal,
): Promise<void> {
  const connection = await state.manager.connect(name, definition, signal)
  const prefix = state.config.settings?.toolPrefix ?? 'server'
  const metadata = buildToolMetadata(
    connection.tools,
    connection.resources,
    definition,
    name,
    prefix,
    state.config.mcpServers,
    state.toolMetadata,
  )
  state.toolMetadata.set(name, metadata)
  state.resourceCounts.set(name, connection.resources.length)
  if (connection.instructions) state.serverInstructions.set(name, connection.instructions)
  else state.serverInstructions.delete(name)
  state.failureTracker.delete(name)
  state.failureMessages.delete(name)
  if (definition.lifecycle === 'lazy-keep-alive') state.lifecycle.markKeepAlive(name, definition)
  if (!state.programmaticConfig) {
    saveMetadataCache({
      version: 1,
      servers: {
        [name]: serializeServerCache(definition, connection.tools, connection.resources, connection.instructions),
      },
    })
  }
}

export async function refreshServerMetadata(state: McpRuntimeState, name: string): Promise<void> {
  const definition = state.config.mcpServers[name]
  if (!definition || isServerDisabled(definition)) return
  const connection = state.manager.getConnection(name)
  if (!connection || connection.status !== 'connected') return
  const prefix = state.config.settings?.toolPrefix ?? 'server'
  state.toolMetadata.set(name, buildToolMetadata(
    connection.tools,
    connection.resources,
    definition,
    name,
    prefix,
    state.config.mcpServers,
    state.toolMetadata,
  ))
  if (!state.programmaticConfig && computeServerHash(definition)) {
    saveMetadataCache({
      version: 1,
      servers: {
        [name]: serializeServerCache(definition, connection.tools, connection.resources, connection.instructions),
      },
    })
  }
}

export async function stopRuntime(state: McpRuntimeState): Promise<void> {
  state.stopped = true
  await state.lifecycle.gracefulShutdown()
}
