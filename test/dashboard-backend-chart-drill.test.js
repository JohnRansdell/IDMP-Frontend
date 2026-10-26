import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { computed, reactive, ref } from 'vue'
import {
  backendChartMeasure, backendChartValue, findBackendChartRow, loadBackendChartLevel,
  loadBackendChartRoot, nextBackendChartNavigation, projectedDrillNavigation
} from '../src/idmp/features/dashboard/backendChartDrill.js'

test('range drill keeps its dates across paged requests and rejects a single-month response', async () => {
  const periodRange = { periodStart: '2026-02-01', periodEnd: '2026-05-01' }
  const root = await loadBackendChartRoot(() => assert.fail('range entry must not reload analysis'), {
    resultId: '55', indicatorVersionId: '10',
    drillContext: { resultId: '55', snapshotId: '66', currentLevel: 'DOCTOR', parentKeys: { 科室: '15' }, filters: {}, periodRange },
    path: { levels: [{ levelCode: 'DEPT', dimensionFieldCode: '科室' }, { levelCode: 'DOCTOR', dimensionFieldCode: '医生' }], maxLevel: 'DOCTOR' }
  })
  const navigation = { currentLevel: 'DOCTOR', parentKeys: { 科室: '15' } }
  const response = { context: { resultId: '55', snapshotId: '66', indicatorVersionId: '10', currentLevel: 'DOCTOR', ...periodRange },
    records: [], pageInfo: { hasTotal: true, hasPageNum: true, hasPageSize: true, total: 201, pageNum: 1, pageSize: 200 } }
  const pages = []
  const result = await loadBackendChartLevel(async (id, payload) => {
    assert.deepEqual(payload.periodRange, periodRange)
    assert.deepEqual(payload.parentKeys, { 科室: '15' })
    pages.push(payload.pageNum)
    return { ...response, pageInfo: { ...response.pageInfo, pageNum: payload.pageNum },
      records: Array.from({ length: payload.pageNum === 1 ? 200 : 1 }, (_, index) => ({
        dimensionKey: String((payload.pageNum - 1) * 200 + index), levelCode: 'DOCTOR', indicatorValue: 0.1
      })) }
  }, root, navigation)
  assert.deepEqual(pages, [1, 2])
  assert.equal(result.records.length, 201)
  await assert.rejects(loadBackendChartLevel(async () => ({ ...response, context: { ...response.context, periodEnd: '2026-03-01' } }), root, navigation), /统计区间不一致/)
})

test('scoped medical drill uses supplied levels without switching to a generic path', async () => {
  const levels = [{ levelCode: 'OUT_DEPT', dimensionFieldCode: 'OUT_DEPT_CODE' }, { levelCode: 'DOCTOR', dimensionFieldCode: 'DOCTOR_NO' }]
  const root = await loadBackendChartRoot(() => assert.fail('must not fetch an unscoped root'), {
    resultId: '55', indicatorVersionId: '10',
    drillContext: { resultId: '55', snapshotId: '66', currentLevel: 'DOCTOR', parentKeys: { OUT_DEPT_CODE: '4101' }, filters: {} },
    path: { levels, maxLevel: 'DOCTOR' }
  })
  assert.deepEqual(root.levels, levels)
  assert.equal(root.pathCode, undefined)
  await loadBackendChartLevel(async (id, payload) => {
    assert.equal(id, '55'); assert.equal(payload.pathCode, undefined)
    return { context: { resultId: '55', snapshotId: '66', indicatorVersionId: '10', currentLevel: 'DOCTOR', pathCode: 'ORGANIZATION' },
      records: [], pageInfo: { hasTotal: true, hasPageNum: true, hasPageSize: true, total: 0, pageNum: 1, pageSize: 200 } }
  }, root, { currentLevel: 'DOCTOR', parentKeys: { OUT_DEPT_CODE: '4101' } })
})

