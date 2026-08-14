import type { McpRuntimeState } from './state.js'
import type { DirectToolSpec, ServerEntry, ToolMetadata, ToolPrefix } from './types.js'
import { getToolNameCandidates, isServerDisabled, resolveToolPrefix } from './types.js'

export function resolveDirectTools(state: McpRuntimeState): DirectToolSpec[] {
  const global = state.config.settings?.directTools === true
  const specs: DirectToolSpec[] = []
  const prefix = state.config.settings?.toolPrefix ?? 'server'
  for (const [serverName, definition] of Object.entries(state.config.mcpServers)) {
    if (isServerDisabled(definition)) continue
    const selector = definition.directTools
    if (selector === false) continue
    if (selector === undefined && !global) continue
    const metadata = state.toolMetadata.get(serverName) ?? []
    for (const tool of metadata) {
      if (!isSelectedDirectTool(tool, serverName, definition, selector, prefix)) continue
      specs.push({
        serverName,
        originalName: tool.originalName,
        prefixedName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        resourceUri: tool.resourceUri,
      })
    }
  }
  return specs
}

function isSelectedDirectTool(
  tool: ToolMetadata,
  serverName: string,
  definition: ServerEntry,
  selector: boolean | string[] | undefined,
  prefix: ToolPrefix,
): boolean {
  if (selector === true || selector === undefined) return true
  if (!Array.isArray(selector) || selector.length === 0) return false
  const candidates = getToolNameCandidates(tool.originalName, serverName, resolveToolPrefix(definition, prefix))
  return selector.some(pattern => candidates.has(pattern) || pattern === tool.name || pattern === tool.originalName)
}
