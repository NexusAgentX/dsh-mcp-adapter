import { dispatchProxy } from './proxy.js'
import type { McpRuntimeState } from './state.js'
import { guardText } from './output-guard.js'
import { parseJsonObjectArgs } from './utils.js'

export async function runMcpScript(
  state: McpRuntimeState,
  code: string,
  timeoutMs = 30_000,
  signal?: AbortSignal,
): Promise<{ text: string; details: Record<string, unknown> }> {
  const calls: Array<Record<string, unknown>> = []
  const emitted: unknown[] = []
  const logs: string[] = []
  const tools = {
    search: (params: { query: string; server?: string; limit?: number; offset?: number }) =>
      timed('search', params.query, () => dispatchProxy(state, { search: params.query, server: params.server, limit: params.limit, offset: params.offset }, signal)),
    describe: (params: { path: string }) =>
      timed('describe', params.path, () => dispatchProxy(state, { describe: params.path }, signal)),
    call: (path: string, args?: unknown) =>
      timed('call', path, () => dispatchProxy(state, { tool: path, args: args === undefined ? undefined : parseJsonObjectArgs(args) }, signal)),
  }

  async function timed(op: string, path: string, fn: () => Promise<{ text: string; details: Record<string, unknown> }>) {
    const started = Date.now()
    try {
      const result = await fn()
      calls.push({ op, path, ok: !result.details.error, durationMs: Date.now() - started })
      return result.details.error
        ? { ok: false, error: { code: result.details.error, message: result.text } }
        : { ok: true, data: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      calls.push({ op, path, ok: false, durationMs: Date.now() - started, message })
      return { ok: false, error: { code: 'script_call_failed', message } }
    }
  }

  const sandbox = {
    tools,
    emit: (value: unknown) => {
      emitted.push(value)
    },
    console: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    },
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
  const fn = new AsyncFunction('tools', 'emit', 'console', `"use strict";\n${code}`)
  const abortError = new Error('mcpScript timed out')
  const timer = setTimeout(() => {
    // Cooperative timeout: the function may still run until the next await.
  }, timeoutMs)
  try {
    const raced = await Promise.race([
      fn(sandbox.tools, sandbox.emit, sandbox.console),
      new Promise((_, reject) => {
        const onAbort = () => reject(signal?.reason instanceof Error ? signal.reason : abortError)
        const timeout = setTimeout(onAbort, timeoutMs)
        signal?.addEventListener('abort', onAbort, { once: true })
        timeout.unref?.()
      }),
    ])
    const payload = {
      result: raced,
      emitted,
      logs,
      calls,
    }
    const text = JSON.stringify(payload, null, 2)
    const guarded = await guardText(text, state.config.settings)
    return { text: guarded.text, details: { mode: 'script', calls, ...(guarded.truncated ? { truncated: guarded.truncated } : {}) } }
  } finally {
    clearTimeout(timer)
  }
}
