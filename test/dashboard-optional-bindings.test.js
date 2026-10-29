import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardDetailToSchema, schemaToDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'

function detail(type, binding) {
  return { dashboard: { id: '10', name: '住院非药费用看板', type: 'CUSTOM' }, version: { widgets: [{ code: 'COST', title: '科室非药费用', type, indicatorVersionId: '102027642468026658', position: { x: 0, y: 0, w: 12, h: 6 }, fieldBindings: binding }] } }
}

test('version-bound bar chart preserves dimensions and measure when optional series and sort are absent', () => {
  const binding = { dimensions: [{ field: '科室', label: '科室' }], measures: [{ field: 'value', aggregation: 'direct' }] }
  const schema = dashboardDetailToSchema(detail('BAR', binding))
  assert.equal(schema.widgets[0].config.analysisIndicatorVersionId, '102027642468026658')
  assert.deepEqual(schema.widgets[0].config.dataBinding, { ...binding, series: [], sort: [], dataset: 'backend' })
  const payload = schemaToDashboardPayload(schema)
  assert.deepEqual(payload.widgets[0].fieldBindings.dimensions, binding.dimensions)
  assert.equal(payload.widgets[0].indicatorVersionId, '102027642468026658')
})

test('KPI without optional arrays keeps its empty grouping and direct measure', () => {
  const schema = dashboardDetailToSchema(detail('KPI', { dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }] }))
  assert.deepEqual(schema.widgets[0].config.dataBinding.dimensions, [])
  assert.deepEqual(schema.widgets[0].config.dataBinding.measures, [{ field: 'value', aggregation: 'direct' }])
})

test('explicit trend series and sort are preserved rather than reset', () => {
  const binding = { dimensions: [{ field: 'periodStart' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [{ field: '性别' }], sort: [{ field: 'periodStart', direction: 'asc' }] }
  const schema = dashboardDetailToSchema(detail('LINE', binding))
  assert.deepEqual(schema.widgets[0].config.dataBinding, { ...binding, dataset: 'backend' })
})

test('malformed supplied optional values are not silently accepted as empty configuration', () => {
  for (const extra of [{ series: '性别' }, { sort: { field: 'value' } }]) {
    const schema = dashboardDetailToSchema(detail('BAR', { dimensions: [], measures: [], ...extra }))
    assert.equal(schema.widgets[0].config.dataBinding, undefined)
  }
})
