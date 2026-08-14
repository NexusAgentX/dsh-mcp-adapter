import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import type { ServerEntry } from './types.js'

export function interpolateEnvVars(value: string): string {
  return value
    .replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
    .replace(/\$env:(\w+)/g, (_, name) => process.env[name] ?? '')
    .replace(/\{env:(\w+)\}/g, (_, name) => process.env[name] ?? '')
}

export function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function interpolateEnvRecord(values: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!values) return undefined
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, interpolateEnvVars(value)]))
}

const COMMAND_SECRET_TIMEOUT_MS = 10_000
const COMMAND_SECRET_MAX_OUTPUT_BYTES = 1024 * 1024

export function resolveCommandSecret(value: string, context: string): string
export function resolveCommandSecret(value: undefined, context: string): undefined
export function resolveCommandSecret(value: string | undefined, context: string): string | undefined
export function resolveCommandSecret(value: string | undefined, context: string): string | undefined {
  if (value === undefined) return undefined
  if (value.startsWith('!!')) return interpolateEnvVars(value.slice(1))
  if (!value.startsWith('!')) return interpolateEnvVars(value)

  const result = spawnSync(value.slice(1), {
    shell: true,
    encoding: 'utf8',
    timeout: COMMAND_SECRET_TIMEOUT_MS,
    maxBuffer: COMMAND_SECRET_MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    const reason = code === 'ETIMEDOUT'
      ? 'command timed out after 10 seconds'
      : code === 'ENOBUFS'
        ? 'command output exceeded 1 MiB'
        : 'command failed to start'
    throw new Error(`Failed to resolve ${context}: ${reason}`)
  }
  if (result.status !== 0) {
    throw new Error(`Failed to resolve ${context}: command exited with code ${result.status ?? 'unknown'}`)
  }
  const resolved = result.stdout.trim()
  if (!resolved) throw new Error(`Failed to resolve ${context}: command returned empty output`)
  return resolved
}

export function resolveCommandSecretsRecord(
  values: Record<string, string> | undefined,
  context: (key: string) => string,
): Record<string, string> | undefined {
  if (!values) return undefined
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    resolveCommandSecret(value, context(key)),
  ]))
}

export function resolveConfigPath(value: string | undefined, cwd = process.cwd()): string | undefined {
  if (!value) return undefined
  const expanded = interpolateEnvVars(value)
  if (expanded === '~') return homedir()
  if (expanded.startsWith('~/')) return resolve(homedir(), expanded.slice(2))
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded)
}

export function resolveServerUrl(definition: ServerEntry): string | undefined {
  return definition.url ? interpolateEnvVars(definition.url) : undefined
}

export function resolveBearerToken(definition: ServerEntry): string | undefined {
  if (definition.bearerToken) return interpolateEnvVars(definition.bearerToken)
  if (definition.bearerTokenEnv) return process.env[definition.bearerTokenEnv]
  return undefined
}

export function resolveHttpHeaders(definition: ServerEntry): Record<string, string> {
  const headers = interpolateEnvRecord(definition.headers) ?? {}
  const token = resolveBearerToken(definition)
  if (token && !Object.keys(headers).some(key => key.toLowerCase() === 'authorization')) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export function formatTerminalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function truncateAtWord(value: string | undefined, max: number): string {
  if (!value) return ''
  if (value.length <= max) return value
  const slice = value.slice(0, max)
  const broken = slice.lastIndexOf(' ')
  return `${(broken > max / 2 ? slice.slice(0, broken) : slice).trimEnd()}…`
}

export function parseJsonObjectArgs(args: unknown): Record<string, unknown> | undefined {
  if (args === undefined || args === '') return undefined
  let value: unknown = args
  if (typeof args === 'string') {
    try {
      value = JSON.parse(args)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid args JSON: ${error.message}`, { cause: error })
      }
      throw error
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const gotType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
    throw new Error(`Invalid args: expected a JSON object, got ${gotType}`)
  }
  return value as Record<string, unknown>
}
