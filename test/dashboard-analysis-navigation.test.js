import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

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
