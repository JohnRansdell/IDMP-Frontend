import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { buildReportSummaryRequest } from '../src/idmp/features/analysis/reportQuery.js'
import { resolveReportPeriod } from '../src/idmp/features/analysis/reportPeriod.js'
import { buildSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'
import { useReportSummary } from '../src/idmp/features/analysis/useReportSummary.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'summary-loading' })
const functions = ['loadRangeSummary', 'invalidateReportSummary'].map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function harness() {
  const ref = value => ({ value })
  const state = {
    reportDirty: ref(false), selectedBackendIndicator: ref({ id: '11' }), currentIndicatorVersionId: ref('22'),
    reportSelection: ref(resolveReportPeriod(['2026-01-01', '2026-01-31'], 'MONTHLY')),
    reportFilters: ref({ OUT_DEPT_CODE: ['15'] }), indicatorRuntimeParameters: ref([]), indicatorRuntimeParameterValues: ref({}),
    rangeSummary: ref(null), rangeSummaryErrorMessage: ref(''), rangeSummaryLoading: ref(false),
    runtimeQueryResult: ref(null), runtimeQueryExpanded: ref([]), reportParameterSnapshot: ref({})
  }
  const calls = [], warnings = []
  const permission = { allowed: true }
  const api = kind => (id, input, options) => new Promise((resolve, reject) => calls.push({ kind, id, input, ...options, resolve, reject }))
  const reportQuery = useReportSummary({ canRequest: () => permission.allowed, fetchFormal: api('FORMAL'),
    fetchInstant: api('INSTANT'), notify: text => warnings.push(text) })
  Object.assign(state, { rangeSummary: reportQuery.summary, rangeSummaryLoading: reportQuery.loading,
    rangeSummaryErrorMessage: reportQuery.error, runtimeQueryResult: reportQuery.runtime, reportParameterSnapshot: reportQuery.parameters })
  const dependencies = {
    buildReportSummaryRequest, buildSqlRuntimeParameterValues, reportQuery
  }
  const methods = Function('state', 'dependencies', `
    const { ${Object.keys(state).join(', ')} } = state;
    const { ${Object.keys(dependencies).join(', ')} } = dependencies;
    ${functions}
    return { loadRangeSummary, invalidateReportSummary };
  `)(state, dependencies)
  return { ...state, ...methods, calls, warnings, permission }
}

test('switching from formal to custom cannot restore an older formal result', async () => {
  const view = harness()
  const old = view.loadRangeSummary()
  view.reportSelection.value = resolveReportPeriod(['2026-02-01', '2026-04-30'], 'CUSTOM')
  view.currentIndicatorVersionId.value = '23'
  const current = view.loadRangeSummary()
  assert.deepEqual(view.calls.map(call => call.kind), ['FORMAL', 'INSTANT'])
  assert.equal(view.calls[1].id, '23')
  assert.equal(view.calls[0].signal.aborted, true)
  assert.equal(view.calls[1].signal.aborted, false)
  view.calls[1].resolve({ executionMode: 'AD_HOC_SOURCE', grainFieldCodes: [], rows: [{ value: 8 / 1574, numeratorValue: 8, denominatorValue: 1574 }] })
  await current
  view.calls[0].resolve({ value: 0.99 })
  await old
  assert.equal(view.rangeSummary.value.value, 8 / 1574)
  assert.equal(view.rangeSummaryLoading.value, false)
})

test('formal failures never trigger instant fallback and stale failures stay silent', async () => {
  const view = harness()
  const old = view.loadRangeSummary()
  const current = view.loadRangeSummary()
  view.calls[1].resolve({ value: 0.01 })
  await current
  view.calls[0].reject(new Error('旧请求失败'))
  await old
  assert.equal(view.warnings.length, 0)
  const failed = view.loadRangeSummary()
  view.calls[2].reject(new Error('暂无正式结果'))
  await failed
  assert.equal(view.calls.length, 3)
  assert.equal(view.rangeSummary.value, null)
  assert.match(view.rangeSummaryErrorMessage.value, /正式区间查询失败/)
})

test('editing conditions invalidates in-flight results without issuing a replacement request', async () => {
  const view = harness()
  const pending = view.loadRangeSummary()
  view.invalidateReportSummary()
  view.calls[0].resolve({ value: 0.99 })
  await pending
  assert.equal(view.reportDirty.value, true)
  assert.equal(view.rangeSummary.value, null)
  assert.equal(view.rangeSummaryLoading.value, false)
  assert.equal(view.calls.length, 1)
})

test('permission denial or missing version also invalidates earlier authorized requests', async () => {
  for (const denied of [true, false]) {
    const view = harness()
    const pending = view.loadRangeSummary()
    if (denied) view.permission.allowed = false
    else view.currentIndicatorVersionId.value = ''
    await view.loadRangeSummary()
    view.calls[0].resolve({ value: 0.99 })
    await pending
    assert.equal(view.rangeSummary.value, null)
    assert.equal(view.rangeSummaryLoading.value, false)
    assert.equal(view.calls.length, 1)
    if (denied) assert.match(view.rangeSummaryErrorMessage.value, /访问权限/)
  }
})
