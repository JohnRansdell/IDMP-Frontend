import test from 'node:test'
import assert from 'node:assert/strict'
import { KPI_VARIANTS, normalizeKpiVariant } from '../src/idmp/features/dashboard/kpiVariants.js'
import { createPersistableDashboardSnapshot, normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { applyWidgetStylePreset } from '../src/idmp/features/dashboard/visualStyle.js'

test('KPI variants normalize conservatively and legacy widgets use standard', () => {
  assert.equal(KPI_VARIANTS.length, 6)
  assert.deepEqual(KPI_VARIANTS.map(item => item.id), ['standard', 'hero', 'horizontal', 'status', 'trend', 'minimal'])
  assert.equal(normalizeKpiVariant('hero'), 'hero')
  assert.equal(normalizeKpiVariant('not-a-variant'), 'standard')
  const legacy = normalizeDashboardSchema({ version: 1, id: 'legacy-kpi', widgets: [{ id: 'kpi', type: 'kpi', config: {} }] })
  assert.equal(legacy.widgets[0].config.style.kpiVariant, 'standard')
})

test('KPI variant round trips with a normal dashboard copy and preserves data configuration', () => {
  const binding = { dataset: 'acceptance', dimensions: [{ field: 'month' }], measures: [{ field: 'value', aggregation: 'sum' }], filters: [] }
  const schema = normalizeDashboardSchema({ version: 1, id: 'variant-copy', widgets: [{ id: 'kpi', type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, config: { style: { kpiVariant: 'trend', palettePreset: 'blueTeal', kpi: { valueColor: '#12616d' } }, dataBinding: binding, unit: '人', yoy: 3.2, mom: 1.1, status: 'success', clinicalTrendTone: 'success' } }] })
  const copy = JSON.parse(JSON.stringify(createPersistableDashboardSnapshot(schema)))
  const item = copy.widgets[0]
  assert.equal(item.config.style.kpiVariant, 'trend')
  assert.equal(item.config.style.palettePreset, 'blueTeal')
  assert.deepEqual(item.config.dataBinding, binding)
  assert.equal(item.config.unit, '人')
  assert.equal(item.config.yoy, 3.2)
  assert.equal(item.config.mom, 1.1)
  assert.equal(item.config.status, 'success')
  assert.equal(item.config.clinicalTrendTone, 'success')
})

test('theme preset materialization retains the selected KPI variant', () => {
  const style = applyWidgetStylePreset({ kpiVariant: 'minimal', kpi: { trendColor: '#000000' } }, 'warm')
  assert.equal(style.kpiVariant, 'minimal')
  assert.equal(style.kpi.valueColor, '#9b5636')
})
