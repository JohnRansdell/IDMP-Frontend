import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'static-period-test' })
const names = ['formatAnalysisPeriod', 'formatRange', 'formatTrendPeriodLabel', 'formatPeriodLabel', 'firstPresent']
const methods = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')
function page(granularity) {
  return Function('backendAnalysisGranularity', 'isCompleteDateRange', `${methods}; return { ${names.join(', ')} }`)(
    { value: granularity }, range => Array.isArray(range) && range.length === 2 && range.every(Boolean))
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
  assert.match(source, /v-if="backendAnalysisGranularity !== 'STATIC'" class="trend-controls"/)
})

test('temporal periods keep their real dates and missing target remains distinct from missing result', () => {
  const view = page('MONTHLY')
  const result = { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00' }
  assert.equal(view.formatAnalysisPeriod(result), '2026-03-01 ～ 2026-04-01')
  assert.equal(view.formatRange(['2026-03-01', '2026-03-31']), '2026-03-01 至 2026-03-31')
  assert.equal(view.formatTrendPeriodLabel(result, 'MONTHLY'), '2026-03')
  assert.match(source, /targetLabel: targetValue === null \? '目标值未配置'/)
})

test('updated time cannot use a statistical period end as an activation timestamp', () => {
  const node = scriptSetupAst.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'analysisUpdatedAt'))
  const code = descriptor.scriptSetup.content.slice(node.start, node.end)
  assert.doesNotMatch(code, /periodEnd/)
  assert.match(code, /context\.activatedAt/)
})
