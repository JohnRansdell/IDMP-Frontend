import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { namedTrendGrainOptions, trendGrainField } from '../src/idmp/features/analysis/trendGrain.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const { scriptSetupAst } = compileScript(descriptor, { id: 'independent-grain-test' })
const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'loadTrendGrainOptions')
const loadFunction = descriptor.scriptSetup.content.slice(node.start, node.end)

test('diagnosis candidates do not depend on other selected grain members', async () => {
  const requests = []
  const fields = ['OUT_DEPT_CODE', 'IN_ICD10']
  const state = {
    selectedBackendIndicator: { value: { id: '11' } }, currentIndicatorVersionId: { value: '22' },
    trendGrainFields: { value: fields }, trendPeriodDraft: { value: ['2026-03-01', '2026-04-30'] },
    isSourceDefaultTrendRange: { value: false }, trendGrainDraft: { value: { OUT_DEPT_CODE: '0850', IN_ICD10: 'A' } },
    trendGrainRequestGenerations: new Map(), trendGrainLoading: { value: {} },
    trendGrainMetadata: { value: fields.map(code => trendGrainField(code)) },
    trendGrainNameMaps: { value: { IN_ICD10: new Map() } }, trendGrainCandidates: { value: {} },
    isCompleteDateRange: range => range?.length === 2, isDepartmentCodeField: () => false,
    namedTrendGrainOptions,
    fetchIndicatorGrainOptions: async (id, params) => { requests.push({ id, params }); return [{ value: 'A', label: 'A' }] },
    ElMessage: { warning: message => assert.fail(message) }
  }
  const load = Function('state', `const { ${Object.keys(state).join(',')} } = state; ${loadFunction}; return loadTrendGrainOptions;`)(state)
  await load('IN_ICD10')
  assert.deepEqual(requests, [{ id: '11', params: { indicatorVersionId: '22', fieldCode: 'IN_ICD10', search: '', limit: 100,
    periodStart: '2026-03-01', periodEnd: '2026-04-30' } }])
  assert.deepEqual(state.trendGrainDraft.value, { OUT_DEPT_CODE: '0850', IN_ICD10: 'A' })
  assert.equal(state.trendGrainCandidates.value.IN_ICD10[0].value, 'A')
})

test('changing a grain member has no cascade-clear handler', () => {
  assert.doesNotMatch(descriptor.template.content, /clearFollowingTrendGrain/)
  assert.equal(scriptSetupAst.some(node => node.type === 'FunctionDeclaration' && node.id.name === 'clearFollowingTrendGrain'), false)
})

test('opening the select does not overwrite remote searches with an empty query', () => {
  assert.doesNotMatch(descriptor.template.content, /@visible-change="visible => visible && loadTrendGrainOptions/)
})

test('diagnosis code dimensions have concrete labels without inventing diagnosis names', () => {
  const field = trendGrainField('IN_ICD10', 1)
  assert.equal(field.label, '入院诊断编码')
  assert.deepEqual(namedTrendGrainOptions([{ value: 'R10.402', label: 'R10.402' }], field),
    [{ value: 'R10.402', label: 'R10.402', nameMissing: false }])
})
