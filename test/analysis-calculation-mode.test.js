import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveIndicatorCalculationMode } from '../src/idmp/features/analysis/calculationMode.js'

test('reads static mode from the published indicator formula', () => {
  const version = { formula: { calculationMode: 'STATIC' } }
  assert.equal(resolveIndicatorCalculationMode(version, {}, 'MONTHLY'), 'STATIC')
})

test('keeps the declared temporal mode ahead of a stale static route', () => {
  const version = { formula: { calculationMode: 'TEMPORAL' } }
  assert.equal(resolveIndicatorCalculationMode(version, {}, 'STATIC'), 'TEMPORAL')
})

test('preserves the route fallback for older versions without mode metadata', () => {
  assert.equal(resolveIndicatorCalculationMode({}, {}, 'STATIC'), 'STATIC')
  assert.equal(resolveIndicatorCalculationMode({}, {}, 'MONTHLY'), '')
})
