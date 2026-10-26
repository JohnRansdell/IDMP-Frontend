import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-trend-sections' })
const names = ['buildAnalysisParams', 'buildTrendAnalysisParams']
const functions = names.map(name => {
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(node, `Missing page function: ${name}`)
  return descriptor.scriptSetup.content.slice(node.start, node.end)
}).join('\n')

function page(selection = {}, filters = {}) {
  return Function(`
    const currentIndicatorVersionId = { value: '22' };
    const backendAnalysisGranularity = { value: 'MONTHLY' };
    const isSourceDefaultTrendRange = { value: false };
    const analysisPeriodRange = { value: [] };
    const reportFilterParams = { value: ${JSON.stringify(filters)} };
    const trendGrainFields = { value: Object.keys(${JSON.stringify(selection)}) };
    const trendGrainApplied = { value: ${JSON.stringify(selection)} };
    const isCompleteDateRange = range => range?.length === 2 && range.every(Boolean);
    ${functions}
    return { ${names.join(', ')} };
  `)()
}

test('all trend granularities request only TREND without changing main analysis sections', () => {
  const view = page()
  for (const granularity of ['MONTHLY', 'QUARTERLY', 'YEARLY', 'STATIC']) {
    assert.deepEqual(view.buildTrendAnalysisParams([], '22', granularity), {
      granularity, indicatorVersionId: '22', sections: 'TREND'
    })
    assert.equal(view.buildAnalysisParams([], '22', granularity).sections, undefined)
  }
})

test('both overview and trend preserve inherited dashboard filters', () => {
  const filters = { 'filter.OUT_DEPT_CODE': ['15', '16'] }
  const view = page({}, filters)
  assert.deepEqual(view.buildAnalysisParams()['filter.OUT_DEPT_CODE'], ['15', '16'])
  assert.deepEqual(view.buildTrendAnalysisParams([], '22', 'MONTHLY')['filter.OUT_DEPT_CODE'], ['15', '16'])
})

test('trend isolation preserves period boundaries and exact combination members', () => {
  const view = page({ OUT_DEPT_CODE: ['10'], IN_ICD10: ['A'] })
  assert.deepEqual(view.buildTrendAnalysisParams(['2026-03-01', '2026-04-30'], '22', 'MONTHLY'), {
    granularity: 'MONTHLY', indicatorVersionId: '22', sections: 'TREND',
    periodStart: '2026-03-01', periodEnd: '2026-04-30', grainSelection: 'EXACT',
    'filter.OUT_DEPT_CODE': ['10'], 'filter.IN_ICD10': ['A']
  })
  assert.deepEqual(view.buildTrendAnalysisParams(['2026-03-01', '2026-04-30'], '22', 'STATIC'), {
    granularity: 'STATIC', indicatorVersionId: '22', sections: 'TREND'
  })
})
