import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveResultAvailability } from '../src/idmp/features/analysis/resultAvailability.js'
import { normalizeIndicatorInstantSummary } from '../src/idmp/api/adapters/indicator.js'

test('empty input, real zero, missing inputs and unknown evidence remain distinct', () => {
  for (const [qualityFlag, value, expected] of [
    ['NO_DATA', 0, 'NO_DATA'], ['NO_DATA', null, 'NO_DATA'],
    ['PASSED', 0, 'READY'], ['NOT_CALCULABLE', null, 'VALUE_NOT_CALCULABLE'],
    ['MISSING_FACTOR', null, 'INCOMPLETE_DATA'], ['UNKNOWN', null, 'UNKNOWN']
  ]) {
    const result = normalizeIndicatorInstantSummary({ indicatorVersionId: '1', rows: [{ qualityFlag, value }] }, '2026-09-01', '2026-09-30')
    assert.equal(result.status, expected)
  }
  assert.equal(resolveResultAvailability({ dataAvailable: true, overview: { value: null, outcomeStatus: 'UNKNOWN' } }).status, 'UNKNOWN')
})

test('formal result presence does not hide its non-calculable outcome', () => {
  for (const resultAvailability of [undefined, { status: 'ACTIVE_RESULT', message: '已返回已激活的正式指标结果' }]) {
    const state = resolveResultAvailability({ dataAvailable: true, resultAvailability, overview: { value: null, outcomeStatus: 'NOT_CALCULABLE' } })
    assert.equal(state.status, 'NOT_CALCULABLE')
    assert.equal(state.message, '指标公式返回空值。')
    assert.equal(state.canCreateBatch, false)
  }
})

test('result availability distinguishes calculation error from no data', () => {
  const failed = resolveResultAvailability({
    batchStatus: 'FAILED', resultOutcomeStatus: 'CALCULATION_ERROR',
    factorDataProfiles: [{ executionStatus: 'FAILED', sourceDataStatus: 'HAS_DATA', sourceRecordCount: 10 }]
  })
  assert.equal(failed.status, 'CALCULATION_ERROR')

  const noData = resolveResultAvailability({
    calculationTargets: [{ executionStatus: 'SUCCEEDED', resultOutcomeStatus: 'NOT_CALCULABLE', factorDataProfiles: [{ sourceDataStatus: 'NO_DATA' }] }]
  })
  assert.equal(noData.status, 'NOT_CALCULABLE')
})

test('result availability keeps a count zero result calculable', () => {
  const value = resolveResultAvailability({ dataAvailable: true, overview: { value: 0, outcomeStatus: 'CALCULATED' } })
  assert.equal(value.status, 'ACTIVE_RESULT')
})

test('multi-target calculated trial records are recognized as available results', () => {
  const availability = resolveResultAvailability({
    batchId: '102027642460316627',
    batchStatus: 'SUCCEEDED',
    resultOutcomeStatus: 'CALCULATED',
    targets: [{
      drillPathCode: 'TIME',
      drillLevelCode: 'MONTH',
      results: { records: [{ resultValue: 0.05430839, displayValue: '5.43%' }] }
    }]
  })

  assert.equal(availability.status, 'ACTIVE_RESULT')
  assert.equal(availability.batchId, '102027642460316627')
})
