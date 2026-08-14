import type { McpConfig, ToolMetadata } from './types.js'
import { getToolNameCandidates, matchesToolPattern, resolveToolPrefix } from './types.js'
import type { McpRuntimeState } from './state.js'

export function isToolCallApprovalRequired(
  config: McpConfig,
  serverName: string,
  toolMeta: Pick<ToolMetadata, 'originalName'>,
): boolean {
  const definition = config.mcpServers[serverName]
  const approval = definition?.approveTools !== undefined ? definition.approveTools : config.settings?.approveTools
  if (approval === true) return true
  if (!Array.isArray(approval) || approval.length === 0) return false
  const prefix = resolveToolPrefix(definition, config.settings?.toolPrefix)
  const candidates = getToolNameCandidates(toolMeta.originalName, serverName, prefix)
  return matchesToolPattern(candidates, approval)
}

export function isSessionApproved(state: McpRuntimeState, serverName: string, originalName: string): boolean {
  return state.approvedToolCalls.has(`${serverName}::${originalName}`)
}

export function rememberSessionApproval(state: McpRuntimeState, serverName: string, originalName: string): void {
  state.approvedToolCalls.set(`${serverName}::${originalName}`, true)
}
