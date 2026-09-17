import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPublishedIndicatorAnalysisQuery, schemaPublishedIndicatorSourceCodes } from '../src/idmp/features/dashboard/publishedIndicatorRuntime.js'

test('published dashboard widgets query their persisted indicator version for the selected month', () => {
  assert.deepEqual(buildPublishedIndicatorAnalysisQuery({ analysisIndicatorVersionId: '102027642460303757' }, '2025-12'), {
    indicatorVersionId: '102027642460303757', granularity: 'MONTHLY', periodStart: '2025-12-01', periodEnd: '2026-01-01'
  })
})

test('only saved published indicator widgets are hydrated on viewer startup', () => {
  assert.deepEqual(schemaPublishedIndicatorSourceCodes({ widgets: [
    { sourceCode: 'catalog-indicator-102027642460303750' },
    { sourceCode: 'MORTALITY_INPATIENT' },
    { sourceCode: 'catalog-indicator-102027642460303750' }
  ] }), ['catalog-indicator-102027642460303750'])
})
