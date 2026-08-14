export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private minLevel: LogLevel = process.env.DSH_MCP_DEBUG === '1' || process.env.DSH_MCP_DEBUG === 'true'
    ? 'debug'
    : 'info'

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  debug(message: string, context?: unknown): void {
    if (LEVEL_PRIORITY.debug >= LEVEL_PRIORITY[this.minLevel]) console.debug(`[dsh-mcp] ${message}`, context ?? '')
  }

  info(message: string, context?: unknown): void {
    if (LEVEL_PRIORITY.info >= LEVEL_PRIORITY[this.minLevel]) console.info(`[dsh-mcp] ${message}`, context ?? '')
  }

  warn(message: string, context?: unknown): void {
    if (LEVEL_PRIORITY.warn >= LEVEL_PRIORITY[this.minLevel]) console.warn(`[dsh-mcp] ${message}`, context ?? '')
  }

  error(message: string, error?: unknown, context?: unknown): void {
    if (LEVEL_PRIORITY.error < LEVEL_PRIORITY[this.minLevel]) return
    console.error(`[dsh-mcp] ${message}`, error ?? '', context ?? '')
  }
}

export const logger = new Logger()
