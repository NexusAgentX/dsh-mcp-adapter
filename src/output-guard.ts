import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpSettings } from './types.js'

export const DEFAULT_MCP_OUTPUT_MAX_BYTES = 50 * 1024
export const DEFAULT_MCP_OUTPUT_MAX_LINES = 2000

export function resolveOutputGuard(settings?: McpSettings): { enabled: boolean; maxBytes: number; maxLines: number } {
  const configured = settings?.outputGuard
  const tuning = typeof configured === 'object' && configured !== null ? configured : undefined
  const env = process.env.MCP_OUTPUT_GUARD
  const enabled = env === '0' || env === 'false' ? false : configured !== false
  return {
    enabled,
    maxBytes: positiveInt(tuning?.maxBytes) ?? DEFAULT_MCP_OUTPUT_MAX_BYTES,
    maxLines: positiveInt(tuning?.maxLines) ?? DEFAULT_MCP_OUTPUT_MAX_LINES,
  }
}

export async function guardText(text: string, settings?: McpSettings): Promise<{ text: string; truncated?: Record<string, unknown> }> {
  const options = resolveOutputGuard(settings)
  if (!options.enabled) return { text }
  const lines = text.split('\n')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= options.maxBytes && lines.length <= options.maxLines) return { text }

  const clippedLines = lines.slice(0, options.maxLines)
  let clipped = clippedLines.join('\n')
  while (Buffer.byteLength(clipped, 'utf8') > options.maxBytes && clipped.length > 0) {
    clipped = clipped.slice(0, Math.floor(clipped.length * 0.9))
  }
  let fullOutputPath: string | undefined
  try {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-'))
    fullOutputPath = join(dir, 'output.txt')
    await writeFile(fullOutputPath, text, 'utf8')
  } catch {
    fullOutputPath = undefined
  }
  const suffix = fullOutputPath
    ? `\n\n[truncated — full output: ${fullOutputPath}]`
    : '\n\n[truncated]'
  return {
    text: `${clipped}${suffix}`,
    truncated: {
      originalBytes: bytes,
      originalLines: lines.length,
      returnedBytes: Buffer.byteLength(clipped, 'utf8'),
      returnedLines: clipped.split('\n').length,
      fullOutputPath,
    },
  }
}

function positiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}
