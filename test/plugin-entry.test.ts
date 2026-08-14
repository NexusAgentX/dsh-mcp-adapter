import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, inject, name } from '../src/index.ts'

test('public entry exposes the cordis inject list', () => {
  assert.equal(name, 'dsh-mcp-adapter')
  assert.deepEqual(inject, ['tools'])
  assert.equal(typeof apply, 'function')
})
