import test from 'node:test'
import assert from 'node:assert/strict'
import { getDashboardSchemaStorageKey, mergeWidgetMetadataAndLayout, normalizeDashboardSchema, validateDashboardSchema } from '../src/idmp/features/dashboard/schema.js'

test('dashboard schema validates separated metadata and grid layout', () => {
  const schema = normalizeDashboardSchema({ id: 'quality-overview', name: '质量看板', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'kpi-1', type: 'kpi', sourceCode: 'I-1', layout: { x: 0, y: 0, w: 6, h: 4 }, data: { value: 1 } }] })
  assert.deepEqual(validateDashboardSchema(schema), { valid: true, errors: [] })
  assert.equal(schema.widgets[0].data, undefined)
  assert.deepEqual(schema.widgets[0].layout, { x: 0, y: 0, w: 6, h: 4 })
})

test('schema validation reports duplicate ids and invalid grid bounds', () => {
  const result = validateDashboardSchema({ version: 1, id: 'demo', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'a', type: 'kpi', layout: { x: -1, y: 0, w: 30, h: 0 } }, { id: 'a', type: 'unknown', layout: {} }] })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('duplicated')))
  assert.ok(result.errors.some((error) => error.includes('invalid')))
  assert.ok(result.errors.some((error) => error.includes('exceeds columns')))
})

test('schema storage keys are isolated by dashboard id', () => {
  assert.equal(getDashboardSchemaStorageKey('quality-overview'), 'idmp:dashboard-schema:v1:quality-overview')
  assert.equal(getDashboardSchemaStorageKey('quality overview'), 'idmp:dashboard-schema:v1:quality%20overview')
})

test('metadata and runtime grid layout merge without runtime snapshots', () => {
  const result = mergeWidgetMetadataAndLayout([{ id: 'chart-1', type: 'chart', chartKind: 'line', sourceCode: 'I-1', data: { value: 2 } }], [{ id: 'chart-1', x: 6, y: 2, w: 12, h: 6 }])
  assert.deepEqual(result, [{ id: 'chart-1', type: 'chart', chartKind: 'line', sourceCode: 'I-1', config: {}, layout: { x: 6, y: 2, w: 12, h: 6 } }])
})
