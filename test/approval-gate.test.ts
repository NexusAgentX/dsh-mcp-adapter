import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveApprovalTarget } from '../src/approval-gate.ts'
import { createRuntime, stopRuntime } from '../src/runtime.ts'

describe('approval gate', () => {
  it('resolves a proxy mcp tool call to its server', async () => {
    const state = createRuntime({
      config: {
        mcpServers: { github: { command: 'true' } },
        settings: { approveTools: ['search'] },
      },
    })
    state.toolMetadata.set('github', [
      { name: 'github_search', originalName: 'search', description: 'Search' },
    ])
    const target = resolveApprovalTarget(state, 'mcp', { tool: 'github_search' })
    assert.deepEqual(target, {
      serverName: 'github',
      originalName: 'search',
      name: 'github_search',
    })
    await stopRuntime(state)
  })

  it('ignores discovery-only mcp calls', async () => {
    const state = createRuntime({
      config: { mcpServers: { github: { command: 'true' } } },
    })
    assert.equal(resolveApprovalTarget(state, 'mcp', { search: 'x' }), undefined)
    await stopRuntime(state)
  })
})
