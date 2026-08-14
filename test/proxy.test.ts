import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executeDescribe, executeSearch, executeStatus } from '../src/proxy.ts'
import { createRuntime, stopRuntime } from '../src/runtime.ts'

function seededState() {
  const state = createRuntime({
    config: {
      mcpServers: {
        github: { command: 'true', args: [] },
        browser: { command: 'true', args: [], searchKeywords: { take_screenshot: ['capture'] } },
      },
    },
  })
  state.toolMetadata.set('github', [
    { name: 'github_search', originalName: 'search', description: 'Search GitHub issues and pull requests' },
    { name: 'github_create_issue', originalName: 'create_issue', description: 'Create an issue' },
  ])
  state.toolMetadata.set('browser', [
    { name: 'browser_take_screenshot', originalName: 'take_screenshot', description: 'Capture the current page' },
  ])
  return state
}

describe('proxy discovery', () => {
  it('reports cached tools without connecting', async () => {
    const state = seededState()
    const status = await executeStatus(state)
    assert.match(status.text, /github: cached \(2 tools/)
    assert.match(status.text, /browser: cached \(1 tools/)
    await stopRuntime(state)
  })

  it('ranks search hits and includes schemas by default', () => {
    const state = seededState()
    const found = executeSearch(state, 'screenshot')
    assert.match(found.text, /browser_take_screenshot/)
    assert.equal(found.details.count, 1)
  })

  it('describes a tool and suggests alternatives when missing', () => {
    const state = seededState()
    const described = executeDescribe(state, 'github_search')
    assert.match(described.text, /Server: github/)
    const missing = executeDescribe(state, 'github_searc')
    assert.match(missing.text, /not found/)
    assert.ok(Array.isArray(missing.details.suggestions))
  })
})
