import test from 'node:test'
import assert from 'node:assert/strict'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'
import { clinicalTrendTone } from '../src/idmp/features/dashboard/chartTheme.js'
import { createLayoutTemplateFromDashboard, instantiateLayoutTemplate } from '../src/idmp/features/dashboard/layoutTemplates.js'
import { createPersistableDashboardSnapshot, normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { addMetricGroupItem, applyMetricGroupPreset, createMetricGroupConfig, createMetricGroupItem, duplicateMetricGroupItem, METRIC_GROUP_PRESETS, metricGroupItemWidget, moveMetricGroupItem, normalizeMetricGroupConfig, removeMetricGroupItem, reorderMetricGroupItem } from '../src/idmp/features/dashboard/metricGroup.js'
import { dashboardDetailToSchema, schemaToDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'

const source = (code, name) => ({ code, name, unit: '%', currentValue: 1 })

test('metric group defaults, normalizes and persists its items and grid layout', () => {
  const config = createMetricGroupConfig([source('A', '指标 A'), source('B', '指标 B')])
  assert.equal(config.items.length, 4)
  const normalized = normalizeMetricGroupConfig({ ...config, layout: { columns: '3', gap: 14 } })
  const schema = normalizeDashboardSchema({ version: 1, id: 'group', name: '组', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'group-1', type: 'metric-group', title: '核心指标', config: { metricGroup: normalized }, layout: { x: 0, y: 0, w: 12, h: 5 } }] })
  const restored = JSON.parse(JSON.stringify(createPersistableDashboardSnapshot(schema)))
  assert.equal(restored.widgets[0].config.metricGroup.layout.columns, '3')
  assert.equal(restored.widgets[0].config.metricGroup.items[0].sourceCode, 'A')
})

test('metric group items use the existing KPI binding compiler with one shared dataset', () => {
  const dataset = { fields: [{ id: 'a', label: 'A', semanticType: 'measure', unit: '%' }, { id: 'b', label: 'B', semanticType: 'measure', unit: '%' }], rows: [{ a: 11, b: 20 }] }
  const group = { id: 'group', config: { metricGroup: { items: [
    { ...createMetricGroupItem(source('A', 'A')), dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'a', aggregation: 'direct' }], series: [], sort: [] } },
    { ...createMetricGroupItem(source('B', 'B')), dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'b', aggregation: 'direct' }], series: [], sort: [] } }
  ] } } }
  const items = normalizeMetricGroupConfig(group.config.metricGroup).items
  assert.equal(compileWidgetData('kpi', items[0].dataBinding, dataset).value, 11)
  assert.equal(compileWidgetData('kpi', items[1].dataBinding, dataset).value, 20)
  assert.equal(metricGroupItemWidget(group, items[0]).config.dataBinding.dataset, 'current')
})

test('metric group items independently filter and aggregate one shared base dataset', () => {
  const dataset = {
    fields: [{ id: 'department', semanticType: 'dimension', filterable: true, dataType: 'string' }, { id: 'value', semanticType: 'measure', unit: '%' }],
    rows: [{ department: 'A', value: 10 }, { department: 'A', value: 30 }, { department: 'B', value: 50 }]
  }
  const group = { id: 'group', config: { metricGroup: { items: [
    { id: 'average-a', label: 'Average A', sourceCode: 'same', dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [], filters: [{ field: 'department', operator: 'equals', value: 'A' }] } },
    { id: 'sum-b', label: 'Sum B', sourceCode: 'same', dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'value', aggregation: 'sum' }], series: [], sort: [], filters: [{ field: 'department', operator: 'equals', value: 'B' }] } }
  ] } } }
  const [averageItem, sumItem] = normalizeMetricGroupConfig(group.config.metricGroup).items
  const averageWidget = metricGroupItemWidget(group, averageItem)
  const sumWidget = metricGroupItemWidget(group, sumItem)
  assert.equal(compileWidgetData('kpi', averageItem.dataBinding, queryWidgetDatasetWithRuntime(dataset, averageWidget)).value, 20)
  assert.equal(compileWidgetData('kpi', sumItem.dataBinding, queryWidgetDatasetWithRuntime(dataset, sumWidget)).value, 50)
  assert.equal(clinicalTrendTone('danger'), 'danger')
  assert.notEqual(clinicalTrendTone('danger'), 'success')
})

