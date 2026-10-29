import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { analysisModuleRouteKey, analysisRouteKey, reportPeriodQuery, resolveReportPeriod } from '../src/idmp/features/analysis/reportPeriod.js'
import { normalizeReportFilters, replaceReportFilterQuery } from '../src/idmp/features/analysis/reportDimensions.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-module-isolation' })
const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'applyReportPeriod')
const apply = descriptor.scriptSetup.content.slice(node.start, node.end)

test('report-only URL changes preserve independent module context while indicator and drill navigation reset it', () => {
  const route = { indicator: '指标一', indicatorVersionId: '版本一', trendStart: '2026-01-01', trendEnd: '2026-03-31',
    drillResultId: '结果一', drillStartLevel: 'OUT_DEPT', drillParentKeys: '{"OUT_DEPT_CODE":"15"}' }
  const key = analysisModuleRouteKey(route)
  assert.equal(analysisModuleRouteKey({ ...route, periodStart: '2025-12-01', periodEnd: '2025-12-31',
    granularity: 'CUSTOM', summaryMode: 'INSTANT', 'filter.OUT_DEPT_CODE': ['测试门诊'] }), key)
  assert.notEqual(analysisModuleRouteKey({ ...route, indicatorVersionId: '版本二' }), key)
  assert.notEqual(analysisModuleRouteKey({ ...route, drillResultId: '结果二' }), key)
  assert.notEqual(analysisModuleRouteKey({ ...route, trendStart: '2026-02-01' }), key)
})

for (const [name, filters, range, parameters] of [
  ['科室筛选', { 科室: ['不存在的科室'] }, ['2025-12-01', '2025-12-31'], {}],
  ['医生与自定义区间', { 医生: ['300112'] }, ['2026-01-15', '2026-03-12'], {}],
  ['业务运行参数', {}, ['2026-01-01', '2026-01-31'], { 年龄下限: 65 }]
]) test(`${name}仅提交顶部查询，不清空或重新加载下方模块`, async () => {
  const ref = value => ({ value })
  const route = { query: { indicator: '指标一', indicatorVersionId: '版本一', drillResultId: '结果一', drillStartLevel: 'OUT_DEPT' } }
  const calls = []
  const lower = { trend: { 性别: '2' }, rankPeriod: '2026-03', drillLevel: 'ATTENDING_DOCTOR' }
  const before = structuredClone(lower)
  const dependencies = {
    route, router: { replace: async ({ query }) => { route.query = query } },
    reportSubmitting: ref(false), rangeSummaryLoading: ref(false), currentIndicatorVersionId: ref('版本一'),
    backendAnalysisGranularity: ref('MONTHLY'), reportPeriodRange: ref(range),
    indicatorRuntimeParameters: ref([]), indicatorRuntimeParameterValues: ref(parameters),
    reportFilterDraft: ref(filters), reportFilters: ref({}), reportDimensionMetadata: ref([]),
    reportSelection: ref(resolveReportPeriod(range, 'MONTHLY', { filters, parameters })), reportSummaryGranularity: ref('MONTHLY'),
    validateOptionalDateRange: () => true, validateSqlRuntimeParameterValues: () => '',
    isCompleteDateRange: value => value?.length === 2 && value.every(Boolean),
    normalizeReportFilters, replaceReportFilterQuery, analysisRouteKey, reportPeriodQuery,
    loadRangeSummary: async () => calls.push('报告查询'),
    ElMessage: { warning: message => assert.fail(message), error: message => assert.fail(message) },
    overviewQuery: { clear: () => assert.fail('不能清空独立正式结果') },
    refreshTrendAnalysis: () => assert.fail('不能触发趋势查询'),
    trendGrainDraft: ref(lower.trend), trendGrainApplied: ref(lower.trend),
    drillStartLevel: ref(lower.drillLevel), drillParentKeys: ref({ 科室: '15' })
  }
  const run = Function('dependencies', `const { ${Object.keys(dependencies).join(',')} } = dependencies;
    let localReportRouteKey = ''; ${apply}; return applyReportPeriod;`)(dependencies)
  await run()
  assert.deepEqual(calls, ['报告查询'])
  assert.deepEqual(lower, before)
  assert.equal(route.query.drillResultId, '结果一')
  assert.equal(dependencies.drillStartLevel.value, 'ATTENDING_DOCTOR')
  assert.deepEqual(dependencies.trendGrainApplied.value, { 性别: '2' })
})

test('ranking and both temporal and static drill receive no report filter props', () => {
  assert.doesNotMatch(descriptor.template.content, /:(?:filters|start-filters)="reportFilters"/)
  const ranking = descriptor.scriptSetup.content.slice(descriptor.scriptSetup.content.indexOf('const rankPeriodProps'),
    descriptor.scriptSetup.content.indexOf('const rankPeriodDescription'))
  assert.doesNotMatch(ranking, /reportFilters|reportFilterDraft/)
})
