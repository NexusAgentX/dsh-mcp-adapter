import { McpToolRow } from './McpToolRow.tsx'
import { MCP_ROW_CSS } from './mcp-row.css.ts'

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

type SelectOption = {
  id: string
  label: string
  detail?: string
  confirmation?: {
    title: string
    description: string
    acknowledgeLabel: string
    cancelLabel: string
    confirmLabel: string
  }
}

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

const STYLE_ID = 'dsh-mcp-adapter-style'

export const name = 'dsh-mcp-adapter'
export const inject = ['slots', 'commandUi', 'remote']

export function apply(ctx: AnyCtx): void {
  ctx.effect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.setAttribute('data-plugin', 'dsh-mcp-adapter')
      style.textContent = MCP_ROW_CSS
      document.head.appendChild(style)
    }
    return () => {
      document.getElementById(STYLE_ID)?.remove()
    }
  }, 'dsh-mcp-adapter: styles')

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'mcp' },
    McpToolRow,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'mcpScript' },
    McpToolRow,
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
    { id: 'status', label: 'Status', detail: 'Connection state and cached tools' },
    { id: 'list', label: 'Sources', detail: 'Config files this session loaded' },
    { id: 'prompts', label: 'Prompts', detail: 'Cached MCP slash commands' },
  ]
  for (const preset of snapshot.presets ?? []) {
    if (preset.configured) continue
    options.push({
      id: `add-preset:${preset.id}`,
      label: preset.name,
      detail: `Add · ${preset.summary}`,
    })
  }
  for (const server of snapshot.servers ?? []) {
    const status = server.disabled ? 'disabled' : server.status ?? 'idle'
    const count = `${server.toolCount ?? 0} tools`
    if (server.disabled) {
      options.push({
        id: `enable:${server.name}`,
        label: server.name,
        detail: `Enable · ${status}`,
      })
    } else if (server.status === 'needs-auth' || ((server.oauth || server.hasUrl) && server.status === 'not-connected')) {
      options.push({
        id: `auth:${server.name}`,
        label: server.name,
        detail: `Authorize · ${status}`,
      })
      options.push({
        id: `connect:${server.name}`,
        label: server.name,
        detail: `Connect · ${count}`,
      })
    } else {
      options.push({
        id: `connect:${server.name}`,
        label: server.name,
        detail: server.status === 'connected' ? `Connected · ${count}` : `Connect · ${status} · ${count}`,
      })
    }
    if (!server.disabled) {
      options.push({
        id: `disable:${server.name}`,
        label: server.name,
        detail: 'Disable',
        confirmation: confirmDialog(`Disable ${server.name}?`, 'The server stays in config but will not connect.'),
      })
    }
    options.push({
      id: `remove:${server.name}`,
      label: server.name,
      detail: 'Remove',
      confirmation: confirmDialog(`Remove ${server.name}?`, 'Deletes it from project .mcp.json, or disables it if it came from another file.'),
    })
  }
  return options
}

function confirmDialog(title: string, description: string): SelectOption['confirmation'] {
  return {
    title,
    description,
    acknowledgeLabel: 'I understand',
    cancelLabel: 'Cancel',
    confirmLabel: 'Continue',
  }
}

function lineFor(id: string): string {
  const split = id.indexOf(':')
  if (split === -1) return `/mcp ${id}`
  return `/mcp ${id.slice(0, split)} ${id.slice(split + 1)}`
}
