import assert from 'node:assert/strict'
import test from 'node:test'
import { bindingChartOption, compileWidgetData, emptyBinding } from '../src/idmp/features/dashboard/bindingEngine.js'
import { createFieldCatalog, createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { collectDepartmentNames, normalizeDepartmentDataset } from '../src/idmp/features/dashboard/dimensionNames.js'
import { effectiveDrill, resolveDrillClickValue } from '../src/idmp/features/dashboard/drillDown.js'
import { applyIndicatorAnalysisToSource } from '../src/idmp/features/dashboard/visualization.js'
import { adaptDrillResult } from '../src/idmp/api/adapters/drill.js'
import { immutableResultRows } from '../src/idmp/features/dashboard/resultRows.js'
import { initialBackendChartNavigation, loadBackendChartLevel, loadBackendChartRoot, nextBackendChartNavigation, resolveChartDrillPath } from '../src/idmp/features/dashboard/backendChartDrill.js'

const path = { pathCode: 'CUSTOM_TCM_DEPT_DOCTOR', maxLevel: 'DOCTOR', levels: [
  { levelCode: 'ROOT', levelName: '全院' },
  { levelCode: 'DEPT', levelName: '科室', dimensionFieldCode: '科室', memberKeyFieldCode: '科室', displayFieldCode: '科室名称' },
  { levelCode: 'DOCTOR', levelName: '医生', dimensionFieldCode: '医生', memberKeyFieldCode: '医生', displayFieldCode: '医生名称' }
] }
const binding = field => ({ ...emptyBinding('backend'), dimensions: [{ field }], measures: [{ field: 'value', aggregation: 'sum' }] })
const dataset = rows => ({ id: 'backend', rows, fields: createFieldCatalog(rows) })

test('Chinese department labels are names while pie click values remain member codes', () => {
  const raw = dataset([{ 科室: '791', 科室名称: '血管外科', value: 12 }, { 科室: '30', 科室名称: '肾内科', value: 8 }])
  const normalized = normalizeDepartmentDataset(raw, { paths: [path] })
  const model = compileWidgetData('pie', binding('科室'), normalized)
  assert.deepEqual(model.categories, ['血管外科', '肾内科'])
  assert.equal(bindingChartOption('pie', model).series[0].data[0].dimensionValues.科室, '791')
  assert.equal(raw.rows[0].科室, '791')
})

test('configured display fields survive local drill hierarchy and return to the original chart', () => {
  const custom = { ...path, levels: [path.levels[0], { ...path.levels[1], dimensionFieldCode: '业务科室ID', memberKeyFieldCode: '业务科室ID', displayFieldCode: '业务科室显示名' }, path.levels[2]] }
  const raw = dataset([{ 业务科室ID: '791', 业务科室显示名: '血管外科', 医生: 'D1', 医生名称: '王医生', value: 12 }])
  const named = normalizeDepartmentDataset(raw, { paths: [custom] })
  const widget = { config: { dataBinding: binding('业务科室ID'), interaction: { drill: { hierarchy: ['业务科室ID', '医生'] } } } }
  const first = effectiveDrill(widget, named, { path: [] })
  const firstModel = compileWidgetData('pie', first.binding, first.dataset)
  assert.equal(firstModel.categories[0], '血管外科')
  const click = resolveDrillClickValue({ dataIndex: 0, name: '血管外科' }, first, firstModel)
  assert.equal(click, '791')
  const child = effectiveDrill(widget, named, { path: [click] })
  assert.deepEqual(compileWidgetData('pie', child.binding, child.dataset).categories, ['王医生'])
  assert.deepEqual(compileWidgetData('pie', effectiveDrill(widget, named, { path: [] }).binding, named).categories, ['血管外科'])
})

test('analysis presets and bound datasets share resolved department names', () => {
  const source = { code: 'catalog-example', name: '中药费用比例', origin: 'indicator-catalog', unit: '%' }
  const payload = { dataAvailable: true, overview: { value: 0.2 }, dimensionComparison: [{ value: 0.2, dimensions: { 科室: '791' } }] }
  const hydrated = applyIndicatorAnalysisToSource(source, payload, { '791': '血管外科' }, [path])
  assert.equal(hydrated.pieData[0].name, '血管外科')
  const comparison = createWidgetBindingDatasets(hydrated).find(item => item.id === 'departments')
  assert.deepEqual(compileWidgetData('pie', binding('科室'), comparison).categories, ['血管外科'])
  assert.equal(payload.dimensionComparison[0].dimensions.科室名称, undefined, 'source response is not mutated')
})

test('viewer and preview normalization preserve codes and expose missing-name diagnostics', () => {
  const raw = dataset([{ 科室: '791', value: 12 }])
  for (const id of ['viewer', 'preview']) {
    const named = normalizeDepartmentDataset({ ...raw, id }, { paths: [path], names: new Map([['791', '血管外科']]) })
    assert.equal(named.rows[0].科室, '791')
    assert.equal(named.rows[0].科室名称, '血管外科')
    assert.equal(compileWidgetData('pie', binding('科室'), named).categories[0], '血管外科')
  }
  const missing = normalizeDepartmentDataset(raw, { paths: [path], diagnostics: ['名称查询失败'] })
  assert.equal(compileWidgetData('pie', binding('科室'), missing).categories[0], '科室编码：791')
  assert.ok(missing.nameDiagnostics.includes('名称查询失败'))
  assert.equal(raw.rows[0].科室名称, undefined)
})

test('projected diagnostics count only unresolved dictionary members without changing cached rows', () => {
  const codes = [...Array.from({ length: 52 }, (_, index) => String(index + 1)), '833']
  const raw = { ...dataset(immutableResultRows(codes.map(code => ({ 科室: code, value: 1 })))), rowMode: 'PROJECTED' }
  const names = new Map(codes.slice(0, 52).map(code => [code, `科室${code}`]))
  const direct = { ...binding('科室'), measures: [{ field: 'value', aggregation: 'direct' }] }
  for (let attempt = 0; attempt < 2; attempt++) {
    const named = normalizeDepartmentDataset(raw, { paths: [path], names })
    assert.strictEqual(named.rows, raw.rows)
    assert.deepEqual(named.nameDiagnostics, ['1 个科室未返回名称，暂显示科室编码。'])
    const categories = compileWidgetData('pie', direct, named).categories
    assert.equal(categories.filter(name => name.startsWith('科室编码：')).length, 1)
    assert.equal(categories.at(-1), '科室编码：833')
    assert.deepEqual(raw.rows.map(row => row.科室), codes)
    assert.ok(raw.rows.every(row => !Object.hasOwn(row, '科室名称') && row.value === 1))
  }
  names.set('833', '历史科室名称')
  const updated = normalizeDepartmentDataset(raw, { paths: [path], names })
  assert.strictEqual(updated.rows, raw.rows)
  assert.deepEqual(updated.nameDiagnostics, [])
  assert.equal(compileWidgetData('pie', direct, updated).categories.at(-1), '历史科室名称')
})

test('missing-name diagnostics deduplicate codes and retain unrelated loader diagnostics', () => {
  const raw = { ...dataset([{ OUT_DEPT_CODE: '833', value: 1 }, { OUT_DEPT_CODE: '833', value: 2 }, { OUT_DEPT_CODE: '22', value: 3 }]), rowMode: 'PROJECTED' }
  const named = normalizeDepartmentDataset(raw, { names: new Map([['22', '泌尿外科']]), diagnostics: ['名称查询失败'] })
  assert.deepEqual(named.nameDiagnostics, ['名称查询失败', '1 个科室未返回名称，暂显示科室编码。'])
  assert.strictEqual(named.rows, raw.rows)
})

test('placeholder dictionary values do not suppress missing names and row names remain usable', () => {
  for (const placeholder of ['', '-', '833', '999']) {
    const raw = { ...dataset([{ OUT_DEPT_CODE: '833', value: 1 }, { OUT_DEPT_CODE: '22', OUT_DEPT_NAME: '泌尿外科', value: 2 }]), rowMode: 'PROJECTED' }
    const named = normalizeDepartmentDataset(raw, { names: new Map([['833', placeholder], ['22', '-']]) })
    assert.deepEqual(named.nameDiagnostics, ['1 个科室未返回名称，暂显示科室编码。'])
    const direct = { ...binding('OUT_DEPT_CODE'), measures: [{ field: 'value', aggregation: 'direct' }] }
    assert.deepEqual(compileWidgetData('pie', direct, named).categories, ['科室编码：833', '泌尿外科'])
  }
})

test('department names can be collected from Chinese, English and configured logical fields', () => {
  const names = collectDepartmentNames([{ dimensions: { 科室: '791', 科室名称: '血管外科' } }, { departmentCode: '30', departmentName: '肾内科' }], [path])
  assert.deepEqual(Object.fromEntries(names), { '30': '肾内科', '791': '血管外科' })
  const named = normalizeDepartmentDataset(dataset([{ out_dept_code: '30', out_dept_name: '肾内科', value: 1 }]))
  assert.deepEqual(named.rows[0], { out_dept_code: '30', out_dept_name: '肾内科', value: 1 }, 'do not add duplicate fields with different casing')
})

test('numeric member codes remain dimensions, and null slices do not shift click codes', () => {
  const rows = [{ 科室: 791, 科室名称: '血管外科', value: null }, { 科室: 30, 科室名称: '肾内科', value: 8 }]
  const normalized = normalizeDepartmentDataset(dataset(rows), { paths: [path] })
  const model = compileWidgetData('pie', binding('科室'), normalized)
  assert.equal(model.status, 'ready')
  const point = bindingChartOption('pie', model).series[0].data[0]
  assert.equal(point.name, '肾内科')
  assert.equal(point.dimensionValues.科室, 30)
})

test('custom organization drill uses configured path, display fields and raw parent keys', async () => {
  const calls = []
  const search = async (resultId, payload) => {
    calls.push(payload)
    assert.equal(payload.pathCode, path.pathCode)
    const records = payload.currentLevel === 'ROOT'
      ? [{ resultId: 'root', levelCode: 'ROOT', dimensionKey: 'hospital', dimensionName: '医院' }]
      : payload.currentLevel === 'DEPT'
        ? [{ resultId: 'dept', levelCode: 'DEPT', dimensionKey: '791', dimensionName: '791', dimensions: { 科室: '791', 科室名称: '血管外科' }, numerator: 12 }]
        : [{ resultId: 'doctor', levelCode: 'DOCTOR', dimensionKey: 'D1', dimensionName: 'D1', dimensions: { 医生: 'D1', 医生名称: '王医生' }, numerator: 12 }]
    return adaptDrillResult({ context: { resultId, snapshotId: 'snapshot', indicatorVersionId: 'version', pathCode: path.pathCode, currentLevel: payload.currentLevel, parentKeys: payload.parentKeys },
      records, pageInfo: { pageNum: payload.pageNum, pageSize: payload.pageSize, total: 1 }, nextLevels: payload.currentLevel === 'DEPT' ? ['DOCTOR'] : [], dataSource: 'live' })
  }
  assert.equal(resolveChartDrillPath([path], '科室'), path)
  const root = await loadBackendChartRoot(search, { resultId: 'root', path, indicatorVersionId: 'version' })
  const navigation = initialBackendChartNavigation(root)
  assert.equal(navigation.currentLevel, 'DEPT')
  const departments = await loadBackendChartLevel(search, root, navigation)
  assert.equal(departments.records[0].dimensionLabel, '血管外科')
  const next = nextBackendChartNavigation(departments, departments.records[0], navigation, root.maxLevel, root)
  assert.deepEqual(next.parentKeys, { 科室: '791' })
  const doctors = await loadBackendChartLevel(search, root, next)
  assert.equal(doctors.records[0].dimensionLabel, '王医生')
  assert.equal(departments.records[0].dimensionLabel, '血管外科', 'returning to saved department history keeps its names')
  assert.ok(calls.every(call => !['HOSPITAL', 'OUT_DEPT', 'ATTENDING_DOCTOR'].includes(call.currentLevel)))
})
