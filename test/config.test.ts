import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { loadMcpConfig, mergeServerMaps } from '../src/config.ts'

describe('config merge', () => {
  it('drops inherited auth when a higher layer changes the url', () => {
    const merged = mergeServerMaps(
      { docs: { url: 'https://old.example/mcp', headers: { Authorization: 'Bearer old' } } },
      { docs: { url: 'https://new.example/mcp' } },
    )
    assert.equal(merged.docs?.url, 'https://new.example/mcp')
    assert.equal(merged.docs?.headers, undefined)
  })

  it('keeps inherited auth when the url is unchanged', () => {
    const merged = mergeServerMaps(
      { docs: { url: 'https://same.example/mcp', headers: { Authorization: 'Bearer keep' } } },
      { docs: { lifecycle: 'lazy' } },
    )
    assert.equal(merged.docs?.headers?.Authorization, 'Bearer keep')
    assert.equal(merged.docs?.lifecycle, 'lazy')
  })

  it('loads project .mcp.json from cwd', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-mcp-config-'))
    writeFileSync(join(cwd, '.mcp.json'), JSON.stringify({
      mcpServers: {
        demo: { command: 'npx', args: ['-y', 'demo'] },
      },
      settings: { toolPrefix: 'mcp' },
    }))
    const config = loadMcpConfig(join(cwd, 'unused-global.json'), cwd)
    assert.equal(config.mcpServers.demo?.command, 'npx')
    assert.equal(config.settings?.toolPrefix, 'mcp')
  })

  it('lets the dsh project overlay disable a shared server', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-mcp-overlay-'))
    writeFileSync(join(cwd, '.mcp.json'), JSON.stringify({
      mcpServers: { demo: { command: 'npx', args: ['-y', 'demo'] } },
    }))
    mkdirSync(join(cwd, '.dsh'))
    writeFileSync(join(cwd, '.dsh', 'mcp.json'), JSON.stringify({
      mcpServers: { demo: { disabled: true } },
    }))
    const config = loadMcpConfig(join(cwd, 'unused-global.json'), cwd)
    assert.equal(config.mcpServers.demo?.disabled, true)
    assert.equal(config.mcpServers.demo?.command, 'npx')
  })
})