test('layout templates retain metric group configuration while ordinary bindings remain excluded', () => {
  const schema = { version: 1, id: 'group-template', name: '模板', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'group', type: 'metric-group', title: '异常指标', config: { style: { borderRadius: 12 }, metricGroup: { title: '异常指标', subtitle: '', items: [createMetricGroupItem(source('A', '指标 A'))], layout: { columns: '2', gap: 8 } } }, layout: { x: 0, y: 0, w: 12, h: 5 } }] }
  const template = createLayoutTemplateFromDashboard(schema, { id: 'metric-template', name: '指标组模板' })
  const [widget] = instantiateLayoutTemplate(template, { createWidgetId: () => 'fresh-group' })
  assert.equal(widget.type, 'metric-group')
  assert.equal(widget.config.metricGroup.items[0].sourceCode, 'A')
  assert.equal(widget.config.style.borderRadius, 12)
})

test('metric group schema normalization is stable and item creation cannot collide in one clock tick', () => {
  const originalNow = Date.now
  Date.now = () => 100
  try {
    const first = createMetricGroupItem(source('A', 'A'), 0)
    const second = createMetricGroupItem(source('B', 'B'), 0)
    assert.notEqual(first.id, second.id)
  } finally { Date.now = originalNow }

  const input = {
    version: 1, id: 'normalized-group', layout: { engine: 'gridstack', columns: 24, float: false },
    widgets: [{ id: 'group', type: 'metric-group', config: { metricGroup: { title: null, items: [null, { id: 'same', label: 'A' }, { id: 'same', label: 'B' }], layout: { columns: '99', gap: 99 } } }, layout: { x: 0, y: 0, w: 12, h: 5 } }]
  }
  const once = normalizeDashboardSchema(input)
  const twice = normalizeDashboardSchema(once)
  assert.deepEqual(twice, once)
  assert.equal(once.widgets[0].config.metricGroup.layout.columns, 'auto')
  assert.equal(once.widgets[0].config.metricGroup.layout.gap, 32)
  assert.equal(new Set(once.widgets[0].config.metricGroup.items.map(item => item.id)).size, 3)
})

test('remote metric group envelope round-trips without capturing ordinary text widgets', () => {
  const schema = normalizeDashboardSchema({
    version: 1, id: 'remote-group', layout: { engine: 'gridstack', columns: 24, float: false },
    widgets: [{ id: 'group', type: 'metric-group', title: 'Group', config: { style: { backgroundAssetKey: 'mint' }, metricGroup: { title: 'Group', items: [{ id: 'item', label: 'A', sourceCode: 'source-a', dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] } }] } }, layout: { x: 1, y: 2, w: 12, h: 5 } }]
  })
  const payload = schemaToDashboardPayload(schema)
  const restored = dashboardDetailToSchema({ dashboard: { id: 'remote-group' }, version: { layout: { columns: 24, float: false }, widgets: payload.widgets } })
  assert.equal(restored.widgets[0].type, 'metric-group')
  assert.deepEqual(restored.widgets[0].config, schema.widgets[0].config)
  assert.deepEqual(restored.widgets[0].layout, schema.widgets[0].layout)

  const text = dashboardDetailToSchema({ dashboard: { id: 'ordinary-text' }, version: { layout: { columns: 24, float: false }, widgets: [{ code: 'text', type: 'TEXT', title: 'Text', position: { x: 0, y: 0, w: 4, h: 3 }, chart: { chartKind: 'text' }, style: { __idmpMetricGroup: { config: { items: [] } } } }] } })
  assert.equal(text.widgets[0].type, 'text')
})

test('metric composer normalizes presentation metadata without regenerating stable item ids', () => {
  const config = normalizeMetricGroupConfig({ items: [{ id: 'stable', label: 'Hero', layout: { span: 9 }, emphasis: 'invalid', align: 'right' }, { id: 'normal', label: 'Normal', layout: { span: 2 }, emphasis: 'hero', align: 'center' }] })
  assert.equal(config.items[0].id, 'stable')
  assert.deepEqual(config.items[0].layout, { span: 1 })
  assert.equal(config.items[0].emphasis, 'normal')
  assert.equal(config.items[0].align, 'left')
  assert.deepEqual(config.items[1].layout, { span: 2 })
  assert.equal(config.items[1].emphasis, 'hero')
  assert.equal(config.items[1].align, 'center')
  assert.deepEqual(normalizeMetricGroupConfig(config), config)
})

test('metric composer add duplicate remove and ordering operations remain independent', () => {
  const first = { ...createMetricGroupItem(source('A', 'A')), id: 'a', label: 'A', dataBinding: { dataset: 'current', measures: [{ field: 'a' }] } }
  const second = { ...createMetricGroupItem(source('B', 'B')), id: 'b', label: 'B' }
  const base = { items: [first, second] }
  const added = addMetricGroupItem(base, source('C', 'C'))
  assert.equal(added.config.items.length, 3)
  const duplicated = duplicateMetricGroupItem(base, 'a')
  assert.equal(duplicated.config.items.length, 3)
  assert.notEqual(duplicated.item.id, 'a')
  duplicated.item.dataBinding.measures[0].field = 'changed'
  assert.equal(first.dataBinding.measures[0].field, 'a')
  assert.deepEqual(moveMetricGroupItem(base, 'b', -1).items.map(item => item.id), ['b', 'a'])
  assert.deepEqual(reorderMetricGroupItem(base, 'b', 'a').items.map(item => item.id), ['b', 'a'])
  const removed = removeMetricGroupItem(base, 'a')
  assert.deepEqual(removed.config.items.map(item => item.id), ['b'])
  assert.equal(removed.selectedId, 'b')
})

