import { resourceNameToToolName } from './resource-tools.js'
import type { McpResource, McpTool, ServerEntry, ToolMetadata, ToolPrefix } from './types.js'
import { formatToolName, getToolNameCandidates, isToolAllowed, resolveToolPrefix } from './types.js'

export function buildToolMetadata(
  tools: McpTool[],
  resources: McpResource[],
  definition: ServerEntry,
  serverName: string,
  prefix: ToolPrefix,
  configuredServers?: Record<string, ServerEntry>,
  knownMetadata?: Map<string, ToolMetadata[]>,
): ToolMetadata[] {
  const metadata: ToolMetadata[] = []
  const seenNames = new Set<string>()
  const effectivePrefix = resolveToolPrefix(definition, prefix)

  const getOtherCurrentCandidates = (toolName: string): Set<string> | undefined => {
    if (!configuredServers) return undefined
    const candidates = new Set<string>()
    const addCandidates = (originalName: string, candidateServerName: string, candidatePrefix: ToolPrefix) => {
      for (const candidate of getToolNameCandidates(originalName, candidateServerName, candidatePrefix, false)) {
        candidates.add(candidate)
      }
    }
    for (const tool of tools) {
      if (tool?.name) addCandidates(tool.name, serverName, effectivePrefix)
    }
    if (definition.exposeResources !== false) {
      for (const resource of resources) {
        if (resource?.name && resource?.uri) {
          addCandidates(`read_${resourceNameToToolName(resource.name)}`, serverName, effectivePrefix)
        }
      }
    }
    for (const [otherServerName, otherDefinition] of Object.entries(configuredServers)) {
      if (otherServerName === serverName) continue
      const knownTools = knownMetadata?.get(otherServerName)
      if (knownTools) {
        const otherPrefix = resolveToolPrefix(otherDefinition, prefix)
        for (const tool of knownTools) {
          candidates.add(tool.name)
          addCandidates(tool.originalName, otherServerName, otherPrefix)
        }
      }
    }
    for (const candidate of getToolNameCandidates(toolName, serverName, effectivePrefix, false)) candidates.delete(candidate)
    return candidates
  }

  for (const tool of tools) {
    if (!tool?.name) continue
    if (!isToolAllowed(tool.name, serverName, effectivePrefix, definition.includeTools, definition.excludeTools, getOtherCurrentCandidates(tool.name))) {
      continue
    }
    const name = formatToolName(tool.name, serverName, effectivePrefix)
    if (seenNames.has(name)) continue
    seenNames.add(name)
    metadata.push({
      name,
      originalName: tool.name,
      description: tool.description ?? tool.title ?? '',
      inputSchema: tool.inputSchema,
    })
  }

  if (definition.exposeResources !== false) {
    for (const resource of resources) {
      if (!resource?.name || !resource.uri) continue
      const originalName = `read_${resourceNameToToolName(resource.name)}`
      if (!isToolAllowed(originalName, serverName, effectivePrefix, definition.includeTools, definition.excludeTools, getOtherCurrentCandidates(originalName))) {
        continue
      }
      const name = formatToolName(originalName, serverName, effectivePrefix)
      if (seenNames.has(name)) continue
      seenNames.add(name)
      metadata.push({
        name,
        originalName,
        description: resource.description ?? `Read resource ${resource.uri}`,
        resourceUri: resource.uri,
      })
    }
  }

  return metadata
}

export function findToolByName(metadata: ToolMetadata[] | undefined, toolName: string): ToolMetadata | undefined {
  if (!metadata) return undefined
  const exact = metadata.find(tool => tool.name === toolName)
  if (exact) return exact
  const normalized = toolName.replace(/-/g, '_')
  return metadata.find(tool => tool.name.replace(/-/g, '_') === normalized)
}
