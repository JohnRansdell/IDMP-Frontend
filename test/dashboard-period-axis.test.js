import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardDetailToSchema, schemaToDashboardPayload, widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { normalizePeriodBinding } from '../src/idmp/features/dashboard/periodFields.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'

const saved = { dataset: 'backend', dimensions: [{ field: 'MONTH', label: '月度', granularity: 'raw' }],
  measures: [{ field: 'value', label: '住院死亡率', aggregation: 'direct' }], series: [], sort: [{ field: 'MONTH', direction: 'asc' }] }
const fields = [{ code: 'periodStart', name: '统计开始时间', dataType: 'DATETIME', role: 'DIMENSION', groupable: true },
  { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', supportedAggregations: ['NONE'] }]
const dataset = widgetResultToDataset({ status: 'READY', rowMode: 'PROJECTED', rows: [
  { periodStart: '2026-02-01T00:00:00', value: 0.2 },
  { periodStart: '2025-12-01T00:00:00', value: 0.1 },
  { periodStart: '2026-01-01T00:00:00', value: 0.3 }
] }, fields)

test('月度横轴与排序同时使用结果周期，编辑保存不再产生MONTH字段', () => {
  const snapshot = structuredClone(saved)
  const schema = dashboardDetailToSchema({ dashboard: { id: '1', name: '住院质量看板' }, version: { widgets: [
    { code: '趋势', title: '住院死亡率趋势', type: 'LINE', dataSourceCode: '死亡率', indicatorVersionId: '101', fieldBindings: saved }
  ] } })
  const binding = schema.widgets[0].config.dataBinding
  assert.equal(binding.dimensions[0].field, 'periodStart')
  assert.equal(binding.dimensions[0].label, '月度')
  assert.equal(binding.sort[0].field, 'periodStart')
  const payload = schemaToDashboardPayload(schema)
  assert.equal(payload.widgets[0].fieldBindings.dimensions[0].field, 'periodStart')
  assert.equal(payload.widgets[0].fieldBindings.sort[0].field, 'periodStart')
  assert.deepEqual(saved, snapshot)
})

for (const direction of ['asc', 'desc']) test(`月度${direction}排序跨年保持数值与月份对齐，不要求MONTH列`, () => {
  const binding = normalizePeriodBinding({ ...saved, sort: [{ field: 'MONTH', direction }] })
  const chart = compileWidgetData('line', binding, dataset)
  assert.equal(chart.status, 'ready', chart.message)
  assert.deepEqual(chart.categories, direction === 'asc' ? ['2025-12', '2026-01', '2026-02'] : ['2026-02', '2026-01', '2025-12'])
  assert.deepEqual(chart.series[0].values, direction === 'asc' ? [0.1, 0.3, 0.2] : [0.2, 0.3, 0.1])
})

test('排序依据选中的月度维度，不受排在前面的科室维度干扰', () => {
  const binding = normalizePeriodBinding({ ...saved, dimensions: [{ field: '科室', label: '科室' }, ...saved.dimensions] })
  const chart = compileWidgetData('line', binding, { ...dataset, fields: [{ id: '科室', label: '科室', semanticType: 'dimension' }, ...dataset.fields],
    rows: dataset.rows.map((row, i) => ({ ...row, 科室: ['产科', '骨科', '内科'][i] })) })
  assert.equal(chart.status, 'ready', chart.message)
  assert.deepEqual(chart.series[0].values, [0.1, 0.3, 0.2])
})

test('不吞掉真实业务字段错误，不改写度量及筛选条件', () => {
  const binding = normalizePeriodBinding({ ...saved, dimensions: [{ field: '不存在的科室', label: '科室' }], sort: [], filters: [{ field: 'MONTH', operator: 'equals', value: 1 }] })
  assert.equal(binding.filters[0].field, 'MONTH')
  const chart = compileWidgetData('line', binding, dataset)
  assert.equal(chart.status, 'invalid')
  assert.match(chart.message, /不存在的科室/)
  assert.equal(normalizePeriodBinding({ ...saved, dimensions: [{ field: 'periodEnd' }] }).dimensions[0].field, 'periodEnd')
})
