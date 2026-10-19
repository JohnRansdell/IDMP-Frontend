import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { reactive, isReactive } from 'vue'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
import { immutableResultRows } from '../src/idmp/features/dashboard/resultRows.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { normalizeDepartmentDataset } from '../src/idmp/features/dashboard/dimensionNames.js'

const apiSource = (await readFile(new URL('../src/idmp/api/modules/analysisDashboard.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const loadApi = requestJson => Function('requestJson', 'expandDashboardResponse', `${apiSource}; return { queryDashboard, previewDashboardWidget }`)(requestJson, expandDashboardResponse)

const columns = (records, names) => ({ rowCount: records.length, columns: names.map(name => ({ name, values: records.map(row => row[name]), indices: null })) })
function fixture() {
  return { responseFormat: 'COLUMNAR', formatVersion: 1, widgets: {
    bar: { status: 'READY', dataSetId: 'd1' }, table: { status: 'READY', dataSetId: 'd1' }
  }, dataSets: { d1: { fields: [],
    rows: { rowCount: 3, columns: [
      { name: 'resultId', values: ['9007199254740993', '9007199254740994', '9007199254740995'], indices: null },
      { name: 'value', values: [0, null], indices: [0, 1, -1] },
      { name: 'drillContext', values: [null], indices: [-1, 0, -1] }
    ] },
    contextIds: ['c1', null, 'c1'], filters: columns([{ department: '001' }, {}, { department: '002' }], ['department']),
    nullFilters: [2], drillContexts: { c1: { resultId: '9007199254740993', snapshotId: '9007199254740996', filters: {}, fieldLevels: { department: 1 } } }
  } } }
}

test('column dictionaries preserve large IDs, zero, null, absent keys and exact drill filters', () => {
  const input = fixture()
  // 缺失值用 -1 表达，区别于显式 null。
  input.dataSets.d1.filters.columns[0] = { name: 'department', values: ['001', '002'], indices: [0, -1, 1] }
  const original = structuredClone(input)
  const result = expandDashboardResponse(input)
  assert.deepEqual(input, original)
  assert.equal(result.widgets.bar.rows, result.widgets.table.rows)
  const [first, second, third] = result.widgets.bar.rows
  assert.equal(first.resultId, '9007199254740993')
  assert.equal(first.value, 0)
  assert.deepEqual(first.drillContext.filters, { department: '001' })
  assert.equal(second.value, null)
  assert.equal(second.drillContext, null)
  assert.ok(!Object.hasOwn(third, 'value'))
  assert.equal(third.drillContext.filters, null)
  assert.equal(isReactive(reactive(result).widgets.bar.rows[0]), false)
})

test('malformed columns are rejected instead of showing incomplete or mismatched data', () => {
  for (const mutate of [
    data => { data.rows.rowCount = -1 },
    data => { data.rows.columns[0].values.pop() },
    data => { data.rows.columns[1].indices[0] = 3 },
    data => { data.rows.columns[1].indices[0] = -2 },
    data => { data.rows.columns[1].indices.pop() },
    data => { data.rows.columns.push(data.rows.columns[0]) },
    data => { data.filters.rowCount = 2 },
    data => { data.contextIds.pop() },
    data => { data.contextIds[0] = 'missing' },
    data => { data.nullFilters = [3] },
    data => { data.fields = null }
  ]) {
    const input = fixture()
    mutate(input.dataSets.d1)
    assert.throws(() => expandDashboardResponse(input), /看板数据格式不完整/)
  }
})

test('column names cannot mutate prototypes during decoding', () => {
  const input = fixture()
  input.dataSets.d1.rows.columns.push({ name: '__proto__', values: [{ injected: true }], indices: [0, 0, 0] })
  const result = expandDashboardResponse(input)
  const row = result.widgets.bar.rows[0]
  assert.equal(Object.getPrototypeOf(row), Object.prototype)
  assert.equal(Object.hasOwn(row, '__proto__'), true)
  assert.deepEqual(row.__proto__, { injected: true })
  assert.equal({}.injected, undefined)
})

test('dashboard and preview API wrappers request and decode columnar results', async () => {
  const calls = []
  const api = loadApi(async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) })
    const result = fixture()
    if (path.endsWith('/preview')) result.widgets = { preview: result.widgets.bar }
    return result
  })
  const batch = await api.queryDashboard('10', { granularity: 'MONTHLY' })
  const preview = await api.previewDashboardWidget({ widget: { code: 'group::item' } })
  assert.equal(calls[0].body.responseFormat, 'COLUMNAR')
  assert.equal(calls[0].body.granularity, 'MONTHLY')
  assert.equal(calls[1].body.responseFormat, 'COLUMNAR')
  assert.match(calls[1].body.widget.code, /^PREVIEW_[0-9a-f]+$/)
  assert.deepEqual(preview, batch.widgets.bar)
  assert.equal(preview.rows[0].resultId, '9007199254740993')
})

