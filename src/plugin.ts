import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-tools'
import { handleMcpCommand } from './commands.js'
import { resolveDirectTools } from './direct-tools.js'
import { logger } from './logger.js'
import { dispatchProxy } from './proxy.js'
import { createRuntime, startRuntime, stopRuntime } from './runtime.js'
import type { McpRuntimeState } from './state.js'
import { parseJsonObjectArgs } from './utils.js'
import { executeCall } from './proxy.js'

export const name = 'dsh-mcp-adapter'
export const inject = ['tools']

export interface Config {
  configPath?: string
  cwd?: string
}

export const Config: Schema<Config> = Schema.object({
  configPath: Schema.string(),
  cwd: Schema.string(),
})

export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const controller = new AbortController()
  const state = createRuntime({
    configPath: config.configPath,
    cwd: config.cwd,
    signal: controller.signal,
  })

  ctx.effect(() => {
    return () => {
      controller.abort()
      void stopRuntime(state)
    }
  }, 'dsh-mcp-adapter.runtime')

  registerProxyTool(ctx, state)
  registerDirectTools(ctx, state)
  registerCommand(ctx, state)

  await startRuntime(state, controller.signal)
  logger.info(`loaded ${Object.keys(state.config.mcpServers).length} MCP server(s)`)
}

function registerProxyTool(ctx: Context, state: McpRuntimeState): void {
  if (state.config.settings?.disableProxyTool === true) return
  ctx.tools.register(defineTool({
    name: 'mcp',
    description: [
      'MCP gateway — connect to external MCP servers without loading every tool schema into context.',
      'Discover with mcp({ search: "query" }). Inspect with mcp({ describe: "tool_name" }).',
      'Call with mcp({ tool: "tool_name", args: { ... } }).',
      'Connect a lazy server with mcp({ connect: "server" }). Omit all fields for status.',
    ].join(' '),
    parameters: {
      tool: { type: 'string', description: 'Tool name to call (e.g. chrome_devtools_take_screenshot)' },
      args: { type: 'json', description: 'Tool arguments as a JSON object, or a JSON string encoding one' },
      connect: { type: 'string', description: 'Server name to connect (lazy connect + metadata refresh)' },
      describe: { type: 'string', description: 'Tool name to describe (shows parameters)' },
      instructions: { type: 'string', description: 'Server name to show that server\'s usage instructions' },
      search: { type: 'string', description: 'Search tools by name/description' },
      regex: { type: 'boolean', description: 'Treat search as regex (default: substring match)' },
      includeSchemas: { type: 'boolean', description: 'Include parameter schemas in search results (default: true)' },
      limit: { type: 'integer', description: 'Maximum search results to return (default: 12)' },
      offset: { type: 'integer', description: 'Search result offset (default: 0)' },
      server: { type: 'string', description: 'Filter to a specific server (also disambiguates tool calls)' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => {
        const record = value && typeof value === 'object' && !Array.isArray(value)
          ? value as { text?: unknown }
          : undefined
        const text = typeof record?.text === 'string' ? record.text : JSON.stringify(value)
        return [{ type: 'text', text }]
      },
    },
    presentCall(args) {
      if (args.tool) return { card: 'generic', title: `mcp ${args.tool}`, kind: 'other' }
      if (args.search !== undefined) return { card: 'generic', title: 'mcp search', kind: 'search' }
      if (args.describe) return { card: 'generic', title: `mcp describe ${args.describe}`, kind: 'read' }
      if (args.connect) return { card: 'generic', title: `mcp connect ${args.connect}`, kind: 'other' }
      return { card: 'generic', title: 'mcp', kind: 'other' }
    },
    async execute(args, exec) {
      const parsedArgs = args.args === undefined ? undefined : parseJsonObjectArgs(args.args)
      const result = await dispatchProxy(state, { ...args, args: parsedArgs }, exec.signal)
      return JSON.parse(JSON.stringify(result))
    },
  }))
}

function registerDirectTools(ctx: Context, state: McpRuntimeState): void {
  for (const spec of resolveDirectTools(state)) {
    const parameters = isObjectSchema(spec.inputSchema)
      ? spec.inputSchema
      : { type: 'object', additionalProperties: true }
    try {
      ctx.tools.register({
        name: sanitizeDshToolName(spec.prefixedName),
        description: spec.description || `(MCP tool from ${spec.serverName})`,
        parameters,
        output: {
          schema: {},
          render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
        },
        async execute(args, exec) {
          const parsed = args && typeof args === 'object' && !Array.isArray(args)
            ? args as Record<string, unknown>
            : {}
          const result = await executeCall(state, spec.prefixedName, parsed, spec.serverName, exec.signal)
          if (result.details.error) throw new Error(result.text)
          return result.text
        },
      })
    } catch (error) {
      logger.warn(`skipped direct tool ${spec.prefixedName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function registerCommand(ctx: Context, state: McpRuntimeState): void {
  const commands = ctx.get('commands')
  if (!commands) return
  commands.register({
    name: 'mcp',
    description: 'MCP server status, connect, enable, disable',
    input: { hint: '[status|list|connect <server>|enable <server>|disable <server>]' },
    async handler(invocation) {
      return handleMcpCommand(state, invocation.rawInput)
    },
  })
}

function isObjectSchema(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeDshToolName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_-]/g, '_')
  return normalized.slice(0, 64) || 'mcp_tool'
}
