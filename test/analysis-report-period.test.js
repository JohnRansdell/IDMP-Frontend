import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { buildSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'

// Execute the page's actual payload functions, without starting its unrelated API loaders.
const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-report-period-test' })
const names = ['normalizeDateValue', 'nextDayStart', 'reportQueryPayload']
const functions = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(node, `Missing page function: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function page(range, granularity = 'MONTHLY') {
  const state = {
    reportPeriodRange: { value: range }, backendAnalysisGranularity: { value: granularity }, reportFilters: { value: {} },
    indicatorRuntimeParameters: { value: [] }, indicatorRuntimeParameterValues: { value: {} }
  }
  const methods = Function('state', 'buildSqlRuntimeParameterValues', `
    const { ${Object.keys(state).join(', ')} } = state;
    ${functions}
    return { ${names.join(', ')} };
  `)(state, buildSqlRuntimeParameterValues)
  return { ...methods, ...state }
}

test('backend timestamps become date-only picker values and valid query boundaries', () => {
  const view = page([])
  const overview = { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-03-31T00:00:00' }
  view.reportPeriodRange.value = [overview.periodStart, overview.periodEnd].map(view.normalizeDateValue)
  assert.deepEqual(view.reportPeriodRange.value, ['2026-03-01', '2026-03-31'])
  assert.deepEqual(view.reportQueryPayload(), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('query serialization also accepts full timestamps without appending time twice', () => {
  const view = page(['2026-03-01T00:00:00', '2026-03-31T00:00:00'])
  assert.deepEqual(JSON.parse(JSON.stringify(view.reportQueryPayload())), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('date picker input retains inclusive end-day semantics across leap days and years', () => {
  for (const [start, end, next] of [
    ['2024-02-01', '2024-02-29', '2024-03-01'],
    ['2026-12-01', '2026-12-31', '2027-01-01'],
    ['2026-03-01', '2026-03-01', '2026-03-02']
  ]) {
    assert.deepEqual(page([start, end]).reportQueryPayload(), {
      summaryOnly: true, periodStart: `${start}T00:00:00`, periodEnd: `${next}T00:00:00`
    })
  }
})

test('timestamp normalization preserves the calendar date without timezone conversion', () => {
  const view = page(['2026-03-01T00:00:00.000+08:00', '2026-03-31T23:59:59.999+08:00'])
  assert.deepEqual(view.reportQueryPayload(), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('static queries still omit dates and retain declared runtime parameters', () => {
  const view = page([], 'STATIC')
  assert.deepEqual(view.reportQueryPayload(), { summaryOnly: true })
  view.indicatorRuntimeParameters.value = [{ code: 'deptCode', type: 'STRING' }]
  view.indicatorRuntimeParameterValues.value = { deptCode: '5' }
  assert.deepEqual(view.reportQueryPayload(), { summaryOnly: true, parameters: { deptCode: '5' } })
})

test('instant summary preserves multiple department and diagnosis members', () => {
  const view = page(['2026-02-01', '2026-04-30'])
  view.reportFilters.value = { OUT_DEPT_CODE: ['15', '16'], IN_ICD10: ['J18'] }
  assert.deepEqual(view.reportQueryPayload().filters, view.reportFilters.value)
  assert.doesNotMatch(source, /<label>查询方式<\/label>|带看板筛选的分析仅支持正式结果查询/)
  assert.match(source, /queryIndicatorSummary\(versionId, payload\)/)
})
