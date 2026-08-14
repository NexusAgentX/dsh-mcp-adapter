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

  debug(message: string): void {
    if (LEVEL_PRIORITY.debug >= LEVEL_PRIORITY[this.minLevel]) console.debug(`[dsh-mcp] ${message}`)
  }

  info(message: string): void {
    if (LEVEL_PRIORITY.info >= LEVEL_PRIORITY[this.minLevel]) console.info(`[dsh-mcp] ${message}`)
  }

  warn(message: string): void {
    if (LEVEL_PRIORITY.warn >= LEVEL_PRIORITY[this.minLevel]) console.warn(`[dsh-mcp] ${message}`)
  }

  error(message: string, error?: unknown): void {
    if (LEVEL_PRIORITY.error < LEVEL_PRIORITY[this.minLevel]) return
    if (error !== undefined) console.error(`[dsh-mcp] ${message}`, error)
    else console.error(`[dsh-mcp] ${message}`)
  }
}

export const logger = new Logger()
