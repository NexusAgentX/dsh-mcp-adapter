import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parsePromptArgs, resolvePromptArgs } from '../src/prompts.ts'

describe('prompt args', () => {
  it('parses positional and named arguments', () => {
    const parsed = parsePromptArgs('today topic="important tasks"')
    assert.deepEqual(parsed.positional, ['today'])
    assert.equal(parsed.named.topic, 'important tasks')
  })

  it('requires declared arguments', () => {
    const resolved = resolvePromptArgs(
      {
        serverName: 'demo',
        originalName: 'brief',
        commandName: 'mcp__demo__brief',
        description: 'brief',
        arguments: [{ name: 'day', required: true }, { name: 'topic' }],
      },
      parsePromptArgs('topic=x'),
    )
    assert.equal(resolved.ok, false)
  })
})
