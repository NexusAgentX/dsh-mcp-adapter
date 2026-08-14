import { logger } from './logger.js'
import type { McpServerManager } from './server-manager.js'
import type { ServerDefinition } from './types.js'
import { isServerDisabled } from './types.js'
import { formatTerminalError } from './utils.js'

export class McpLifecycleManager {
  private keepAliveServers = new Map<string, ServerDefinition>()
  private allServers = new Map<string, ServerDefinition>()
  private serverSettings = new Map<string, { idleTimeout?: number }>()
  private globalIdleTimeout = 10 * 60 * 1000
  private healthCheckInterval: NodeJS.Timeout | undefined
  private onReconnect: ((serverName: string) => void) | undefined
  private onIdleShutdown: ((serverName: string) => void) | undefined
  private activeHealthCheck: Promise<void> | undefined
  private shutdownPromise: Promise<void> | undefined
  private stopped = false

  constructor(private readonly manager: McpServerManager) {}

  setReconnectCallback(callback: (serverName: string) => void): void {
    this.onReconnect = callback
  }

  setIdleShutdownCallback(callback: (serverName: string) => void): void {
    this.onIdleShutdown = callback
  }

  markKeepAlive(name: string, definition: ServerDefinition): void {
    if (isServerDisabled(definition)) return
    this.keepAliveServers.set(name, definition)
  }

  registerServer(name: string, definition: ServerDefinition, settings?: { idleTimeout?: number }): void {
    if (isServerDisabled(definition)) return
    this.allServers.set(name, definition)
    if (settings?.idleTimeout !== undefined) this.serverSettings.set(name, settings)
  }

  setGlobalIdleTimeout(minutes: number): void {
    this.globalIdleTimeout = minutes * 60 * 1000
  }

  startHealthChecks(signal?: AbortSignal, intervalMs = 30_000): void {
    this.stopped = false
    if (signal?.aborted) {
      this.stopped = true
      return
    }
    const stop = () => {
      this.stopped = true
      if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
    signal?.addEventListener('abort', stop, { once: true })
    this.healthCheckInterval = setInterval(() => {
      if (this.stopped || signal?.aborted || this.activeHealthCheck) return
      const check = this.checkConnections(signal)
        .catch(error => logger.error(`health check failed: ${formatTerminalError(error)}`))
        .finally(() => {
          if (this.activeHealthCheck === check) this.activeHealthCheck = undefined
        })
      this.activeHealthCheck = check
    }, intervalMs)
    this.healthCheckInterval.unref()
  }

  async gracefulShutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.shutdownPromise = this.shutdownOnce()
    return this.shutdownPromise
  }

  private async shutdownOnce(): Promise<void> {
    this.stopped = true
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval)
    this.healthCheckInterval = undefined
    await this.activeHealthCheck
    this.activeHealthCheck = undefined
    this.onReconnect = undefined
    this.onIdleShutdown = undefined
    await this.manager.closeAll()
  }

  private async checkConnections(signal?: AbortSignal): Promise<void> {
    if (this.stopped || signal?.aborted) return
    for (const [name, definition] of this.keepAliveServers) {
      if (isServerDisabled(definition)) continue
      const connection = this.manager.getConnection(name)
      if (!connection || connection.status !== 'connected') {
        try {
          await this.manager.connect(name, definition, signal)
          if (this.stopped || signal?.aborted) return
          logger.debug(`reconnected ${name}`)
          this.onReconnect?.(name)
        } catch (error) {
          if (this.stopped || signal?.aborted) return
          logger.error(`failed to reconnect ${name}: ${formatTerminalError(error)}`)
        }
      }
    }

    for (const [name] of this.allServers) {
      if (this.keepAliveServers.has(name)) continue
      const timeout = this.getIdleTimeout(name)
      if (timeout > 0 && this.manager.isIdle(name, timeout)) {
        await this.manager.close(name)
        if (this.stopped || signal?.aborted) return
        this.onIdleShutdown?.(name)
      }
    }
  }

  private getIdleTimeout(name: string): number {
    const perServer = this.serverSettings.get(name)?.idleTimeout
    if (perServer !== undefined) return perServer * 60 * 1000
    return this.globalIdleTimeout
  }
}
