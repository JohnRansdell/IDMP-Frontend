import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultBinding, isEmptyDashboardBinding } from '../src/idmp/features/dashboard/smartDefaultBinding.js'

const fields = [
  { id: 'month', label: 'Month', semanticType: 'time' },
  { id: 'department', label: 'Department', semanticType: 'dimension' },
  { id: 'disease', label: 'Disease', semanticType: 'dimension' },
  { id: 'value', label: 'Value', semanticType: 'measure', recommendedAggregation: 'sum' },
  { id: 'target', label: 'Target', semanticType: 'measure' }
]
const dataset = (id = 'acceptance', availableFields = fields) => ({ id, fields: availableFields })

test('smart defaults create conservative bindings for regular charts and KPI', () => {
  assert.deepEqual(createDefaultBinding('bar', [dataset()]), { dataset: 'acceptance', dimensions: [{ field: 'department', label: 'Department' }], measures: [{ field: 'value', label: 'Value', aggregation: 'sum', axis: 'left' }], series: [], sort: [] })
  assert.equal(createDefaultBinding('line', [dataset()]).dimensions[0].field, 'month')
  assert.equal(createDefaultBinding('pie', [dataset()]).dimensions[0].field, 'department')
  assert.equal(createDefaultBinding('kpi', [dataset('current')]).measures[0].field, 'value')
  assert.equal(createDefaultBinding('gauge', [dataset('current')]).measures[0].field, 'value')
})

test('smart defaults keep scatter and heatmap conservative and map unguessed', () => {
  const scatter = createDefaultBinding('scatter', [dataset()])
  assert.deepEqual(scatter.measures.map(item => item.field), ['value', 'target'])
  assert.equal(createDefaultBinding('scatter', [dataset('acceptance', fields.filter(field => field.id !== 'target'))]), null)
  const heatmap = createDefaultBinding('heatmap', [dataset()])
  assert.deepEqual([heatmap.dimensions[0].field, heatmap.series[0].field, heatmap.measures[0].field], ['month', 'department', 'value'])
  assert.equal(createDefaultBinding('heatmap', [dataset('acceptance', fields.filter(field => field.semanticType !== 'dimension'))]), null)
  assert.equal(createDefaultBinding('map', [dataset()]), null)
})

test('default selection respects an explicit empty dataset choice and existing bindings remain protected', () => {
  const source = [dataset('current', fields.filter(field => field.semanticType === 'measure')), dataset('departments')]
  assert.equal(createDefaultBinding('line', source).dataset, 'departments')
  assert.equal(createDefaultBinding('line', source, { datasetId: 'current' }), null)
  assert.equal(isEmptyDashboardBinding({ dataset: 'acceptance', dimensions: [], measures: [], series: [], sort: [] }), true)
  assert.equal(isEmptyDashboardBinding({ dataset: 'acceptance', dimensions: [{ field: 'department' }], measures: [], series: [], sort: [] }), false)
})
