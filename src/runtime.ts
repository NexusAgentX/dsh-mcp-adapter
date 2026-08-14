import { cloneMcpConfig, loadMcpConfig } from './config.js'
import { McpLifecycleManager } from './lifecycle.js'
import { getAuthStorageOptions } from './mcp-auth.js'
import { createOAuthRuntime } from './mcp-auth-flow.js'
import { computeServerHash, loadMetadataCache, reconstructToolMetadata, saveMetadataCache, serializeServerCache } from './metadata-cache.js'
import { reconstructPromptMetadata } from './prompts.js'
import { McpServerManager } from './server-manager.js'
import type { McpRuntimeState } from './state.js'
import { buildToolMetadata } from './tool-metadata.js'
import type { McpConfig, PromptMetadata, ServerDefinition } from './types.js'
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
  const authStorageOptions = getAuthStorageOptions(config.settings?.oauthDir, cwd)
  const oauthRuntime = createOAuthRuntime(options.signal)
  manager.setAuthStorageOptions(authStorageOptions)
  manager.setOAuthRuntime(oauthRuntime)
  const lifecycle = new McpLifecycleManager(manager)
  if (config.settings?.idleTimeout !== undefined) lifecycle.setGlobalIdleTimeout(config.settings.idleTimeout)

  const cache = programmaticConfig ? null : loadMetadataCache()
  const toolMetadata = reconstructToolMetadata(config, cache)
  const promptMetadata = new Map<string, PromptMetadata[]>()
  const resourceCounts = new Map<string, number>()
  const serverInstructions = new Map<string, string>()
  const prefix = config.settings?.toolPrefix ?? 'server'
  if (cache) {
    for (const [name, entry] of Object.entries(cache.servers)) {
      resourceCounts.set(name, entry.resources.length)
      if (entry.instructions) serverInstructions.set(name, entry.instructions)
      if (entry.prompts?.length) promptMetadata.set(name, reconstructPromptMetadata(name, entry.prompts, prefix))
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
    configPath: options.configPath,
    toolMetadata,
    promptMetadata,
    resourceCounts,
    serverInstructions,
    failureTracker: new Map(),
    failureMessages: new Map(),
    approvedToolCalls: new Map(),
    oauthRuntime,
    authStorageOptions,
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
  state.promptMetadata.set(name, reconstructPromptMetadata(name, connection.prompts, prefix))
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
        [name]: serializeServerCache(definition, connection.tools, connection.resources, connection.instructions, connection.prompts),
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
  state.promptMetadata.set(name, reconstructPromptMetadata(name, connection.prompts, prefix))
  if (!state.programmaticConfig && computeServerHash(definition)) {
    saveMetadataCache({
      version: 1,
      servers: {
        [name]: serializeServerCache(definition, connection.tools, connection.resources, connection.instructions, connection.prompts),
      },
    })
  }
}

export function reloadRuntimeConfig(state: McpRuntimeState): void {
  if (state.programmaticConfig) return
  const next = loadMcpConfig(state.configPath, state.cwd)
  const previousNames = new Set(Object.keys(state.config.mcpServers))
  state.config = next
  if (next.settings?.idleTimeout !== undefined) state.lifecycle.setGlobalIdleTimeout(next.settings.idleTimeout)
  for (const [name, definition] of Object.entries(next.mcpServers)) {
    if (isServerDisabled(definition)) continue
    state.lifecycle.registerServer(name, definition, { idleTimeout: definition.idleTimeout })
    if (definition.lifecycle === 'keep-alive' || definition.lifecycle === 'eager') {
      state.lifecycle.markKeepAlive(name, definition)
    }
  }
  for (const name of previousNames) {
    if (next.mcpServers[name] === undefined || isServerDisabled(next.mcpServers[name])) {
      void state.manager.close(name)
    }
  }
}

export async function stopRuntime(state: McpRuntimeState): Promise<void> {
  state.stopped = true
  await state.lifecycle.gracefulShutdown()
}
