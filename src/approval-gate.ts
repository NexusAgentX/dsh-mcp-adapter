import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { resolveDirectTools } from './direct-tools.js'
import type { McpRuntimeState } from './state.js'
import { findToolByName } from './tool-metadata.js'
import { isSessionApproved, isToolCallApprovalRequired } from './tool-approval.js'

/** Ask the Web UI (or any approval answerer) before gated MCP calls. */
export function registerApprovalGate(ctx: Context, state: McpRuntimeState): void {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const target = resolveApprovalTarget(state, exec.name, exec.arguments)
    if (!target) return next()
    if (isSessionApproved(state, target.serverName, target.originalName)) return next()
    if (!isToolCallApprovalRequired(state.config, target.serverName, target)) return next()
    return {
      kind: 'ask',
      reason: `MCP tool "${target.name}" on server "${target.serverName}" requires approval.`,
    }
  })
}

export function resolveApprovalTarget(
  state: McpRuntimeState,
  toolName: string,
  rawArgs: unknown,
): { serverName: string; originalName: string; name: string } | undefined {
  if (toolName === 'mcp' || toolName === 'mcpScript') {
    if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return undefined
    const args = rawArgs as { tool?: unknown; server?: unknown }
    if (typeof args.tool !== 'string' || args.tool.length === 0) return undefined
    const server = typeof args.server === 'string' ? args.server : undefined
    if (server) {
      const found = findToolByName(state.toolMetadata.get(server), args.tool)
      if (!found) return undefined
      return { serverName: server, originalName: found.originalName, name: found.name }
    }
    for (const [serverName, metadata] of state.toolMetadata) {
      const found = findToolByName(metadata, args.tool)
      if (found) return { serverName, originalName: found.originalName, name: found.name }
    }
    return undefined
  }

  for (const spec of resolveDirectTools(state)) {
    if (spec.prefixedName === toolName) {
      return { serverName: spec.serverName, originalName: spec.originalName, name: spec.prefixedName }
    }
  }
  return undefined
}
