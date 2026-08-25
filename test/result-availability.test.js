import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveResultAvailability } from '../src/idmp/features/analysis/resultAvailability.js'

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
