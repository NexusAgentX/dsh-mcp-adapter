import type { AuthStorageOptions } from './mcp-auth.js'
import type { McpOAuthRuntime } from './mcp-auth-flow.js'
import type { McpLifecycleManager } from './lifecycle.js'
import type { McpServerManager } from './server-manager.js'
import type { McpConfig, PromptMetadata, ToolMetadata } from './types.js'

export interface McpRuntimeState {
  manager: McpServerManager
  lifecycle: McpLifecycleManager
  config: McpConfig
  programmaticConfig: boolean
  cwd: string
  toolMetadata: Map<string, ToolMetadata[]>
  promptMetadata: Map<string, PromptMetadata[]>
  resourceCounts: Map<string, number>
  serverInstructions: Map<string, string>
  failureTracker: Map<string, number>
  failureMessages: Map<string, string>
  approvedToolCalls: Map<string, true>
  oauthRuntime: McpOAuthRuntime
  authStorageOptions: AuthStorageOptions
  stopped: boolean
}