test('projected drill uses stable identities rather than refreshed display names', () => {
  const path = { maxLevel: 'DOCTOR', levels: [
    { levelCode: 'ROOT' },
    { levelCode: 'DEPT', dimensionFieldCode: '科室', memberKeyFieldCode: '科室', displayFieldCode: '科室名称' },
    { levelCode: 'DOCTOR', dimensionFieldCode: '医生', memberKeyFieldCode: '医生', displayFieldCode: '医生名称' }
  ] }
  for (const name of ['骨科（东院）', '骨科(东院)', '科室新名称']) {
    assert.deepEqual(projectedDrillNavigation({ 科室: '9012', 科室名称: name }, path, {
      currentLevel: 'DEPT', parentKeys: {}, filters: { 科室: '9012', 病种: ['A'] }
    }), { filters: { 病种: ['A'] }, initialNavigation: { currentLevel: 'DOCTOR', parentKeys: { 科室: '9012' }, label: '所选成员' } })
  }
})

test('formal chart drill resolves the canonical root and skips an absent medical group level', async () => {
  const calls = []
  const search = async (resultId, payload) => {
    calls.push({ resultId, payload })
    if (payload.currentLevel === 'HOSPITAL') return {
      context: { resultId, currentLevel: 'HOSPITAL', snapshotId: resultId === 'department-anchor' ? 'old-snapshot' : 'organization-snapshot', indicatorVersionId: 'version-1' },
      records: [{ levelCode: 'HOSPITAL', resultId: 'canonical-root', dimensionKey: 'HOSPITAL-1' }], dataSource: 'live'
    }
    if (payload.currentLevel === 'OUT_DEPT') return {
      context: { resultId, currentLevel: 'OUT_DEPT', snapshotId: 'organization-snapshot', indicatorVersionId: 'version-1' },
      breadcrumb: [{ level: 'HOSPITAL', key: 'HOSPITAL-1' }], nextLevels: ['ATTENDING_DOCTOR'], dataSource: 'live',
      pageInfo: { hasTotal: true, hasPageNum: true, hasPageSize: true, total: 3, pageNum: 1, pageSize: 200 },
      records: [
        { resultId: 'row-a', levelCode: 'OUT_DEPT', dimensionKey: '17', dimensionLabel: 'MICU', indicatorValue: 0.2, displayValue: '20%', numerator: 1 },
        { resultId: 'row-b', levelCode: 'OUT_DEPT', dimensionKey: '9008', dimensionLabel: '呼吸科(东院)', indicatorValue: 0, displayValue: '0%', numerator: 0 },
        { resultId: 'row-c', levelCode: 'OUT_DEPT', dimensionKey: '9008', dimensionLabel: '呼吸科（东院）', indicatorValue: 0, displayValue: '0%', numerator: 0 }
      ]
    }
    throw new Error('unexpected request')
  }
  const target = { resultId: 'department-anchor', indicatorVersionId: 'version-1', maxLevels: { ORGANIZATION: 'ATTENDING_DOCTOR' }, configuredPaths: [{ pathCode: 'ORGANIZATION' }] }
  const root = await loadBackendChartRoot(search, target)
  assert.equal(root.resultId, 'canonical-root')
  assert.equal(root.snapshotId, 'organization-snapshot')
  const navigation = { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: root.hospitalCode }, label: '全部科室' }
  const result = await loadBackendChartLevel(search, root, navigation)
  assert.equal(result.records.length, 3, 'duplicate department codes with distinct published rows remain visible')
  const clicked = findBackendChartRow(result, { data: { row: result.records[2] } })
  assert.equal(clicked.resultId, 'row-c')
  assert.deepEqual(nextBackendChartNavigation(result, result.records[0], navigation, root.maxLevel), {
    currentLevel: 'ATTENDING_DOCTOR', parentKeys: { HOSPITAL_CODE: 'HOSPITAL-1', OUT_DEPT_CODE: '17' }, label: 'MICU'
  })
  assert.equal(backendChartValue(result.records[0], 'bar', '%'), 20)
  assert.equal(backendChartValue(result.records[0], 'pie', '%'), 0.2)
  assert.equal(calls.at(-1).payload.snapshotId, 'organization-snapshot')
})

