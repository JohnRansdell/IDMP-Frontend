import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { isMockDashboardDetail, dashboardDetailToEditableSchema, schemaToDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'
import { resolvePublishedDashboardPeriod, resolvePublishedDashboardPeriodRange } from '../src/idmp/features/dashboard/publishedIndicatorRuntime.js'

test('runtime binding rejects historical fixture metadata even when supplied with real results', () => {
  for (const origin of ['acceptance', 'demo']) {
    assert.deepEqual(createWidgetBindingDatasets({ origin, currentValue: 99 }, {
      demo: true, result: { monthlyTrend: [{ month: '2026-01', value: 12 }] }
    }), [])
  }
  assert.deepEqual(createWidgetBindingDatasets({ code: 'REAL' }, { demo: true }), [])
  const datasets = createWidgetBindingDatasets({ code: 'REAL', origin: 'indicator-catalog', analysisCurrentRows: [{ value: 0 }] })
  assert.deepEqual(datasets[0].rows, [{ value: 0 }])
})

test('absence of period metadata never selects a hard-coded business month', () => {
  assert.equal(resolvePublishedDashboardPeriod('', []), '')
  assert.deepEqual(resolvePublishedDashboardPeriodRange([], []), ['', ''])
  assert.equal(resolvePublishedDashboardPeriod('', [{ value: '2026-09' }]), '2026-09')
})

test('historical remote demo boards are detected by board mode or individual widget marker', () => {
  assert.equal(isMockDashboardDetail({ version: { style: { dataMode: 'MOCK' } } }), true)
  assert.equal(isMockDashboardDetail({ version: { widgets: [{ style: { __idmpMockWidget: { type: 'kpi' } } }] } }), true)
  assert.equal(isMockDashboardDetail({ version: { widgets: [{ type: 'KPI', style: {} }] } }), false)
})

test('repairing a legacy draft cannot save its old fixture bindings or mock serialization mode', () => {
  const schema = dashboardDetailToEditableSchema({
    dashboard: { id: '900', name: 'Original board' },
    version: { layout: { columns: 24 }, style: { dataMode: 'MOCK' }, globalFilters: [{ id: 'demo' }], widgets: [
      { code: 'demo-kpi', type: 'TEXT', position: {}, style: { __idmpMockWidget: { type: 'kpi', sourceCode: 'UAT_KPI', config: {} } } }
    ] }
  })
  assert.equal(schema.id, '900')
  assert.equal(schema.name, 'Original board')
  assert.deepEqual(schema.widgets, [])
  assert.deepEqual(schema.globalFilters, [])
  const payload = schemaToDashboardPayload(schema)
  assert.equal(payload.style.dataMode, undefined)
  assert.deepEqual(payload.widgets, [])
})

test('drill API blocks obsolete mock links and missing result IDs without making requests', async () => {
  const source = await readFile(new URL('../src/idmp/api/modules/drill.js', import.meta.url), 'utf8')
  const requests = []
  const module = Function('requestJson', 'adaptDrillResult', source.replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '') + '\nreturn { searchResultDrill }')(
    async (...args) => { requests.push(args); return { dataSource: 'live', records: [] } }, value => value
  )
  await assert.rejects(module.searchResultDrill('MOCK', {}, { source: 'mock' }), /入口已失效/)
  await assert.rejects(module.searchResultDrill(''), /缺少真实结果/)
  assert.equal(requests.length, 0)
  const payload = { currentLevel: 'HOSPITAL' }
  const result = await module.searchResultDrill('opaque/result', payload)
  assert.equal(result.dataSource, 'live')
  assert.equal(requests[0][0], '/analysis/results/opaque%2Fresult/drill/search')
  assert.deepEqual(JSON.parse(requests[0][1].body), payload)
})
