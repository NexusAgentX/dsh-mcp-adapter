import { createElement, type ReactNode } from 'react'
import { McpToolRow } from './McpToolRow.ts'

type AnyCtx = {
  get: (name: string) => unknown
  sessions?: { binding?: (id: string) => { session?: { command: (line: string) => Promise<{ ok: boolean; error?: { code: string; message: string }; value?: { matched?: boolean } }> } } | undefined }
  effect: (fn: () => () => void, name?: string) => unknown
  slots: {
    inject: (name: string, factory: () => unknown) => unknown
    register: (spec: { name: string; key: string }, view: unknown) => unknown
  }
}

type CommandUi = {
  decorate: (decoration: {
    name: string
    available: () => boolean
    ui: {
      kind: 'popupSelect'
      options: () => Promise<Array<{ id: string; label: string; detail?: string }>>
      onSelect: (option: { id: string }, session: { sessionId: string }) => Promise<void>
    }
  }) => () => void
}

export const name = 'dsh-mcp-adapter'
export const inject = ['slots', 'commandUi', 'sessions']

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
      options: async () => [
        { id: 'status', label: 'Status', detail: 'Servers, connection state, and cached tools' },
        { id: 'list', label: 'Config sources', detail: 'Where MCP configs were loaded from' },
        { id: 'setup', label: 'Setup', detail: 'Discover host configs and curated remotes' },
        { id: 'prompts', label: 'Prompts', detail: 'Cached MCP prompt slash commands' },
      ],
      onSelect: async (option, session) => {
        const live = ctx.sessions?.binding?.(session.sessionId)?.session
        if (!live) throw new Error('this session is not materialized yet')
        const result = await live.command(`/mcp ${option.id}`)
        if (!result.ok) throw new Error(`mcp command failed: ${result.error?.code}: ${result.error?.message}`)
        if (result.value && result.value.matched === false) throw new Error('the host offers no /mcp command')
      },
    },
  }), 'dsh-mcp-adapter: /mcp popup')
}
