import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatToolName, resolveServerFromToolName } from '../src/types.ts'

describe('tool naming', () => {
  it('prefixes with the sanitized server name by default', () => {
    assert.equal(formatToolName('take_screenshot', 'chrome-devtools', 'server'), 'chrome-devtools_take_screenshot')
  })

  it('uses mcp__server__tool when prefix is mcp', () => {
    assert.equal(formatToolName('search', 'github', 'mcp'), 'mcp__github_search')
  })

  it('resolves the owning server from a prefixed tool name', () => {
    assert.equal(
      resolveServerFromToolName('chrome-devtools_take_screenshot', ['chrome-devtools', 'github'], 'server'),
      'chrome-devtools',
    )
  })
})