test('pie drill uses unrounded indicator values rather than numerators or display percentages', () => {
  assert.equal(backendChartValue({ indicatorValue: 0.12345678, displayValue: '12.35%', numerator: 987 }, 'pie', '%'), 0.12345678)
  assert.equal(backendChartValue({ indicatorValue: '0.25', numerator: null }, 'pie'), 0.25)
  assert.equal(backendChartValue({ indicatorValue: 0, numerator: 987 }, 'pie'), 0)
  assert.equal(backendChartValue({ indicatorValue: 0.5, numerator: 0 }, 'pie'), 0.5)
  for (const indicatorValue of [null, undefined, '', ' ', '-', '12%', NaN, Infinity, -0.2, false, {}]) {
    assert.equal(backendChartValue({ indicatorValue, displayValue: '20%', numerator: 987 }, 'pie'), null)
  }
})

test('pie drill resolves the top-level selected measure without falling back to a different value', () => {
  const row = { indicatorValue: 0.25, numerator: 5, denominator: 20 }
  for (const [field, expected] of [['value', 0.25], ['indicatorValue', 0.25], ['numeratorValue', 5], ['numerator', 5], ['denominatorValue', 20], ['denominator', 20]]) {
    const measure = backendChartMeasure({ config: { dataBinding: { measures: [{ field }] } } })
    assert.equal(measure.error, '')
    assert.equal(backendChartValue(row, 'pie', '%', measure.field), expected)
    assert.equal(backendChartValue({ indicatorValue: 1 }, 'pie', '', field), expected === 0.25 ? 1 : null)
  }
  assert.equal(backendChartMeasure().field, 'value')
  const unknown = backendChartMeasure({ config: { dataBinding: { measures: [{ field: 'factor-x' }] } } })
  assert.match(unknown.error, /不支持.*factor-x/)
  assert.equal(backendChartValue(row, 'pie', '', unknown.field), null)
})

test('pie drill component updates values, series name and diagnostics with its top-level binding', async () => {
  const source = await readFile(new URL('../src/idmp/features/dashboard/components/BackendChartDrill.vue', import.meta.url), 'utf8')
  const block = source.slice(source.indexOf('const measure = computed('), source.indexOf('const chartOption = computed('))
  const props = reactive({ kind: 'pie', unit: '%', widget: { config: { dataBinding: { measures: [{ field: 'value', label: '指标值' }] } } } })
  const currentEntry = ref({ result: { records: [
    { dimensionLabel: '医生甲', indicatorValue: 0.25, displayValue: '25%', numerator: 5, denominator: 20 },
    { dimensionLabel: '医生乙', indicatorValue: 0.5, displayValue: '50%', numerator: 20, denominator: 40 }
  ] } })
  const { rawOption, chartIssue } = Function('computed', 'props', 'currentEntry', 'backendChartMeasure', 'backendChartValue', 'formatResultNumber', 'formatResultValue',
    `${block}; return { rawOption, chartIssue }`)(computed, props, currentEntry, backendChartMeasure, backendChartValue, formatResultNumber, formatResultValue)
  for (const [field, label, values] of [
    ['value', '指标值', [0.25, 0.5]], ['numeratorValue', '转科人次', [5, 20]], ['denominatorValue', '入院人次', [20, 40]], ['value', '指标值', [0.25, 0.5]]
  ]) {
    props.widget.config.dataBinding.measures = [{ field, label }]
    assert.equal(chartIssue.value, '')
    assert.equal(rawOption.value.series[0].name, label)
    assert.deepEqual(rawOption.value.series[0].data.map(point => point.value), values)
    assert.match(rawOption.value.tooltip.formatter({ data: rawOption.value.series[0].data[0] }), /指标值：25%.*分子：5.*分母：20/)
  }
  props.widget.config.dataBinding.measures = [{ field: 'numeratorValue', label: '转科人次' }]
  currentEntry.value.result.records[0].numerator = null
  assert.match(chartIssue.value, /转科人次存在缺失/)
  currentEntry.value.result.records.forEach(row => { row.numerator = 0 })
  assert.match(chartIssue.value, /转科人次均为 0/)
  props.widget.config.dataBinding.measures = [{ field: 'factor-x' }]
  assert.match(chartIssue.value, /不支持.*factor-x/)
})
import { formatResultNumber, formatResultValue } from '../src/idmp/features/shared/resultPresentation.js'
