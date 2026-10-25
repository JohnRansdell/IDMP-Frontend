import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { computed, ref } from 'vue'
import { createAnalysisProfile, resolveAnalysisPerformanceTarget } from '../src/idmp/features/analysis/overviewPresentation.js'
import { createAnalysisTrendPresentation } from '../src/idmp/features/analysis/trendPresentation.js'

const { descriptor } = parse(await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8'))
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-performance-target' })
const computedSource = ['currentProfile', 'trendPresentation'].map(name => {
  const node = scriptSetupAst.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name))
  assert.ok(node, `Missing page computed: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function page(unit = '') {
  return Function('computed', 'ref', 'dependencies', `
    const { createAnalysisProfile, resolveAnalysisPerformanceTarget, createAnalysisTrendPresentation } = dependencies;
    const metricDisplay = ref(undefined);
    const selectedBackendIndicator = ref({ id: '10', name: '住院死亡率', unit: ${JSON.stringify(unit)} });
    const currentIndicatorVersionId = ref('11');
    const indicatorCode = ref('10');
    const route = { query: {} };
    const trendBackendAnalysis = ref(null), backendAnalysis = ref(null);
    const trendAnalysisGranularity = ref('MONTHLY'), analysisPeriodRange = ref([]), isSourceDefaultTrendRange = ref(false);
    ${computedSource}
    const trendSeries = computed(() => trendPresentation.value.option.series);
    const trendOption = computed(() => trendPresentation.value.option);
    return { currentProfile, trendSeries, trendOption, trendPresentation, currentIndicatorVersionId, trendBackendAnalysis, backendAnalysis, metricDisplay };
  `)(computed, ref, { createAnalysisProfile, resolveAnalysisPerformanceTarget, createAnalysisTrendPresentation })
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
  for (const value of [null, undefined, '', ' ', 'invalid', Infinity, false, true]) {
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

test('analysis uses version display rules for both trend and target coordinates without rounding the series', () => {
  const view = page('')
  view.metricDisplay.value = { format: 'PERCENT', multiplier: '100', scale: 3, roundingMode: 'HALF_EVEN' }
  view.backendAnalysis.value = response(target('0.003125', ''))
  assert.equal(view.currentProfile.value.markLineValue, 0.3125)
  assert.equal(view.currentProfile.value.unit, '%')
  assert.equal(view.currentProfile.value.targetLabel, '目标值：0.312%')
  view.trendBackendAnalysis.value = {
    dataAvailable: true, granularity: 'MONTHLY',
    trend: [{ periodStart: '2026-01-01', value: 0.003125 }]
  }
  assert.deepEqual(view.trendPresentation.value.trend.actual, [0.3125])
  assert.equal(view.trendPresentation.value.rows[0].actualDisplay, '0.312%')
  assert.equal(view.trendSeries.value[0].label.formatter({ value: 0.3125 }), '0.312%')
  assert.equal(view.trendSeries.value[0].animation, false)
  assert.equal(view.trendOption.value.yAxis.max({ max: 0.23 }), 0.3125)
  assert.equal(view.trendOption.value.yAxis.max({ max: 1 }), 1)
  view.backendAnalysis.value = response(target('-0.003', ''))
  assert.equal(view.trendOption.value.yAxis.min({ min: 0 }), -0.3)
  view.backendAnalysis.value = response(null)
  assert.equal(view.trendOption.value.yAxis.max, null)
})