test('explicit full format and original preview contract remain available', async () => {
  const original = { fields: [], rows: [{ value: 0 }], status: 'READY' }
  const api = loadApi(async (path, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.responseFormat, 'FULL')
    return path.endsWith('/preview') ? original : { widgets: { bar: original } }
  })
  assert.equal((await api.queryDashboard('10', { responseFormat: 'FULL' })).widgets.bar, original)
  assert.equal(await api.previewDashboardWidget({ responseFormat: 'FULL', widget: { code: 'bar' } }), original)
})

const fields = [
  { id: 'department', code: 'department', label: '科室', dataType: 'string', semanticType: 'dimension', role: 'DIMENSION' },
  { id: 'departmentName', code: 'departmentName', label: '科室名称', dataType: 'string', semanticType: 'dimension', role: 'DIMENSION' },
  { id: 'value', code: 'value', label: '值', dataType: 'number', semanticType: 'measure', role: 'MEASURE', aggregations: ['sum', 'avg'] }
]
const binding = { dimensions: [{ field: 'department' }], series: [], measures: [{ field: 'value', aggregation: 'sum' }], sort: [] }

test('identical chart and table bindings share grouping without sharing sort or zero filtering', () => {
  let dimensionReads = 0
  const rows = immutableResultRows(['A', 'B', 'A'].map((department, index) => Object.freeze({
    get department() { dimensionReads++; return department }, departmentName: `${department}科`, value: index === 1 ? 0 : 1
  })))
  const dataset = { rows, fields }
  const bar = compileWidgetData('bar', binding, dataset)
  const reads = dimensionReads
  const table = compileWidgetData('table', { ...binding, sort: [{ field: 'department', direction: 'desc' }] }, dataset)
  assert.equal(dimensionReads, reads)
  assert.deepEqual(bar.categories, ['A科'])
  assert.deepEqual(table.categories, ['B科', 'A科'])
  assert.deepEqual(table.series[0].values, [0, 2])
  assert.deepEqual(compileWidgetData('table', binding, dataset).categories, ['A科', 'B科'])
  const changed = compileWidgetData('table', { ...binding, measures: [{ field: 'value', aggregation: 'avg' }] }, dataset)
  assert.deepEqual(changed.series[0].values, [1, 0])
})

test('mutable local datasets and replacement query results never reuse stale grouping', () => {
  const rows = [{ department: 'A', value: 1 }]
  const dataset = { rows, fields }
  assert.deepEqual(compileWidgetData('table', binding, dataset).categories, ['A'])
  rows[0].department = 'B'
  rows[0].value = 2
  assert.deepEqual(compileWidgetData('table', binding, dataset).categories, ['B'])
  const next = { rows: immutableResultRows([{ department: 'C', value: 3 }]), fields }
  assert.deepEqual(compileWidgetData('table', binding, next).categories, ['C'])
})

test('widgets share normalized server rows and skip deep proxies through dataset adaptation', () => {
  const rows = immutableResultRows([{ department: '001', departmentName: '内科', value: 1, periodStart: '2026-01-01T00:00:00' }])
  const first = normalizeDepartmentDataset(widgetResultToDataset({ rows, status: 'READY' }, fields))
  const second = normalizeDepartmentDataset(widgetResultToDataset({ rows, status: 'EMPTY' }, fields))
  assert.equal(first.rows, second.rows)
  assert.equal(second.status, 'EMPTY')
  assert.equal(isReactive(reactive({ dataset: first }).dataset.rows[0]), false)
  assert.throws(() => { first.rows[0].value = 999 }, TypeError)
})
