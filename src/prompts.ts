import { formatPromptCommandName, isServerDisabled, type McpConfig, type PromptMetadata, type ToolPrefix } from './types.js'
import { loadMetadataCache } from './metadata-cache.js'
import type { McpRuntimeState } from './state.js'

export function parsePromptArgs(input: string): { positional: string[]; named: Record<string, string> } {
  const positional: string[] = []
  const named: Record<string, string> = {}
  for (const token of tokenizeArgs(input)) {
    const eq = findUnquotedEquals(token)
    if (eq > 0) {
      const key = token.slice(0, eq).trim()
      const value = stripQuotes(token.slice(eq + 1).trim())
      if (key) {
        named[key] = value
        continue
      }
    }
    positional.push(stripQuotes(token))
  }
  return { positional, named }
}

export function resolvePromptArgs(
  metadata: PromptMetadata,
  parsed: { positional: string[]; named: Record<string, string> },
): { ok: true; args: Record<string, string> } | { ok: false; error: string } {
  const args: Record<string, string> = {}
  let positionalIndex = 0
  for (const argDef of metadata.arguments) {
    const value = parsed.named[argDef.name] ?? parsed.positional[positionalIndex++]
    if (value !== undefined && value !== '') args[argDef.name] = value
  }
  for (const [key, value] of Object.entries(parsed.named)) {
    if (!(key in args)) args[key] = value
  }
  const missing = metadata.arguments.filter(arg => arg.required && (args[arg.name] === undefined || args[arg.name] === ''))
  if (missing.length > 0) {
    const usage = metadata.arguments.map(arg => (arg.required ? `<${arg.name}>` : `[${arg.name}]`)).join(' ')
    return { ok: false, error: `Missing required argument(s): ${missing.map(arg => arg.name).join(', ')}.\nUsage: /${metadata.commandName} ${usage}` }
  }
  return { ok: true, args }
}

export function formatPromptResult(result: { messages?: Array<{ role?: string; content?: unknown }> }): string {
  const lines: string[] = []
  const messages = result.messages ?? []
  for (const message of messages) {
    const text = extractMessageText(message.content)
    if (!text) continue
    if (message.role === 'user' && messages.length === 1) lines.push(text)
    else lines.push(`[${message.role ?? 'message'}] ${text}`)
  }
  return lines.join('\n\n').trim()
}

export function reconstructPromptMetadata(
  serverName: string,
  prompts: Array<{ name: string; title?: string; description?: string; arguments?: PromptMetadata['arguments'] }>,
  prefix: ToolPrefix,
): PromptMetadata[] {
  return prompts.map(prompt => ({
    serverName,
    originalName: prompt.name,
    commandName: formatPromptCommandName(prompt.name, serverName, prefix),
    title: prompt.title,
    description: prompt.description ?? prompt.title ?? '',
    arguments: prompt.arguments ?? [],
  }))
}

export function resolveCachedPrompts(config: McpConfig): PromptMetadata[] {
  const cache = loadMetadataCache()
  if (!cache?.servers) return []
  const prefix = config.settings?.toolPrefix ?? 'server'
  const specs: PromptMetadata[] = []
  for (const [serverName, entry] of Object.entries(cache.servers)) {
    const definition = config.mcpServers[serverName]
    if (!definition || isServerDisabled(definition) || !entry.prompts?.length) continue
    specs.push(...reconstructPromptMetadata(serverName, entry.prompts, prefix))
  }
  return specs
}

export function listAllPromptMetadata(state: McpRuntimeState): PromptMetadata[] {
  const flat: PromptMetadata[] = []
  for (const list of state.promptMetadata.values()) flat.push(...list)
  return flat.sort((a, b) => a.commandName.localeCompare(b.commandName))
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

function findUnquotedEquals(token: string): number {
  let quote: '"' | "'" | null = null
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '=') return i
  }
  return -1
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value.charAt(0))) {
    return value.slice(1, -1)
  }
  return value
}

function extractMessageText(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (typeof content !== 'object') return ''
  const item = content as Record<string, unknown>
  if (item.type === 'text' && typeof item.text === 'string') return item.text
  if (Array.isArray(item)) return item.map(extractMessageText).filter(Boolean).join('\n')
  if (item.text && typeof item.text === 'string') return item.text
  return ''
}
