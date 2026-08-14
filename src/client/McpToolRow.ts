import { createElement, useMemo, useState, type ReactElement } from 'react'

interface Block {
  callId?: string
  argsRaw?: string
  call?: { argsRaw?: string } | null
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  meta?: unknown
  kind?: string
}

interface Props {
  toolName: string
  block: Block
  inspect?: () => void
}

interface MatchRow {
  name?: string
  server?: string
  description?: string
}

interface ServerRow {
  name?: string
  status?: string
  toolCount?: number
  disabled?: boolean
  lifecycle?: string
}

function argsOf(block: Block): Record<string, unknown> {
  const raw = ('kind' in block && block.kind === 'tool-result' ? block.call?.argsRaw : block.argsRaw) ?? ''
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function textOf(block: Block): string {
  if (!block.content) return ''
  return block.content.map(item => item.type === 'text' ? item.text ?? '' : '').filter(Boolean).join('\n')
}

function metaOf(block: Block): Record<string, unknown> {
  return block.meta && typeof block.meta === 'object' && !Array.isArray(block.meta)
    ? block.meta as Record<string, unknown>
    : {}
}

function titleOf(args: Record<string, unknown>, meta: Record<string, unknown>): string {
  if (args.action === 'auth-start') return `MCP auth ${String(args.server ?? '')}`.trim()
  if (args.action === 'auth-complete') return 'MCP auth complete'
  if (typeof args.prompt === 'string') return `MCP prompt ${args.prompt}`
  if (typeof args.tool === 'string') return `MCP ${args.tool}`
  if (args.search !== undefined) return `MCP search ${String(args.search)}`
  if (typeof args.describe === 'string') return `MCP describe ${args.describe}`
  if (typeof args.connect === 'string') return `MCP connect ${args.connect}`
  if (meta.mode === 'status') return 'MCP status'
  return 'MCP'
}

function statusColor(status: string | undefined): string {
  switch (status) {
    case 'connected': return '#3d9a5f'
    case 'cached': return '#6b8cce'
    case 'needs-auth': return '#d4a017'
    case 'failed': return '#c44'
    case 'disabled': return '#888'
    default: return '#999'
  }
}

export function McpToolRow({ block, inspect }: Props): ReactElement {
  const [open, setOpen] = useState(false)
  const args = useMemo(() => argsOf(block), [block])
  const meta = useMemo(() => metaOf(block), [block])
  const text = useMemo(() => textOf(block), [block])
  const running = !('kind' in block) || block.kind !== 'tool-result'
  const title = titleOf(args, meta)
  const authUrl = typeof meta.authorizationUrl === 'string' ? meta.authorizationUrl : undefined
  const matches = Array.isArray(meta.matches) ? meta.matches as MatchRow[] : []
  const servers = Array.isArray(meta.servers) ? meta.servers as ServerRow[] : []

  return createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        font: '13px/1.45 ui-sans-serif, system-ui, sans-serif',
      },
    },
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => setOpen(value => !value),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: 0,
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          textAlign: 'left',
        },
      },
      createElement('span', {
        style: {
          width: 8,
          height: 8,
          borderRadius: 99,
          background: running ? '#6b8cce' : block.isError ? '#c44' : '#3d9a5f',
          flex: '0 0 auto',
        },
      }),
      createElement('strong', { style: { fontWeight: 600 } }, title),
      inspect
        ? createElement('span', {
          onClick: (event: { stopPropagation: () => void }) => {
            event.stopPropagation()
            inspect()
          },
          style: { marginLeft: 'auto', opacity: 0.6, fontSize: 12 },
        }, 'inspect')
        : null,
    ),
    authUrl
      ? createElement(
        'a',
        {
          href: authUrl,
          target: '_blank',
          rel: 'noreferrer',
          style: {
            alignSelf: 'flex-start',
            padding: '4px 10px',
            borderRadius: 6,
            background: '#1f6feb',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
          },
        },
        'Open authorization',
      )
      : null,
    servers.length > 0
      ? createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        ...servers.map(server => createElement(
          'div',
          { key: server.name, style: { display: 'flex', gap: 8, alignItems: 'center' } },
          createElement('span', {
            style: { width: 8, height: 8, borderRadius: 99, background: statusColor(server.status) },
          }),
          createElement('span', null, server.name),
          createElement('span', { style: { opacity: 0.65 } }, `${server.status ?? 'unknown'} · ${server.toolCount ?? 0} tools`),
        )),
      )
      : null,
    matches.length > 0
      ? createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        ...matches.map(match => createElement(
          'div',
          { key: `${match.server}:${match.name}` },
          createElement('code', { style: { fontSize: 12 } }, match.name),
          match.description
            ? createElement('div', { style: { opacity: 0.7, fontSize: 12 } }, match.description)
            : null,
        )),
      )
      : null,
    open && text
      ? createElement('pre', {
        style: {
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
          opacity: 0.85,
        },
      }, linkify(text))
      : null,
  )
}

function linkify(text: string): Array<string | ReactElement> {
  const parts: Array<string | ReactElement> = []
  const pattern = /https?:\/\/[^\s)]+/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const href = match[0]
    parts.push(createElement('a', {
      key: `u${index++}`,
      href,
      target: '_blank',
      rel: 'noreferrer',
    }, href))
    last = match.index + href.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
