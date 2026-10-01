import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenizeJson } from '../src/idmp/utils/jsonHighlight.js'

test('JSON preview highlights keys and values without changing the formatted content', () => {
  const value = { sql: 'SELECT "name" FROM visit', count: 12.5, enabled: true, missing: null, list: ['<script>alert(1)</script>'] }
  const tokens = tokenizeJson(value)

  assert.equal(tokens.map(token => token.text).join(''), JSON.stringify(value, null, 2))
  assert.ok(tokens.some(token => token.kind === 'key' && token.text === '"sql"'))
  assert.ok(tokens.some(token => token.kind === 'string' && token.text.includes('SELECT')))
  assert.ok(tokens.some(token => token.kind === 'number' && token.text === '12.5'))
  assert.ok(tokens.some(token => token.kind === 'boolean' && token.text === 'true'))
  assert.ok(tokens.some(token => token.kind === 'null' && token.text === 'null'))
  assert.ok(tokens.some(token => token.kind === 'string' && token.text.includes('<script>')))
})
