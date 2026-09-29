import test from 'node:test'
import assert from 'node:assert/strict'
import { createFieldCatalog } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { advanceDrill, effectiveDrill, initialDrillState, resolveDrillHierarchy } from '../src/idmp/features/dashboard/drillDown.js'

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
