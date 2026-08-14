import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { apply, inject, name } from '../src/index.ts'

test('public entry exposes the cordis inject list', () => {
  assert.equal(name, 'dsh-mcp-adapter')
  assert.deepEqual(inject, ['tools'])
  assert.equal(typeof apply, 'function')
})

test('client plugin injects the nested remote.commands service', () => {
  const src = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
  const match = src.match(/export const inject = (\[[^\]]+\])/)
  assert.ok(match, 'client inject export missing')
  assert.deepEqual(Function(`return ${match[1]}`)(), [
    'slots',
    'commandUi',
    'remote',
    'remote.commands',
    'locale',
  ])
})
