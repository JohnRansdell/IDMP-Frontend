import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { computed, ref } from 'vue'

const { descriptor } = parse(await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8'))
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-performance-target' })
const names = ['resolveAnalysisPerformanceTarget', 'createGenericAnalysisProfile', 'emptyTrend',
  'isUsableRawValue', 'isUsableDisplayValue', 'formatMetricValue', 'normalizeTrendValue', 'isChartNumber']
const functions = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(node, `Missing page function: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')
const computedSource = ['currentProfile', 'trendSeries'].map(name => {
  const node = scriptSetupAst.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name))
  assert.ok(node, `Missing page computed: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function page(unit = '') {
  return Function('computed', 'ref', `
    const selectedBackendIndicator = ref({ id: '10', name: 'Mortality', unit: ${JSON.stringify(unit)} });
    const currentIndicatorVersionId = ref('11');
    const indicatorCode = ref('10');
    const route = { query: {} };
    const trendBackendAnalysis = ref(null), backendAnalysis = ref(null);
    const currentTrend = ref({ actual: [0.0038767886], peer: [] });
    const hasPeerTrend = ref(false);
    const getBackendIndicatorKey = indicator => indicator.id || indicator.code;
    ${functions}
    ${computedSource}
    return { currentProfile, trendSeries, currentIndicatorVersionId, trendBackendAnalysis, backendAnalysis };
  `)(computed, ref)
}
const target = (value = 0.003, display = '0.30%', versionId = '11') => ({
  indicatorVersionId: versionId, targetValue: value, targetDisplayValue: display,
  improvementDirection: 'LOWER_IS_BETTER'
})
const response = (performanceTarget, versionId = '11') => ({ indicatorVersionId: versionId, performanceTarget })

test('actual page consumes the version target from TREND even when overview is unavailable', () => {
  const view = page()
  view.trendBackendAnalysis.value = response(target())
  assert.equal(view.currentProfile.value.targetLabel, '目标值：0.30%')
  assert.equal(view.currentProfile.value.markLineValue, 0.003)
  assert.equal(view.trendSeries.value[0].markLine.data[0].yAxis, 0.003)
  assert.equal(view.trendSeries.value[0].markLine.precision, -1)
  assert.equal(view.trendSeries.value[0].markLine.label.formatter, '目标值：0.30%')
})

test('target coordinates use the same percent conversion as the trend, without double scaling', () => {
  const view = page('%')
  view.backendAnalysis.value = response(target())
  assert.equal(view.currentProfile.value.markLineValue, 0.3)
  assert.equal(view.trendSeries.value[0].markLine.data[0].yAxis, 0.3)
  assert.equal(view.currentProfile.value.targetLabel, '目标值：0.30%')
})

test('missing and invalid targets never fabricate a zero line but a genuine zero target is drawn', () => {
  const view = page('%')
  for (const value of [null, undefined, '', ' ', 'invalid', Infinity]) {
    view.trendBackendAnalysis.value = response({ ...target(), targetValue: value })
    assert.equal(view.currentProfile.value.targetLabel, '目标值未配置')
    assert.equal(view.trendSeries.value[0].markLine, undefined)
  }
  view.trendBackendAnalysis.value = response(null)
  assert.equal(view.trendSeries.value[0].markLine, undefined)
  view.trendBackendAnalysis.value = response(target(0, '0.00%'))
  assert.equal(view.trendSeries.value[0].markLine.data[0].yAxis, 0)
  assert.equal(view.currentProfile.value.targetLabel, '目标值：0.00%')
})

test('switching versions does not reuse stale targets and explicit removal does not revive older data', () => {
  const view = page()
  view.backendAnalysis.value = response(target())
  assert.ok(view.trendSeries.value[0].markLine)
  view.currentIndicatorVersionId.value = '12'
  assert.equal(view.trendSeries.value[0].markLine, undefined)
  view.trendBackendAnalysis.value = response(target(5, '5', '11'), '12')
  assert.equal(view.trendSeries.value[0].markLine, undefined)
  view.trendBackendAnalysis.value = response(target(5, '5', '12'), '12')
  assert.equal(view.trendSeries.value[0].markLine.data[0].yAxis, 5)
  view.currentIndicatorVersionId.value = '11'
  view.trendBackendAnalysis.value = response(null)
  assert.equal(view.trendSeries.value[0].markLine, undefined)
})

test('numeric targets without backend display text have a unit-aware label', () => {
  const view = page('%')
  view.backendAnalysis.value = response(target('0.003', ''))
  assert.equal(view.currentProfile.value.targetLabel, '目标值：0.30%')
})
