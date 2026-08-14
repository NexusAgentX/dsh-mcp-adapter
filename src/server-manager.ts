import {
  Client,
  SdkHttpError,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { Transport } from '@modelcontextprotocol/client'
import { abortable, combineAbortSignals, throwIfAborted } from './abort.js'
import { getAuthForUrl, type AuthStorageOptions } from './mcp-auth.js'
import { supportsOAuth, type McpOAuthRuntime } from './mcp-auth-flow.js'
import { logger } from './logger.js'
import { resolveNpxBinary } from './npx-resolver.js'
import { withSessionRecovery } from './session-recovery.js'
import type { McpPrompt, McpResource, McpTool, ServerDefinition } from './types.js'
import { isServerDisabled } from './types.js'
import { UnixSocketClientTransport } from './unix-socket-transport.js'
import {
  interpolateEnvVars,
  interpolateEnvRecord,
  resolveCommandSecretsRecord,
  resolveConfigPath,
  resolveHttpHeaders,
  resolveServerUrl,
} from './utils.js'

export interface ServerConnection {
  client: Client
  transport: Transport
  definition: ServerDefinition
  tools: McpTool[]
  resources: McpResource[]
  prompts: McpPrompt[]
  instructions?: string
  lastUsedAt: number
  inFlight: number
  status: 'connected' | 'closed' | 'needs-auth'
}

export class McpServerManager {
  private connections = new Map<string, ServerConnection>()
  private connectPromises = new Map<string, Promise<ServerConnection>>()
  private reconnectPromises = new Map<string, Promise<ServerConnection>>()
  private closePromises = new Map<string, Promise<void>>()
  private stopped = false
  private defaultRequestTimeoutMs: number | undefined
  private runtimeSignal: AbortSignal | undefined
  private authStorageOptions: AuthStorageOptions = {}
  private oauthRuntime: McpOAuthRuntime | undefined = undefined

  constructor(private readonly defaultCwd: string) {}

  setRuntimeSignal(signal?: AbortSignal): void {
    this.runtimeSignal = signal
  }

  setDefaultRequestTimeoutMs(timeoutMs?: number): void {
    this.defaultRequestTimeoutMs = timeoutMs && timeoutMs > 0 ? timeoutMs : undefined
  }

  setAuthStorageOptions(options: AuthStorageOptions): void {
    this.authStorageOptions = options
  }

  setOAuthRuntime(runtime?: McpOAuthRuntime): void {
    this.oauthRuntime = runtime
    void this.oauthRuntime
  }

  isConnecting(name: string): boolean {
    return this.connectPromises.has(name)
  }

  getConnection(name: string): ServerConnection | undefined {
    return this.connections.get(name)
  }

  isIdle(name: string, timeoutMs: number): boolean {
    const connection = this.connections.get(name)
    if (!connection || connection.status !== 'connected') return false
    if (connection.inFlight > 0) return false
    return Date.now() - connection.lastUsedAt >= timeoutMs
  }

  async connect(name: string, definition: ServerDefinition, signal?: AbortSignal): Promise<ServerConnection> {
    if (isServerDisabled(definition)) throw new Error(`MCP server "${name}" is disabled`)
    if (this.stopped) throw new Error('MCP server manager is closed')
    const ownedSignal = combineAbortSignals(this.runtimeSignal, signal)
    throwIfAborted(ownedSignal)
    const closing = this.closePromises.get(name)
    if (closing) await abortable(closing, ownedSignal)
    throwIfAborted(ownedSignal)

    if (this.connectPromises.has(name)) {
      return abortable(this.connectPromises.get(name)!, ownedSignal)
    }
    const existing = this.connections.get(name)
    if (existing?.status === 'connected') {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const promise = this.createConnection(name, definition, ownedSignal)
    this.connectPromises.set(name, promise)
    try {
      const connection = await promise
      this.connections.set(name, connection)
      return connection
    } finally {
      if (this.connectPromises.get(name) === promise) this.connectPromises.delete(name)
    }
  }

  async reconnect(
    name: string,
    definition: ServerDefinition,
    staleConnection: ServerConnection,
    signal?: AbortSignal,
  ): Promise<ServerConnection> {
    const ownedSignal = combineAbortSignals(this.runtimeSignal, signal)
    throwIfAborted(ownedSignal)
    const inFlight = this.reconnectPromises.get(name)
    if (inFlight) return abortable(inFlight, ownedSignal)
    const promise = this.doReconnect(name, definition, staleConnection, ownedSignal).finally(() => {
      if (this.reconnectPromises.get(name) === promise) this.reconnectPromises.delete(name)
    })
    this.reconnectPromises.set(name, promise)
    return abortable(promise, ownedSignal)
  }

  private async doReconnect(
    name: string,
    definition: ServerDefinition,
    staleConnection: ServerConnection,
    signal?: AbortSignal,
  ): Promise<ServerConnection> {
    const current = this.connections.get(name)
    if (current !== staleConnection) {
      return current ?? this.connect(name, definition, signal)
    }
    const staleInFlight = staleConnection.inFlight
    await this.close(name)
    const fresh = await this.connect(name, definition, signal)
    fresh.inFlight = Math.max(fresh.inFlight, staleInFlight)
    return fresh
  }

  async callTool(
    name: string,
    definition: ServerDefinition,
    toolName: string,
    args: Record<string, unknown> | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.connect(name, definition, signal)
    return withSessionRecovery(
      { manager: this, config: { mcpServers: { [name]: definition } }, signal },
      name,
      async (connection) => {
        if (connection.status === 'needs-auth') throw new Error(`Server "${name}" requires authentication`)
        connection.inFlight += 1
        connection.lastUsedAt = Date.now()
        try {
          const timeout = definition.requestTimeoutMs && definition.requestTimeoutMs > 0
            ? definition.requestTimeoutMs
            : this.defaultRequestTimeoutMs
          return await connection.client.callTool(
            { name: toolName, arguments: args ?? {} },
            {
              ...(signal ? { signal } : {}),
              ...(timeout !== undefined ? { timeout } : {}),
            },
          )
        } finally {
          connection.inFlight = Math.max(0, connection.inFlight - 1)
          connection.lastUsedAt = Date.now()
        }
      },
    )
  }

  async readResource(
    name: string,
    definition: ServerDefinition,
    uri: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.connect(name, definition, signal)
    return withSessionRecovery(
      { manager: this, config: { mcpServers: { [name]: definition } }, signal },
      name,
      async (connection) => {
        if (connection.status === 'needs-auth') throw new Error(`Server "${name}" requires authentication`)
        connection.inFlight += 1
        connection.lastUsedAt = Date.now()
        try {
          return await connection.client.readResource({ uri }, { ...(signal ? { signal } : {}) })
        } finally {
          connection.inFlight = Math.max(0, connection.inFlight - 1)
          connection.lastUsedAt = Date.now()
        }
      },
    )
  }

  async getPrompt(
    name: string,
    promptName: string,
    args?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
    const definition = this.connections.get(name)?.definition
    if (!definition) throw new Error(`Server "${name}" is not connected`)
    const connection = await this.connect(name, definition, signal)
    if (connection.status === 'needs-auth') throw new Error(`Server "${name}" requires authentication`)
    connection.inFlight += 1
    connection.lastUsedAt = Date.now()
    try {
      return await connection.client.getPrompt({
        name: promptName,
        ...(args ? { arguments: args } : {}),
      })
    } finally {
      connection.inFlight = Math.max(0, connection.inFlight - 1)
      connection.lastUsedAt = Date.now()
    }
  }

  async close(name: string): Promise<void> {
    const existing = this.closePromises.get(name)
    if (existing) return existing
    const promise = this.closeOnce(name).finally(() => {
      if (this.closePromises.get(name) === promise) this.closePromises.delete(name)
    })
    this.closePromises.set(name, promise)
    return promise
  }

  async closeAll(): Promise<void> {
    this.stopped = true
    await Promise.allSettled([...this.connections.keys()].map(serverName => this.close(serverName)))
  }

  private async closeOnce(name: string): Promise<void> {
    const connection = this.connections.get(name)
    this.connections.delete(name)
    if (!connection) return
    connection.status = 'closed'
    try {
      await connection.client.close()
    } catch (error) {
      logger.debug(`close ${name} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async createConnection(name: string, definition: ServerDefinition, signal?: AbortSignal): Promise<ServerConnection> {
    throwIfAborted(signal)
    const configured = [definition.command, definition.url, definition.socket].filter(value => typeof value === 'string' && value.length > 0)
    if (configured.length !== 1) {
      throw new Error(`Server ${name} must configure exactly one of command, url, or socket`)
    }

    const client = new Client({ name: 'dsh-mcp-adapter', version: '0.2.0' })
    let transport: Transport | undefined

    if (definition.command) {
      let command = interpolateEnvVars(definition.command)
      let args = (definition.args ?? []).map(interpolateEnvVars)
      if (command === 'npx' || command === 'npm') {
        const resolved = await resolveNpxBinary(command, args, signal)
        if (resolved) {
          command = resolved.isJs ? 'node' : resolved.binPath
          args = resolved.isJs ? [resolved.binPath, ...resolved.extraArgs] : resolved.extraArgs
        }
      }
      const cwd = resolveConfigPath(definition.cwd, this.defaultCwd) ?? this.defaultCwd
      if (definition.pluginDataDir) {
        const { mkdirSync } = await import('node:fs')
        mkdirSync(definition.pluginDataDir, { recursive: true })
      }
      transport = new StdioClientTransport({
        command,
        args,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
          ...(definition.literalEnv ? definition.env : resolveCommandSecretsRecord(definition.env, key => `${name}.env.${key}`) ?? interpolateEnvRecord(definition.env)),
        },
        cwd,
        stderr: definition.debug ? 'inherit' : 'pipe',
      })
    } else if (definition.socket) {
      const socketPath = resolveConfigPath(definition.socket, this.defaultCwd)
      if (!socketPath) throw new Error(`Server ${name} has an empty socket path`)
      transport = new UnixSocketClientTransport(socketPath)
    } else {
      const url = resolveServerUrl(definition)
      if (!url) throw new Error(`Server ${name} has an empty url`)
      const headers = resolveHttpHeaders(definition)
      if (supportsOAuth(definition) && !headers.Authorization) {
        const stored = getAuthForUrl(name, url, this.authStorageOptions)
        const token = stored?.tokens?.accessToken
        if (token) headers.Authorization = `Bearer ${token}`
      }
      try {
        transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers },
        }) as Transport
        await this.connectClient(client, transport, signal)
      } catch (error) {
        if (isUnauthorized(error)) {
          if (!transport) throw error
          return this.needsAuthConnection(client, transport, definition)
        }
        if (!shouldFallbackToSse(error, definition)) throw error
        logger.info(`${name}: streamable HTTP failed, falling back to SSE`)
        transport = new SSEClientTransport(new URL(url), {
          requestInit: { headers },
        }) as Transport
        try {
          await this.connectClient(client, transport, signal)
        } catch (sseError) {
          if (isUnauthorized(sseError)) return this.needsAuthConnection(client, transport, definition)
          throw sseError
        }
      }
      return this.finishConnection(name, client, transport, definition)
    }

    if (!transport) throw new Error(`Server ${name} failed to create a transport`)
    await this.connectClient(client, transport, signal)
    return this.finishConnection(name, client, transport, definition)
  }

  private needsAuthConnection(client: Client, transport: Transport, definition: ServerDefinition): ServerConnection {
    return {
      client,
      transport,
      definition,
      tools: [],
      resources: [],
      prompts: [],
      lastUsedAt: Date.now(),
      inFlight: 0,
      status: 'needs-auth',
    }
  }

  private async connectClient(client: Client, transport: Transport, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    await abortable(client.connect(transport), signal)
  }

  private async finishConnection(
    name: string,
    client: Client,
    transport: Transport,
    definition: ServerDefinition,
  ): Promise<ServerConnection> {
    const connection: ServerConnection = {
      client,
      transport,
      definition,
      tools: [],
      resources: [],
      prompts: [],
      lastUsedAt: Date.now(),
      inFlight: 0,
      status: 'connected',
      ...(client.getInstructions?.() ? { instructions: client.getInstructions() } : {}),
    }
    client.onclose = () => {
      if (this.connections.get(name) === connection) connection.status = 'closed'
    }
    const [tools, resources, prompts] = await Promise.all([
      this.fetchAllTools(client),
      this.fetchAllResources(client),
      this.fetchAllPrompts(client),
    ])
    connection.tools = tools
    connection.resources = resources
    connection.prompts = prompts
    return connection
  }

  private async fetchAllTools(client: Client): Promise<McpTool[]> {
    const tools: McpTool[] = []
    let cursor: string | undefined
    do {
      const result = await client.listTools(cursor ? { cursor } : undefined)
      for (const tool of result.tools ?? []) {
        if (!tool?.name) continue
        tools.push({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })
      }
      cursor = result.nextCursor
    } while (cursor)
    return tools
  }

  private async fetchAllResources(client: Client): Promise<McpResource[]> {
    const capabilities = client.getServerCapabilities?.()
    if (!capabilities?.resources) return []
    const resources: McpResource[] = []
    let cursor: string | undefined
    try {
      do {
        const result = await client.listResources(cursor ? { cursor } : undefined)
        for (const resource of result.resources ?? []) {
          if (!resource?.uri || !resource.name) continue
          resources.push({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          })
        }
        cursor = result.nextCursor
      } while (cursor)
    } catch (error) {
      logger.warn(`resource listing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return resources
  }

  private async fetchAllPrompts(client: Client): Promise<McpPrompt[]> {
    const capabilities = client.getServerCapabilities?.()
    if (!capabilities?.prompts) return []
    const prompts: McpPrompt[] = []
    let cursor: string | undefined
    try {
      do {
        const result = await client.listPrompts(cursor ? { cursor } : undefined)
        for (const prompt of result.prompts ?? []) {
          if (!prompt?.name) continue
          prompts.push({
            name: prompt.name,
            title: prompt.title,
            description: prompt.description,
            arguments: prompt.arguments,
          })
        }
        cursor = result.nextCursor
      } while (cursor)
    } catch (error) {
      logger.warn(`prompt listing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return prompts
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof UnauthorizedError
    || (error instanceof SdkHttpError && error.status === 401)
}

function shouldFallbackToSse(error: unknown, definition: ServerDefinition): boolean {
  if (definition.protocolVersion === '2026-07-28') return false
  return error instanceof SdkHttpError && [404, 405, 406, 415].includes(error.status)
}
