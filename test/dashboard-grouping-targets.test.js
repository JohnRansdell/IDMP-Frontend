import test from 'node:test'
import assert from 'node:assert/strict'
import { bindGroupingTarget, selectedGroupingTarget } from '../src/idmp/features/dashboard/groupingTargets.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { instantChartDrillTarget } from '../src/idmp/features/dashboard/instantChartDrill.js'
import { loadBackendChartRoot, loadBackendChartLevel } from '../src/idmp/features/dashboard/backendChartDrill.js'
import { adaptDrillResult } from '../src/idmp/api/adapters/drill.js'

const fields = ['科室', '性别', '年龄段'].map(id => ({ id, label: id, semanticType: 'dimension' }))
const target = { code: 'BASE', fields: fields.map(field => field.id) }
const binding = { dimensions: [], series: [], measures: [{ field: 'value', aggregation: 'direct' }], sort: [] }
test('complete combination is selected atomically; a subset does not match', () => {
  const next = bindGroupingTarget(binding, target, fields)
  assert.deepEqual(next.dimensions.map(item => item.field), target.fields)
  assert.equal(selectedGroupingTarget(next, [target], fields), 'BASE')
  assert.equal(selectedGroupingTarget({ ...next, dimensions: next.dimensions.slice(0, 1) }, [target], fields), '')
})
test('three-dimensional pie preserves separate tuples and exact values', () => {
  const next = bindGroupingTarget(binding, target, fields)
  const result = compileWidgetData('pie', next, { serverCalculated: true,
    fields: [...fields, { id: 'value', semanticType: 'measure' }], rows: [
      { 科室: '骨科', 性别: '女', 年龄段: '青年', value: 0.2 },
      { 科室: '骨科', 性别: '女', 年龄段: '老年', value: 0.5 }] })
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.series[0].values, [0.2, 0.5])
  assert.deepEqual(result.categories, ['骨科 / 女 / 青年', '骨科 / 女 / 老年'])
})
test('instant drill carries period and parent scope without a formal result ID', async () => {
  const targets = [
    { pathCode: 'ORGANIZATION', levelCode: 'HOSPITAL', name: '组织 / 医院', fields: [] },
    { pathCode: 'ORGANIZATION', levelCode: 'DEPARTMENT', name: '组织 / 科室', fields: ['科室'] },
    { pathCode: 'ORGANIZATION', levelCode: 'DOCTOR', name: '组织 / 医生', fields: ['科室', '医生'] }]
  let request
  const row = { 科室: '15', queryContext: { indicatorVersionId: '9', periodStart: '2026-01-01', periodEnd: '2026-04-01', filters: {} } }
  const target = instantChartDrillTarget(row, targets, { field: '科室', search: async payload => {
    request = payload
    return adaptDrillResult({ summary: null, context: { resultId: null, snapshotId: null, indicatorVersionId: '9', currentLevel: 'DOCTOR',
      periodStart: '2026-01-01', periodEnd: '2026-04-01' }, records: [],
      pageInfo: { total: 0, pageNum: 1, pageSize: 200 } })
  } })
  const root = await loadBackendChartRoot(() => assert.fail('no persisted query'), target)
  await loadBackendChartLevel(() => assert.fail('no persisted query'), root, root.initialNavigation)
  assert.equal(request.context.periodEnd, '2026-04-01')
  assert.equal(request.currentLevel, 'DOCTOR')
  assert.deepEqual(request.parentKeys, { 科室: '15' })
})
