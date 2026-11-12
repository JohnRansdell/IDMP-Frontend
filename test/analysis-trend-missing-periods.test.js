import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnalysisTrendPresentation } from '../src/idmp/features/analysis/trendPresentation.js'

function presentation(granularity, trend, range = []) {
  return createAnalysisTrendPresentation({ analysis: { dataAvailable: true, granularity, trend },
    granularity, range, profile: { unit: '' } })
}

test('missing leading, middle and trailing months stay blank without altering saved values', () => {
  const saved = [{ periodStart: '2026-02-01', value: 12.34, displayValue: '12.34', outcomeStatus: 'CALCULATED' },
    { periodStart: '2026-04-01', value: 0, displayValue: '0.00', outcomeStatus: 'CALCULATED' }]
  const before = structuredClone(saved)
  const result = presentation('MONTHLY', saved, ['2026-01-01', '2026-05-31'])
  assert.deepEqual(result.trend.labels, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
  assert.deepEqual(result.option.series[0].data, [null, 12.34, null, 0, null])
  assert.equal(result.option.series[0].connectNulls, false)
  assert.deepEqual(result.rows.map(row => row.actualDisplay), ['暂无正式结果', '12.34', '暂无正式结果', '0.00', '暂无正式结果'])
  assert.deepEqual(saved, before)
})

test('missing results remain distinct from calculated nulls and confirmed no data', () => {
  const result = presentation('MONTHLY', [
    { periodStart: '2026-02-01', value: null, outcomeStatus: 'NOT_CALCULABLE' },
    { periodStart: '2026-03-01', value: null, outcomeStatus: 'NO_DATA' }
  ], ['2026-01-01', '2026-03-31'])
  assert.deepEqual(result.trend.outcomes, ['NO_RESULT', 'NOT_CALCULABLE', 'NO_DATA'])
  assert.equal(result.rows[0].actualDisplay, '暂无正式结果')
  assert.equal(result.rows[1].actualDisplay, '无法计算')
  assert.equal(result.notCalculableCount, 1)
  assert.deepEqual(result.option.series[0].data, [null, null, null])
})

test('all-time quarterly and yearly series retain gaps between saved periods', () => {
  for (const [grain, starts, labels] of [
    ['QUARTERLY', ['2025-10-01', '2026-04-01'], ['2025-Q4', '2026-Q1', '2026-Q2']],
    ['YEARLY', ['2024-01-01', '2026-01-01'], ['2024', '2025', '2026']]
  ]) {
    const result = presentation(grain, starts.map(periodStart => ({ periodStart, value: 2 })))
    assert.deepEqual(result.trend.labels, labels)
    assert.deepEqual(result.option.series[0].data, [2, null, 2])
  }
})

test('an entirely missing trend stays empty rather than inventing calculated periods', () => {
  const result = presentation('MONTHLY', [], ['2025-02-01', '2026-02-28'])
  assert.deepEqual(result.rows, [])
})
