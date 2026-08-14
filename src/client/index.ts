import { createElement, type ReactNode } from 'react'
import { McpToolRow } from './McpToolRow.ts'

type CommandExecution = {
  result?: { kind?: string; text?: string }
}

type RemoteResult = {
  ok: boolean
  error?: { code: string; message: string }
  value?: CommandExecution
}

type AnyCtx = {
  get: (name: string) => unknown
  remote?: {
    commands: {
      execute: (sessionId: string, line: string) => Promise<RemoteResult>
    }
  }
  effect: (fn: () => () => void, name?: string) => unknown
  slots: {
    inject: (name: string, factory: () => unknown) => unknown
    register: (spec: { name: string; key: string }, view: unknown) => unknown
  }
}

type SelectOption = { id: string; label: string; detail?: string }

type CommandUi = {
  decorate: (decoration: {
    name: string
    available: () => boolean
    ui: {
      kind: 'popupSelect'
      options: (session: { sessionId: string }, signal: AbortSignal) => Promise<SelectOption[]>
      onSelect: (option: SelectOption, session: { sessionId: string }) => Promise<void>
    }
  }) => () => void
}

interface Snapshot {
  servers?: Array<{
    name: string
    status?: string
    toolCount?: number
    disabled?: boolean
    hasUrl?: boolean
    oauth?: boolean
  }>
  presets?: Array<{ id: string; name: string; summary: string; configured?: boolean }>
}

export const name = 'dsh-mcp-adapter'
export const inject = ['slots', 'commandUi', 'remote']

export function apply(ctx: AnyCtx): void {
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'mcp' },
    McpToolRow as unknown as ReactNode,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'mcpScript' },
    McpToolRow as unknown as ReactNode,
  ))

  const command = ctx.get('commandUi') as CommandUi | undefined
  if (!command) return

  ctx.effect(() => command.decorate({
    name: 'mcp',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session, signal) => {
        const snapshot = await loadSnapshot(ctx, session.sessionId, signal)
        return buildOptions(snapshot)
      },
      onSelect: async (option, session) => {
        const line = lineFor(option.id)
        const result = await ctx.remote?.commands.execute(session.sessionId, line)
        if (!result?.ok) throw new Error(`mcp command failed: ${result?.error?.code}: ${result?.error?.message}`)
        if (result.value === undefined) throw new Error('the host offers no /mcp command')
        if (result.value.result?.kind === 'error') throw new Error(result.value.result.text ?? 'mcp command failed')
        if (option.id.startsWith('auth:')) {
          const url = result.value.result?.text?.match(/https?:\/\/\S+/)
          if (url) window.open(url[0], '_blank', 'noopener,noreferrer')
        }
      },
    },
  }), 'dsh-mcp-adapter: /mcp popup')
}

async function loadSnapshot(ctx: AnyCtx, sessionId: string, signal: AbortSignal): Promise<Snapshot> {
  if (signal.aborted) return {}
  const result = await ctx.remote?.commands.execute(sessionId, '/mcp json')
  const text = result?.ok ? result.value?.result?.text : undefined
  if (!text) return {}
  try {
    return JSON.parse(text) as Snapshot
  } catch {
    return {}
  }
}

function buildOptions(snapshot: Snapshot): SelectOption[] {
  const options: SelectOption[] = [
    { id: 'status', label: 'Status', detail: 'Servers, connection state, and cached tools' },
    { id: 'list', label: 'Config sources', detail: 'Where MCP configs were loaded from' },
    { id: 'setup', label: 'How to add a custom server', detail: '/mcp add name url=… or command=…' },
    { id: 'prompts', label: 'Prompts', detail: 'Cached MCP prompt slash commands' },
  ]
  for (const preset of snapshot.presets ?? []) {
    if (preset.configured) continue
    options.push({
      id: `add-preset:${preset.id}`,
      label: `Add ${preset.name}`,
      detail: preset.summary,
    })
  }
  for (const server of snapshot.servers ?? []) {
    const mark = server.disabled ? '○' : server.status === 'connected' ? '●' : '◐'
    if (server.disabled) {
      options.push({ id: `enable:${server.name}`, label: `${mark} Enable ${server.name}`, detail: 'Turn this server back on' })
    } else {
      options.push({
        id: `connect:${server.name}`,
        label: `${mark} Connect ${server.name}`,
        detail: `${server.status ?? 'idle'} · ${server.toolCount ?? 0} tools`,
      })
      if (server.oauth || server.hasUrl) {
        options.push({ id: `auth:${server.name}`, label: `Authorize ${server.name}`, detail: 'Start OAuth in the browser' })
      }
      options.push({ id: `disable:${server.name}`, label: `Disable ${server.name}`, detail: 'Keep config, stop connecting' })
    }
    options.push({ id: `remove:${server.name}`, label: `Remove ${server.name}`, detail: 'Delete from .mcp.json or disable' })
  }
  return options
}

function lineFor(id: string): string {
  const split = id.indexOf(':')
  if (split === -1) return `/mcp ${id}`
  return `/mcp ${id.slice(0, split)} ${id.slice(split + 1)}`
}
