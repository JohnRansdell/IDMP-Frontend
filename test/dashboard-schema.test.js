import test from 'node:test'
import assert from 'node:assert/strict'
import { isProxy, reactive } from 'vue'
import {
  clonePersistableValue,
  createPersistableDashboardSnapshot,
  assertDashboardPersistenceContract,
  getDashboardSchemaStorageKey,
  mergeWidgetMetadataAndLayout,
  migrateDashboardSchema,
  normalizeDashboardSchema,
  semanticDashboardEquals,
  synchronizeDashboardGridLayout,
  updateDashboardWidget,
  validateDashboardSchema
} from '../src/idmp/features/dashboard/schema.js'

test('dashboard schema validates separated metadata and grid layout', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'quality-overview', name: '质量看板', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'kpi-1', type: 'kpi', sourceCode: 'I-1', layout: { x: 0, y: 0, w: 6, h: 4 }, data: { value: 1 } }] })
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
  assert.deepEqual(result, [{ id: 'chart-1', type: 'chart', chartKind: 'line', sourceCode: 'I-1', config: { style: { background: '#ffffff', borderColor: '#d0d5dd', borderWidth: 1, borderStyle: 'solid', borderRadius: 8, shadow: 'none', padding: 0, opacity: 1 } }, layout: { x: 6, y: 2, w: 12, h: 6 } }])
})

test('dashboard management metadata normalizes, persists, and remains backward compatible', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'metadata', name: '看板', description: '说明', dashboardType: 'department', category: 'quality', scope: 'department', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [] })
  assert.equal(schema.description, '说明')
  assert.equal(schema.dashboardType, 'department')
  assert.equal(schema.category, 'quality')
  assert.equal(schema.scope, 'department')
  assert.deepEqual(validateDashboardSchema(schema), { valid: true, errors: [] })
  const legacy = normalizeDashboardSchema({ version: 1, id: 'legacy-metadata', name: '旧看板', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [] })
  assert.deepEqual({ description: legacy.description, dashboardType: legacy.dashboardType, category: legacy.category, scope: legacy.scope }, { description: '', dashboardType: 'custom', category: '', scope: 'hospital' })
})

test('runtime grid layout updates the canonical schema with integer coordinates', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'kpi-1', type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 4 } }] })
  const result = synchronizeDashboardGridLayout(schema, [{ id: 'kpi-1', x: 5.6, y: 2.2, w: 7.4, h: 5.8 }], true)
  assert.deepEqual(result.schema.widgets[0].layout, { x: 6, y: 2, w: 7, h: 6 })
  assert.equal(result.dirty, true)
})

test('inspector updates the selected canonical widget without changing another widget', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'a', type: 'kpi' }, { id: 'b', type: 'chart' }] })
  const updated = updateDashboardWidget(schema, 'a', (widget) => ({ ...widget, title: '住院日', config: { ...widget.config, style: { ...widget.config.style, borderWidth: 3 } } }))
  assert.equal(updated.widgets[0].title, '住院日')
  assert.equal(updated.widgets[0].config.style.borderWidth, 3)
  assert.equal(updated.widgets[1], schema.widgets[1])
})

test('persisted dashboard snapshot has deep semantic equality after JSON read back', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'a', type: 'chart', title: '趋势', chartKind: 'line', config: { style: { padding: 8 } }, layout: { x: 1, y: 2, w: 12, h: 8 } }] })
  const persisted = JSON.parse(JSON.stringify(schema))
  assert.deepEqual(createPersistableDashboardSnapshot(persisted), createPersistableDashboardSnapshot(schema))
  assert.equal(semanticDashboardEquals(schema, persisted), true)
})

test('empty dashboard is valid and survives persistence read back', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'empty', widgets: [] })
  const persisted = JSON.parse(JSON.stringify(schema))
  assert.deepEqual(validateDashboardSchema(persisted), { valid: true, errors: [] })
  assert.equal(persisted.widgets.length, 0)
  assert.equal(semanticDashboardEquals(schema, persisted), true)
})

test('initial and programmatic layout synchronization do not mark user dirty', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'a', type: 'kpi' }] })
  const initial = synchronizeDashboardGridLayout(schema, [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }])
  const restored = synchronizeDashboardGridLayout(initial.schema, [{ id: 'a', x: 4, y: 3, w: 6, h: 4 }], false)
  assert.equal(initial.dirty, false)
  assert.equal(restored.dirty, false)
  assert.deepEqual(restored.schema.widgets[0].layout, { x: 4, y: 3, w: 6, h: 4 })
})

test('reactive dashboard config crosses the JSON persistence boundary without DataCloneError', () => {
  const nestedConfig = reactive({ style: { borderRadius: 12, background: '#ffffff' }, labels: reactive(['当前值']) })
  const schema = reactive({
    version: 1,
    id: 'reactive-dashboard',
    name: '响应式看板',
    layout: { engine: 'gridstack', columns: 24, float: false },
    widgets: [{ id: 'kpi-1', type: 'kpi', title: '测试指标 A', config: nestedConfig, layout: { x: 1, y: 2, w: 6, h: 4 } }]
  })
  assert.equal(isProxy(schema.widgets[0].config), true)
  assert.equal(isProxy(schema.widgets[0].config.style), true)

  const normalized = normalizeDashboardSchema(schema)
  const snapshot = createPersistableDashboardSnapshot(schema)
  const persisted = JSON.parse(JSON.stringify(normalized))

  assert.equal(isProxy(normalized.widgets[0].config), false)
  assert.equal(isProxy(snapshot), false)
  const plainConfig = clonePersistableValue(schema.widgets[0].config)
  assert.deepEqual(plainConfig, { style: { borderRadius: 12, background: '#ffffff' }, labels: ['当前值'] })
  assert.equal(normalized.widgets[0].config.style.borderRadius, plainConfig.style.borderRadius)
  assert.equal(normalized.widgets[0].config.style.background, plainConfig.style.background)
  assert.deepEqual(normalized.widgets[0].config.labels, plainConfig.labels)
  assert.doesNotThrow(() => JSON.stringify(snapshot))
  assert.equal(semanticDashboardEquals(normalized, persisted), true)
})

test('validation is read-only and rejects an invalid version before normalization', () => {
  const raw = { version: 2, id: 'demo', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [] }
  const before = JSON.stringify(raw)
  const validation = validateDashboardSchema(raw)
  assert.equal(validation.valid, false)
  assert.match(validation.errors.join(' '), /version must be 1/)
  assert.equal(JSON.stringify(raw), before)
  assert.throws(() => normalizeDashboardSchema(raw), /normalization requires dashboard schema version 1/)
})

test('legacy migration declares its source and target version explicitly', () => {
  const migrated = migrateDashboardSchema({ id: 'legacy', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [] }, { fromVersion: 'legacy-pixel-layout', toVersion: 1 })
  assert.equal(migrated.version, 1)
  assert.throws(() => migrateDashboardSchema({}, { fromVersion: 0, toVersion: 1 }), /unsupported dashboard migration/)
})

test('persistence contract rejects undeclared fields instead of silently dropping them', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'a', type: 'kpi', config: { style: {}, dimension: { field: 'department' } } }] })
  assert.equal(assertDashboardPersistenceContract(schema), true)
  const forgottenContractField = { ...schema, widgets: [{ ...schema.widgets[0], measures: [{ field: 'value' }] }] }
  assert.throws(() => createPersistableDashboardSnapshot(forgottenContractField), /undeclared persisted field.*measures/)
})
