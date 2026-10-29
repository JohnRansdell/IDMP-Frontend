import test from 'node:test'
import assert from 'node:assert/strict'
import { reportDimensionFields, normalizeReportFilters, reportFilterFields, replaceReportFilterQuery } from '../src/idmp/features/analysis/reportDimensions.js'
import { analysisFilters, analysisReportContext } from '../src/idmp/features/analysis/reportPeriod.js'
import { buildReportSummaryRequest } from '../src/idmp/features/analysis/reportQuery.js'

const version = { dimensionGrain: ['科室', '性别', '年龄段'], drillConfig: { drillPaths: [
  { pathCode: 'ORGANIZATION', maxLevel: 'DOCTOR', levels: [
    { levelCode: 'HOSPITAL', memberKeyFieldCode: 'HOSPITAL_CODE' },
    { levelCode: 'DEPARTMENT', levelName: '出院科室', memberKeyFieldCode: '科室', displayFieldCode: '科室名称' },
    { levelCode: 'DOCTOR', levelName: '主治医生', memberKeyFieldCode: '医生', displayFieldCode: '姓名' },
    { levelCode: 'PATIENT', memberKeyFieldCode: '住院号' }
  ] },
  { pathCode: 'CUSTOM_DIAGNOSIS', maxLevel: 'DIAGNOSIS', levels: [
    { levelCode: 'ROOT' }, { levelCode: 'DIAGNOSIS', levelName: '主要诊断', memberKeyFieldCode: '诊断' }
  ] }
] } }

test('report filters combine organization, custom paths and business grain without duplicate or virtual fields', () => {
  const fields = reportDimensionFields(version)
  assert.deepEqual(fields.map(field => field.code), ['科室', '医生', '诊断', '性别', '年龄段'])
  assert.equal(fields.find(field => field.code === '科室').role, 'DEPARTMENT')
  assert.equal(fields.find(field => field.code === '科室').grain, true)
  assert.equal(fields.find(field => field.code === '医生').label, '主治医生')
  assert.equal(fields.find(field => field.code === '诊断').label, '主要诊断')
})

test('maximum configured level and inactive legacy paths do not expose extra fields', () => {
  const copy = structuredClone(version)
  copy.drillConfig.drillPaths[0].maxLevel = 'DEPARTMENT'
  copy.drillConfig.drillPaths.push({ pathCode: 'TIME', levels: [{ memberKeyFieldCode: '月份' }] })
  assert.deepEqual(reportDimensionFields(copy).map(field => field.code), ['科室', '诊断', '性别', '年龄段'])
  assert.deepEqual(reportDimensionFields({}), [])
})

test('distinct custom path fields are not silently treated as aliases of a member key', () => {
  const fields = reportDimensionFields({ drillConfig: { drillPaths: [{ pathCode: 'CUSTOM_REGION', maxLevel: 'AREA', levels: [
    { levelCode: 'AREA', memberKeyFieldCode: '地区编码', dimensionFieldCode: '行政区划', displayFieldCode: '地区名称' }
  ] }] } })
  assert.deepEqual(fields.map(item => item.code), ['地区编码', '行政区划', '地区名称'])
  assert.deepEqual(normalizeReportFilters({ 行政区划: ['城区'] }, fields), { 行政区划: ['城区'] })
})

test('dashboard filter values retain multiple selections, zero and opaque codes; clearing removes a field', () => {
  const fields = [{ code: 'DEPT', aliases: [] }]
  assert.deepEqual(normalizeReportFilters({ dept: ['001', '002', '001'], DEPT: '003', 性别: 0, 诊断: [], 年龄: null }, fields), { DEPT: ['001', '002', '003'], 性别: ['0'] })
  assert.deepEqual(reportFilterFields(fields, { dept: ['001'], 原筛选: '保留' }).map(field => field.code), ['DEPT', '原筛选'])
})

test('editing route filters removes cleared values and invalidates the previous drill anchor', () => {
  const route = { indicator: '1', indicatorVersionId: '2', periodStart: '2026-03-01', periodEnd: '2026-03-31', granularity: 'MONTHLY',
    'filter.科室': ['15', '16'], 'filter.医生': '300112', drillResultId: 'old', drillStartLevel: 'DOCTOR', drillParentKeys: '{}' }
  const next = replaceReportFilterQuery(route, { 科室: ['15'], 医生: [], 性别: ['2'] })
  assert.deepEqual(analysisFilters(next), { 科室: ['15'], 性别: ['2'] })
  assert.equal(next.drillResultId, undefined)
  assert.equal(next.indicatorVersionId, '2')
  assert.equal(analysisReportContext(next).mode, 'INSTANT')
  assert.equal(analysisReportContext(replaceReportFilterQuery(next, {})).mode, 'FORMAL')
  assert.deepEqual(route['filter.科室'], ['15', '16'])
})

test('partial combination, doctor and custom path filters remain WHERE selections, never output grouping', () => {
  for (const filters of [{ 性别: ['2'] }, { 科室: ['15', '16'], 医生: ['300112'] }, { 诊断: ['J18', 'I10'], 年龄段: ['老年'] }]) {
    const result = buildReportSummaryRequest({ indicatorId: '1', versionId: '2', range: ['2026-03-01', '2026-03-31'], granularity: 'MONTHLY', filters, parameters: { 年龄下限: 65 } })
    assert.equal(result.mode, 'INSTANT')
    assert.equal(result.payload.summaryOnly, true)
    assert.equal(result.payload.periodEnd, '2026-04-01T00:00:00')
    assert.deepEqual(result.payload.filters, filters)
    assert.deepEqual(result.payload.parameters, { 年龄下限: 65 })
    assert.equal(result.payload.grouping, undefined)
  }
})
