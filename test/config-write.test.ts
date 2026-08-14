import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { parseServerAddSpec, writeProjectServer } from '../src/config.ts'

describe('web config writes', () => {
  it('parses url and command add specs', () => {
    const remote = parseServerAddSpec('docs url=https://mcp.example.com/mcp auth=oauth')
    assert.equal(remote.name, 'docs')
    assert.equal(remote.entry.url, 'https://mcp.example.com/mcp')
    assert.equal(remote.entry.auth, 'oauth')

    const local = parseServerAddSpec('fs command=npx args=-y,@modelcontextprotocol/server-filesystem,/tmp')
    assert.equal(local.entry.command, 'npx')
    assert.deepEqual(local.entry.args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  })

  it('writes a server into project .mcp.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-mcp-write-'))
    const written = writeProjectServer(cwd, 'deepwiki', { url: 'https://mcp.deepwiki.com/mcp' })
    assert.equal(written.changed, true)
    const raw = JSON.parse(readFileSync(join(cwd, '.mcp.json'), 'utf8')) as { mcpServers: Record<string, { url?: string }> }
    assert.equal(raw.mcpServers.deepwiki.url, 'https://mcp.deepwiki.com/mcp')
  })
})
