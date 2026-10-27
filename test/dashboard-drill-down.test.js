import test from 'node:test'
import assert from 'node:assert/strict'
import { createFieldCatalog } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { advanceDrill, effectiveDrill, initialDrillState, resolveDrillHierarchy, resolveDrillClickValue } from '../src/idmp/features/dashboard/drillDown.js'
import { compileWidgetData, bindingChartOption } from '../src/idmp/features/dashboard/bindingEngine.js'

const rows = [{ department: '呼吸内科', medicalGroup: '呼吸一组', doctor: '张医生', indicatorValue: 2 }, { department: '呼吸内科', medicalGroup: '呼吸二组', doctor: '王医生', indicatorValue: 3 }, { department: '心内科', medicalGroup: '心内一组', doctor: '李医生', indicatorValue: 4 }]
const dataset = { rows, fields: createFieldCatalog(rows) }
const widget = { type: 'bar', config: { dataBinding: { dimensions: [{ field: 'department' }], measures: [{ field: 'indicatorValue', aggregation: 'sum' }], series: [], sort: [] }, interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'medicalGroup', 'doctor'] } } } }
test('organization drill changes effective dimension and retains only the parent branch', () => {
  assert.equal(effectiveDrill(widget, dataset, initialDrillState()).binding.dimensions[0].field, 'department')
  const levelTwo = advanceDrill(widget, dataset, initialDrillState(), '呼吸内科')
  const second = effectiveDrill(widget, dataset, levelTwo)
  assert.equal(second.binding.dimensions[0].field, 'medicalGroup')
  assert.deepEqual(second.dataset.rows.map(row => row.department), ['呼吸内科', '呼吸内科'])
  const third = effectiveDrill(widget, dataset, advanceDrill(widget, dataset, levelTwo, '呼吸一组'))
  assert.equal(third.binding.dimensions[0].field, 'doctor')
  assert.deepEqual(third.dataset.rows.map(row => row.doctor), ['张医生'])
})
test('formal organization fields replace demo aliases and missing levels never invalidate the widget', () => {
  const formalRows = [{ OUT_DEPT_CODE: '28', ATTENDING_DOCTOR: 'EO1962', value: 0.01 }]
  const formalDataset = { rows: formalRows, fields: createFieldCatalog(formalRows) }
  assert.deepEqual(resolveDrillHierarchy(['department', 'medicalGroup', 'doctor'], formalDataset.fields), ['OUT_DEPT_CODE', 'ATTENDING_DOCTOR'])
  const formalWidget = { type: 'bar', config: { dataBinding: { dimensions: [{ field: 'OUT_DEPT_CODE' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }, interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'medicalGroup', 'doctor'] } } } }
  assert.equal(effectiveDrill(formalWidget, formalDataset).binding.dimensions[0].field, 'OUT_DEPT_CODE')
})

test('formal bar drilling filters by raw department code, not the visible department name', () => {
  const rows = [
    { OUT_DEPT_CODE: '4', OUT_DEPT_NAME: '重症医学科', ATTENDING_DOCTOR: 'D1', ATTENDING_DOCTOR_NAME: '张医生', value: 0.1, numeratorValue: 1, denominatorValue: 10 },
    { OUT_DEPT_CODE: '4', OUT_DEPT_NAME: '重症医学科', ATTENDING_DOCTOR: 'D2', ATTENDING_DOCTOR_NAME: '王医生', value: 0.2, numeratorValue: 2, denominatorValue: 10 },
    { OUT_DEPT_CODE: '28', OUT_DEPT_NAME: '呼吸内科', ATTENDING_DOCTOR: 'D3', value: 0.3, numeratorValue: 3, denominatorValue: 10 }
  ]
  const dataset = { rows, fields: createFieldCatalog(rows) }
  const widget = { type: 'chart', chartKind: 'bar', config: { dataBinding: { dimensions: [{ field: 'OUT_DEPT_NAME' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }, interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'doctor'] } } } }
  const top = effectiveDrill(widget, { ...dataset, rows: [
    { OUT_DEPT_CODE: '4', OUT_DEPT_NAME: '重症医学科', value: 0.15 },
    { OUT_DEPT_CODE: '28', OUT_DEPT_NAME: '呼吸内科', value: 0.3 }
  ] })
  const model = compileWidgetData('bar', top.binding, top.dataset)
  const point = bindingChartOption('bar', model).series[0].data[0]
  const click = { name: model.categories[0], dataIndex: 0, data: point }
  assert.equal(click.name, '重症医学科')
  assert.equal(resolveDrillClickValue(click, top, model), '4')
  // Multi-series and line charts can expose primitive points; model tuples remain authoritative.
  assert.equal(resolveDrillClickValue({ ...click, data: point.value }, top, model), '4')
  const drilled = effectiveDrill(widget, dataset, advanceDrill(widget, dataset, initialDrillState(), resolveDrillClickValue(click, top, model)))
  const result = compileWidgetData('bar', drilled.binding, drilled.dataset)
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.categories, ['张医生', '王医生'])
  assert.equal(drilled.dataset.rows.length, 2)
  assert.equal(effectiveDrill(widget, dataset, initialDrillState()).dataset.rows.length, 3)
})
