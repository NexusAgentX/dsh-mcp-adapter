import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** DeepSeek Harness home: `$DSH_HOME` or `~/.dsh`. */
export function getHarnessHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (!configured) return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (configured.startsWith('~/')) return resolve(homedir(), configured.slice(2))
  return resolve(configured)
}

export function getHarnessPath(...segments: string[]): string {
  return join(getHarnessHome(), ...segments)
}
