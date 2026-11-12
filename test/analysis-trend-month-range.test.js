import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { trendResultMonthRange } from '../src/idmp/features/analysis/trendPresentation.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const trendSource = await readFile(new URL('../src/idmp/features/analysis/AnalysisTrend.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-trend-month-range' })
const names = ['normalizeTrendMonthRange', 'initialAnalysisPeriodRange', 'normalizeDateValue']
const functions = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(node, `Missing page function: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function page(query = {}, remembered = []) {
  return Function('route', 'readRememberedAnalysisPeriod', `
    ${functions}
    return { ${names.join(', ')} };
  `)({ query }, () => remembered)
}

test('trend picker selects months while report period picker remains date-based', () => {
  const picker = trendSource.match(/<el-date-picker v-model="trendMonthRange"[^>]*\/>/)[0]
  assert.match(picker, /type="monthrange"/)
  assert.match(picker, /value-format="YYYY-MM"/)
  assert.match(descriptor.template.content, /v-model="reportPeriodRange"\s+type="daterange"/)
})

test('month selection includes the entire final month, leap February and year boundaries', () => {
  const view = page()
  for (const [range, expected] of [
    [['2026-03', '2026-04'], ['2026-03-01', '2026-04-30']],
    [['2024-02', '2024-02'], ['2024-02-01', '2024-02-29']],
    [['2026-02', '2026-02'], ['2026-02-01', '2026-02-28']],
    [['2026-12', '2027-01'], ['2026-12-01', '2027-01-31']]
  ]) assert.deepEqual(view.normalizeTrendMonthRange(range), expected)
})

test('clearing or invalid month ranges never produce malformed API dates', () => {
  for (const range of [null, [], ['2026-03'], ['', ''], ['2026-13', '2026-14'], ['2026-04', '2026-03']]) {
    assert.deepEqual(page().normalizeTrendMonthRange(range), [])
  }
})

test('old URLs and remembered ranges normalize to complete months', () => {
  assert.deepEqual(page({ trendStart: '2026-03-15', trendEnd: '2026-04-02' }).initialAnalysisPeriodRange(),
    ['2026-03-01', '2026-04-30'])
  assert.deepEqual(page({}, ['2026-03-15', '2026-04-02']).initialAnalysisPeriodRange(),
    ['2026-03-01', '2026-04-30'])
})

test('default picker bounds come from formal trend periods rather than source availability', () => {
  const payload = { dataAvailable: true, granularity: 'MONTHLY', trend: [
    { periodStart: '2026-04-01' }, { periodStart: '2026-02-01' }
  ] }
  assert.deepEqual(trendResultMonthRange(payload, 'MONTHLY'), ['2026-02', '2026-04'])
  assert.deepEqual(trendResultMonthRange({ ...payload, granularity: 'QUARTERLY', trend: [
    { periodStart: '2026-02-01' }, { periodStart: '2026-08-01' }
  ] }, 'QUARTERLY'), ['2026-01', '2026-09'])
  assert.deepEqual(trendResultMonthRange({ ...payload, granularity: 'YEARLY', trend: [
    { periodStart: '2025-01-01' }, { periodStart: '2026-01-01' }
  ] }, 'YEARLY'), ['2025-01', '2026-12'])
  assert.deepEqual(trendResultMonthRange({ ...payload, trend: [] }, 'MONTHLY'), [])
})

test('custom report ranges do not seed the independent trend period', () => {
  assert.deepEqual(page({ granularity: 'CUSTOM', periodStart: '2025-12-01', periodEnd: '2025-12-31' })
    .initialAnalysisPeriodRange(), [])
})
