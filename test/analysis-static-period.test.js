import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { formatPeriodLabel } from '../src/idmp/features/analysis/reportPeriod.js'
import { formatResultPeriod } from '../src/idmp/utils/periodRange.js'
import { formatTrendPeriodLabel } from '../src/idmp/features/analysis/trendPresentation.js'
import { diagnosticResultLabel } from '../src/idmp/features/analysis/calculationDiagnostics.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'static-period-test' })
const trendSource = await readFile(new URL('../src/idmp/features/analysis/AnalysisTrend.vue', import.meta.url), 'utf8')
const overviewSource = await readFile(new URL('../src/idmp/features/analysis/overviewPresentation.js', import.meta.url), 'utf8')
const names = ['formatAnalysisPeriod', 'formatRange', 'firstPresent']
const methods = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')
function page(granularity) {
  return Function('backendAnalysisGranularity', 'isCompleteDateRange', 'formatPeriodLabel', 'formatTrendPeriodLabel', 'formatResultPeriod', `${methods}; return { ${names.join(', ')}, formatTrendPeriodLabel }`)(
    { value: granularity }, range => Array.isArray(range) && range.length === 2 && range.every(Boolean), formatPeriodLabel, formatTrendPeriodLabel, formatResultPeriod)
}

test('static report, metric and trend labels never display persisted sentinel dates', () => {
  const view = page('STATIC')
  const result = { periodStart: '1000-01-01T00:00:00', periodEnd: '9999-12-31T23:59:59' }
  assert.equal(view.formatAnalysisPeriod(result), '静态结果')
  assert.equal(view.formatRange([result.periodStart, result.periodEnd]), '静态结果')
  assert.equal(view.formatTrendPeriodLabel(result, 'STATIC'), '静态结果')
})

test('static query with no dates and pending/empty results still has a meaningful label', () => {
  const view = page('STATIC')
  assert.equal(view.formatAnalysisPeriod(null), '静态结果')
  assert.equal(view.formatRange([]), '静态结果')
  assert.match(source, /backendAnalysisGranularity\.value !== 'STATIC' && !reportDirty\.value && !reportPeriodRange\.value\.length/)
  assert.match(trendSource, /v-if="!staticMode" class="trend-controls"/)
  assert.match(source, /:static-mode="backendAnalysisGranularity === 'STATIC'"/)
})

test('temporal periods keep their real dates and missing target remains distinct from missing result', () => {
  const view = page('MONTHLY')
  const result = { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00' }
  assert.equal(view.formatAnalysisPeriod(result), '2026-03-01 至 2026-03-31')
  assert.equal(view.formatRange(['2026-03-01', '2026-03-31']), '2026-03-01 至 2026-03-31')
  assert.equal(view.formatTrendPeriodLabel(result, 'MONTHLY'), '2026-03')
  assert.match(overviewSource, /targetLabel: targetValue === null \? '目标值未配置'/)
})

test('updated time cannot use a statistical period end as an activation timestamp', () => {
  const node = scriptSetupAst.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'analysisUpdatedAt'))
  const code = descriptor.scriptSetup.content.slice(node.start, node.end)
  assert.doesNotMatch(code, /periodEnd/)
  assert.match(code, /context\.activatedAt/)
})

async function computedFromComponent(path, name, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const { scriptSetupAst } = compileScript(descriptor, { id: 'period-label-regression' })
  const node = scriptSetupAst.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name))
  const code = descriptor.scriptSetup.content.slice(node.start, node.end)
  const computed = read => ({ get value() { return read() } })
  return Function('computed', ...Object.keys(dependencies), `${code}; return ${name}`)(computed, ...Object.values(dependencies))
}

for (const [name, granularity, period, expected] of [
  ['静态占位周期', 'STATIC', { periodStart: '1000-01-01T00:00:00', periodEnd: '9999-12-31T23:59:59' }, '静态结果'],
  ['静态无周期', 'STATIC', {}, '静态结果'],
  ['月度闭区间', 'MONTHLY', { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00' }, '2026-03-01 至 2026-03-31']
]) {
  test(`trial footer and diagnostic selection/trace agree: ${name}`, async () => {
    const row = { ...period, resultId: '123', value: 1 }
    const label = await computedFromComponent('../src/idmp/views/IndicatorEditor.vue', 'indicatorTrialPeriodLabel', {
      isStaticIndicator: { value: granularity === 'STATIC' }, selectedIndicatorTrialTarget: { value: period },
      indicatorTrialResultSet: { value: {} }, formatResultPeriod
    })
    assert.equal(label.value, expected)
    const trace = await computedFromComponent('../src/idmp/features/analysis/CalculationDiagnostics.vue', 'tracePeriod', {
      props: { granularity }, trace: { value: { context: period } }, formatResultPeriod
    })
    assert.equal(trace.value, expected)
    const options = await computedFromComponent('../src/idmp/features/analysis/CalculationDiagnostics.vue', 'options', {
      props: { granularity }, results: { value: [row] }, diagnosticResultLabel
    })
    assert.equal(options.value[0].label, `${expected} · 汇总结果 · 1 · #123`)
  })
}

test('SQL import period input and help text both declare inclusive endpoints', async () => {
  const source = await readFile(new URL('../src/idmp/views/SqlIndicatorImport.vue', import.meta.url), 'utf8')
  assert.match(source, /end-placeholder="结束时间（包含）"/)
  assert.match(source, /开始时间和结束时间均包含/)
  assert.doesNotMatch(source, /结束时间不包含/)
})
