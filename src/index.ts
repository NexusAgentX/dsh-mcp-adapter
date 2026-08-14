export const name = 'dsh-mcp-adapter'
export { apply, Config } from './plugin.js'
export type { Config as PluginConfig } from './plugin.js'

export { loadMcpConfig, cloneMcpConfig, discoverConfig } from './config.js'
export { createRuntime, startRuntime, stopRuntime } from './runtime.js'
export { dispatchProxy } from './proxy.js'
export { formatToolName, resolveServerFromToolName, isServerDisabled } from './types.js'
export { getMcpOAuthTokensForUrl, updateMcpOAuthTokensForUrl } from './oauth.js'

export type {
  McpConfig,
  McpSettings,
  ServerEntry,
  ToolMetadata,
  ProxyResult,
} from './types.js'
