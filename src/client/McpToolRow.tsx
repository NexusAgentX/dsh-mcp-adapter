import { useMemo, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import {
  IconApiOutline14,
  IconChevronDownOutline14,
  IconInspectOutline12,
  SearchBlock,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'

interface Block {
  callId?: string
  argsRaw?: string
  call?: { argsRaw?: string } | null
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  meta?: unknown
  kind?: string
  resultView?: {
    card?: string
    shape?: string
    title?: string
    files?: Array<{ path: string; matches: Array<{ lineNumber: number; line: string }> }>
    paths?: string[]
    truncated?: boolean
    total?: number
  } | null
}

interface Props {
  toolName: string
  block: Block
  inspect?: () => void
}

type RowState = 'running' | 'ok' | 'error'

interface MatchRow {
  name?: string
  server?: string
  description?: string
}

interface ServerRow {
  name?: string
  status?: string
  toolCount?: number
}

function argsOf(block: Block): Record<string, unknown> {
  const raw = block.kind === 'tool-result' ? block.call?.argsRaw : block.argsRaw
  try {
    const parsed = JSON.parse(raw ?? '') as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function textOf(block: Block): string {
  return (block.content ?? []).map(item => item.type === 'text' ? item.text ?? '' : '').filter(Boolean).join('\n')
}

function metaOf(block: Block): Record<string, unknown> {
  return block.meta && typeof block.meta === 'object' && !Array.isArray(block.meta)
    ? block.meta as Record<string, unknown>
    : {}
}

function titleOf(args: Record<string, unknown>, meta: Record<string, unknown>): string {
  if (args.action === 'auth-start') return 'MCP Auth'
  if (args.action === 'auth-complete') return 'MCP Auth'
  if (typeof args.prompt === 'string') return 'MCP Prompt'
  if (typeof args.tool === 'string') return 'MCP'
  if (args.search !== undefined) return 'MCP Search'
  if (typeof args.describe === 'string') return 'MCP Describe'
  if (typeof args.connect === 'string') return 'MCP Connect'
  if (meta.mode === 'status') return 'MCP Status'
  return 'MCP'
}

function summaryOf(args: Record<string, unknown>, meta: Record<string, unknown>, text: string, error: boolean): string {
  if (error) return firstLine(text) || 'Failed'
  if (typeof args.tool === 'string') return args.tool
  if (args.search !== undefined) {
    const count = typeof meta.count === 'number' ? meta.count : Array.isArray(meta.matches) ? meta.matches.length : 0
    return `${String(args.search)} · ${count}`
  }
  if (typeof args.connect === 'string') return args.connect
  if (typeof args.describe === 'string') return args.describe
  if (typeof args.server === 'string') return args.server
  if (meta.mode === 'status' && Array.isArray(meta.servers)) return `${meta.servers.length} servers`
  return firstLine(text) || 'MCP'
}

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return (newline === -1 ? text : text.slice(0, newline)).trim()
}

function serverDot(status: string | undefined): 'done' | 'warning' | 'ongoing' | 'error' {
  switch (status) {
    case 'connected': return 'done'
    case 'connecting': return 'ongoing'
    case 'needs-auth': return 'warning'
    case 'failed': return 'error'
    default: return 'warning'
  }
}

function searchProps(block: Block, meta: Record<string, unknown>) {
  const view = block.resultView
  if (view?.card === 'search' && view.shape === 'matches' && view.files) {
    return {
      kind: 'matches' as const,
      files: view.files,
      truncated: Boolean(view.truncated),
      total: view.total ?? view.files.reduce((sum, file) => sum + file.matches.length, 0),
      maxLines: 8,
    }
  }
  const matches = Array.isArray(meta.matches) ? meta.matches as MatchRow[] : []
  if (matches.length === 0) return null
  const files = new Map<string, Array<{ lineNumber: number; line: string }>>()
  for (const match of matches) {
    const server = match.server || 'mcp'
    const rows = files.get(server) ?? []
    rows.push({
      lineNumber: rows.length + 1,
      line: match.description ? `${match.name ?? ''}  ${match.description}` : String(match.name ?? ''),
    })
    files.set(server, rows)
  }
  return {
    kind: 'matches' as const,
    files: [...files.entries()].map(([path, rows]) => ({ path, matches: rows })),
    truncated: Boolean(meta.hasMore),
    total: typeof meta.count === 'number' ? meta.count : matches.length,
    maxLines: 8,
  }
}

export function McpToolRow({ block, inspect }: Props): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const args = useMemo(() => argsOf(block), [block])
  const meta = useMemo(() => metaOf(block), [block])
  const text = useMemo(() => textOf(block), [block])
  const running = block.kind !== 'tool-result'
  const state: RowState = running ? 'running' : block.isError ? 'error' : 'ok'
  const title = titleOf(args, meta)
  const summary = summaryOf(args, meta, text, state === 'error')
  const authUrl = typeof meta.authorizationUrl === 'string' ? meta.authorizationUrl : undefined
  const servers = Array.isArray(meta.servers) ? meta.servers as ServerRow[] : []
  const search = searchProps(block, meta)
  const expandable = Boolean(text || search || servers.length || authUrl)

  const toggle = (): void => {
    if (expandable) setExpanded(value => !value)
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggle()
  }

  const leading = leadingIcon(state, expanded, expandable)
  const open = expanded && expandable

  return (
    <div data-dsh-mcp data-state={state}>
      <div
        className="dsh-mcp-row"
        data-expandable={expandable || undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className="dsh-mcp-leading">{leading}</span>
        <span className="dsh-mcp-title">{title}</span>
        <span className="dsh-mcp-sep" aria-hidden />
        <span className="dsh-mcp-summary" data-error={state === 'error' || undefined}>{summary}</span>
      </div>
      {authUrl ? (
        <a className="dsh-mcp-auth" href={authUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>
          Open authorization
        </a>
      ) : null}
      {open && search ? <SearchBlock {...search} /> : null}
      {open && servers.length > 0 ? (
        <div className="dsh-mcp-card">
          <div className="dsh-mcp-card-head">Servers</div>
          <div className="dsh-mcp-servers">
            {servers.map(server => (
              <div className="dsh-mcp-server" key={server.name}>
                <StateDot state={serverDot(server.status)} />
                <strong>{server.name}</strong>
                <span>{server.status ?? 'idle'} · {server.toolCount ?? 0} tools</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {open && text && !search ? (
        <div className="dsh-mcp-card">
          <div className="dsh-mcp-card-head">Output</div>
          <pre className="dsh-mcp-pre" data-error={state === 'error' || undefined}>{linkify(text)}</pre>
        </div>
      ) : null}
      {inspect ? (
        <button type="button" className="dsh-mcp-inspect" onClick={event => { event.stopPropagation(); inspect() }}>
          <IconInspectOutline12 />
          Inspect
        </button>
      ) : null}
    </div>
  )
}

function leadingIcon(state: RowState, open: boolean, expandable: boolean): ReactNode {
  const rest = state === 'running'
    ? <StateDot state="ongoing" />
    : state === 'error'
      ? <StateDot state="error" />
      : <IconApiOutline14 size={14} />
  if (open) return <IconChevronDownOutline14 className="dsh-mcp-chevron" />
  if (!expandable) return rest
  return (
    <>
      <span className="dsh-mcp-icon-idle">{rest}</span>
      <IconChevronDownOutline14 className="dsh-mcp-chevron dsh-mcp-chevron-hover" />
    </>
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
    parts.push(<a key={`u${index++}`} href={href} target="_blank" rel="noreferrer">{href}</a>)
    last = match.index + href.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
