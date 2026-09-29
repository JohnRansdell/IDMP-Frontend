import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIndicatorAnalysisPeriodContext, buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

test('published indicator analysis navigation uses the real indicator identity, not its dashboard source code', () => {
  assert.deepEqual(buildIndicatorAnalysisRouteQuery({
    code: 'catalog-indicator-1001',
    analysisIndicatorId: '1001',
    analysisIndicatorVersionId: '2001',
    name: 'Mortality rate'
  }), {
    indicator: '1001',
    indicatorName: 'Mortality rate',
    indicatorVersionId: '2001'
  })
})

test('analysis navigation uses the persisted identifier priority', () => {
  assert.equal(buildIndicatorAnalysisRouteQuery({ analysisIndicatorId: 'analysis', indicatorId: 'id', indicatorCode: 'code', code: 'source' }).indicator, 'analysis')
  assert.equal(buildIndicatorAnalysisRouteQuery({ indicatorId: 'id', indicatorCode: 'code', code: 'source' }).indicator, 'id')
  assert.equal(buildIndicatorAnalysisRouteQuery({ indicatorCode: 'code', code: 'source' }).indicator, 'code')
})

test('analysis navigation keeps the dashboard and analysis page on the same month', () => {
  const context = buildIndicatorAnalysisPeriodContext('2025-12')
  assert.deepEqual(context, {
    periodStart: '2025-12-01', periodEnd: '2026-01-01', granularity: 'MONTHLY'
  })
  assert.deepEqual(buildIndicatorAnalysisRouteQuery({ indicatorId: '1001' }, context), {
    indicator: '1001', periodStart: '2025-12-01', periodEnd: '2026-01-01', granularity: 'MONTHLY'
  })
})

test('analysis navigation keeps the dashboard month range', () => {
  const context = buildIndicatorAnalysisPeriodContext(['2025-09', '2026-04'])
  assert.deepEqual(context, {
    periodStart: '2025-09-01', periodEnd: '2026-05-01', granularity: 'MONTHLY'
  })
})

test('a component fixed period takes priority over the dashboard month', () => {
  assert.deepEqual(buildIndicatorAnalysisPeriodContext('2025-12', {
    periodMode: 'FIXED', periodStart: '2026-01-01', periodEnd: '2026-03-31', granularity: 'QUARTERLY'
  }), {
    periodStart: '2026-01-01', periodEnd: '2026-03-31', granularity: 'QUARTERLY'
  })
})
