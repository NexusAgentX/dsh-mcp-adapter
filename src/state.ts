import type { McpLifecycleManager } from './lifecycle.js'
import type { McpServerManager } from './server-manager.js'
import type { McpConfig, ToolMetadata } from './types.js'

export interface McpRuntimeState {
  manager: McpServerManager
  lifecycle: McpLifecycleManager
  config: McpConfig
  programmaticConfig: boolean
  cwd: string
  toolMetadata: Map<string, ToolMetadata[]>
  resourceCounts: Map<string, number>
  serverInstructions: Map<string, string>
  failureTracker: Map<string, number>
  failureMessages: Map<string, string>
  stopped: boolean
}
