import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { scoreToolMatch } from '../src/search-ranking.ts'

describe('search ranking', () => {
  it('scores an exact tool name highest', () => {
    const exact = scoreToolMatch(
      { name: 'github_search', originalName: 'search', description: 'Search issues' },
      'github',
      'github_search',
    )
    const partial = scoreToolMatch(
      { name: 'github_create_issue', originalName: 'create_issue', description: 'Create an issue' },
      'github',
      'github_search',
    )
    assert.ok(exact !== null)
    assert.ok(partial === null || exact! > partial)
  })

  it('matches configured keywords', () => {
    const score = scoreToolMatch(
      { name: 'browser_take_screenshot', originalName: 'take_screenshot', description: 'Capture the page' },
      'browser',
      'capture',
      ['capture'],
    )
    assert.ok(score !== null && score > 0)
  })
})
