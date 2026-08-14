import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { abortable, combineAbortSignals, throwIfAborted } from './abort.js'
import { logger } from './logger.js'
import type { McpResource, McpTool, ServerDefinition } from './types.js'
import { isServerDisabled } from './types.js'
import { interpolateEnvVars, interpolateEnvRecord, resolveConfigPath, resolveHttpHeaders, resolveServerUrl } from './utils.js'

export interface ServerConnection {
  client: Client
  transport: Transport
  definition: ServerDefinition
  tools: McpTool[]
  resources: McpResource[]
  instructions?: string
  lastUsedAt: number
  inFlight: number
  status: 'connected' | 'closed' | 'needs-auth'
}

export class McpServerManager {
  private connections = new Map<string, ServerConnection>()
  private connectPromises = new Map<string, Promise<ServerConnection>>()
  private closePromises = new Map<string, Promise<void>>()
  private stopped = false
  private defaultRequestTimeoutMs: number | undefined
  private runtimeSignal: AbortSignal | undefined

  constructor(private readonly defaultCwd: string) {}

  setRuntimeSignal(signal?: AbortSignal): void {
    this.runtimeSignal = signal
  }

  setDefaultRequestTimeoutMs(timeoutMs?: number): void {
    this.defaultRequestTimeoutMs = timeoutMs && timeoutMs > 0 ? timeoutMs : undefined
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

  async callTool(
    name: string,
    definition: ServerDefinition,
    toolName: string,
    args: Record<string, unknown> | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const connection = await this.connect(name, definition, signal)
    if (connection.status === 'needs-auth') {
      throw new Error(`Server "${name}" requires authentication`)
    }
    connection.inFlight += 1
    connection.lastUsedAt = Date.now()
    try {
      const timeout = definition.requestTimeoutMs && definition.requestTimeoutMs > 0
        ? definition.requestTimeoutMs
        : this.defaultRequestTimeoutMs
      return await connection.client.callTool(
        { name: toolName, arguments: args ?? {} },
        undefined,
        {
          ...(signal ? { signal } : {}),
          ...(timeout !== undefined ? { timeout } : {}),
        },
      )
    } finally {
      connection.inFlight = Math.max(0, connection.inFlight - 1)
      connection.lastUsedAt = Date.now()
    }
  }

  async readResource(
    name: string,
    definition: ServerDefinition,
    uri: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const connection = await this.connect(name, definition, signal)
    if (connection.status === 'needs-auth') {
      throw new Error(`Server "${name}" requires authentication`)
    }
    connection.inFlight += 1
    connection.lastUsedAt = Date.now()
    try {
      return await connection.client.readResource({ uri }, { ...(signal ? { signal } : {}) })
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
    await Promise.allSettled([...this.connections.keys()].map(name => this.close(name)))
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

    const client = new Client({ name: 'dsh-mcp-adapter', version: '0.1.0' })
    let transport: Transport

    if (definition.command) {
      const command = interpolateEnvVars(definition.command)
      const args = (definition.args ?? []).map(interpolateEnvVars)
      const cwd = resolveConfigPath(definition.cwd, this.defaultCwd) ?? this.defaultCwd
      transport = new StdioClientTransport({
        command,
        args,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
          ...interpolateEnvRecord(definition.env),
        },
        cwd,
        stderr: definition.debug ? 'inherit' : 'pipe',
      })
    } else if (definition.url) {
      const url = resolveServerUrl(definition)
      if (!url) throw new Error(`Server ${name} has an empty url`)
      const headers = resolveHttpHeaders(definition)
      try {
        transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers },
        }) as Transport
        await this.connectClient(client, transport, signal)
      } catch (error) {
        if (!shouldFallbackToSse(error)) throw error
        logger.info(`${name}: streamable HTTP failed, falling back to SSE`)
        transport = new SSEClientTransport(new URL(url), {
          requestInit: { headers },
        }) as Transport
        await this.connectClient(client, transport, signal)
      }
      return this.finishConnection(name, client, transport, definition)
    } else {
      throw new Error(`Server ${name} unix sockets are not implemented yet`)
    }

    await this.connectClient(client, transport, signal)
    return this.finishConnection(name, client, transport, definition)
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
      lastUsedAt: Date.now(),
      inFlight: 0,
      status: 'connected',
      ...(client.getInstructions?.() ? { instructions: client.getInstructions() } : {}),
    }
    client.onclose = () => {
      if (this.connections.get(name) === connection) connection.status = 'closed'
    }
    const [tools, resources] = await Promise.all([
      this.fetchAllTools(client),
      this.fetchAllResources(client),
    ])
    connection.tools = tools
    connection.resources = resources
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
}

function shouldFallbackToSse(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined
  return status === 404 || status === 405 || status === 406 || status === 415
}