test('composer item layout survives dashboard and layout template persistence', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'composer', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'group', type: 'metric-group', config: { metricGroup: { items: [{ id: 'hero', label: 'Hero', layout: { span: 2 }, emphasis: 'hero', align: 'center' }] } }, layout: { x: 0, y: 0, w: 12, h: 5 } }] })
  const snapshot = JSON.parse(JSON.stringify(createPersistableDashboardSnapshot(schema)))
  assert.deepEqual(snapshot.widgets[0].config.metricGroup.items[0].layout, { span: 2 })
  const template = createLayoutTemplateFromDashboard(schema, { id: 'composer-template', name: 'Composer' })
  const [copied] = instantiateLayoutTemplate(template, { createWidgetId: () => 'copied' })
  assert.equal(copied.config.metricGroup.items[0].emphasis, 'hero')
  assert.equal(copied.config.metricGroup.items[0].align, 'center')
})

test('metric group presets are complete, unique, and materialize presentation without changing metric identity or bindings', () => {
  assert.equal(METRIC_GROUP_PRESETS.length, 6)
  assert.equal(new Set(METRIC_GROUP_PRESETS.map(preset => preset.id)).size, 6)
  for (const preset of METRIC_GROUP_PRESETS) {
    assert.ok(preset.name)
    assert.ok(preset.description)
    assert.ok(preset.thumbnail)
  }
  const items = Array.from({ length: 5 }, (_, index) => ({
    id: `metric-${index + 1}`, label: `Metric ${index + 1}`, sourceCode: `source-${index + 1}`,
    dataBinding: { dataset: 'current', measures: [{ field: `value-${index + 1}`, aggregation: 'avg' }] },
    layout: { span: 1 }, emphasis: 'normal', align: 'left'
  }))
  const base = { title: 'Group', items, layout: { columns: '2', gap: 5 }, itemAppearance: 'flat' }
  for (const preset of METRIC_GROUP_PRESETS) {
    const result = applyMetricGroupPreset(base, preset.id)
    assert.deepEqual(result.items.map(item => item.id), items.map(item => item.id))
    assert.deepEqual(result.items.map(item => item.sourceCode), items.map(item => item.sourceCode))
    assert.deepEqual(result.items.map(item => item.dataBinding), items.map(item => item.dataBinding))
    assert.ok(['auto', '2', '3', '4'].includes(result.layout.columns))
    assert.ok(['flat', 'divider', 'tile'].includes(result.itemAppearance))
  }
  const hero = applyMetricGroupPreset(base, 'hero-secondary')
  assert.deepEqual(hero.items[0].layout, { span: 2 })
  assert.equal(hero.items[0].emphasis, 'hero')
  assert.equal(applyMetricGroupPreset(base, 'metric-strip').itemAppearance, 'divider')
  assert.equal(applyMetricGroupPreset(base, 'minimal').itemAppearance, 'flat')
})

test('metric group presets remain safe for every supported item count and presentation normalization is stable', () => {
  for (const count of [1, 2, 3, 5, 8]) {
    const config = { items: Array.from({ length: count }, (_, index) => ({ id: `stable-${index}`, label: `Metric ${index}`, dataBinding: { dataset: 'current', measures: [{ field: 'value' }] } })) }
    for (const preset of METRIC_GROUP_PRESETS) {
      const result = applyMetricGroupPreset(config, preset.id)
      assert.equal(result.items.length, count)
      assert.deepEqual(result.items.map(item => item.id), config.items.map(item => item.id))
      assert.ok(result.items.every(item => [1, 2].includes(item.layout.span)))
      assert.ok(result.items.every(item => ['normal', 'emphasis', 'hero'].includes(item.emphasis)))
    }
  }
  const invalid = normalizeMetricGroupConfig({ itemAppearance: 'heavy-card', items: [{ id: 'stable' }] })
  assert.equal(invalid.itemAppearance, 'tile')
  assert.deepEqual(normalizeMetricGroupConfig(invalid), invalid)
  assert.equal(normalizeMetricGroupConfig({ items: [{ id: 'stable' }] }).itemAppearance, 'tile')
})
