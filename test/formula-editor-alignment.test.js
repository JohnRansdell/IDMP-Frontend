import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseEditorFormula, zeroPolicy, zeroPolicyLabel } from '../src/idmp/features/indicator/formulaEditor.js'
import { buildArithmeticFormula, cloneFormula, createStatisticFunction, statisticMethods } from '../src/idmp/features/indicator/arithmeticFormula.js'
import { combineFormulaNodes } from '../src/idmp/api/adapters/indicator.js'
import { departmentAchievement } from '../src/idmp/features/analysis/departmentRanking.js'
import { computed, ref } from 'vue'

const source = readFileSync(new URL('../src/idmp/views/IndicatorEditor.vue', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
function body(name) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  return source.slice(start, end + 2)
}
const factor = id => ({ versionId: id, code: id, name: id })
const node = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id })
const add = (left, right) => ({ nodeType: 'BINARY', operator: 'ADD', left, right })
function editor() {
  const scope = { parseEditorFormula, zeroPolicy, zeroPolicyLabel, combineFormulaNodes, buildArithmeticFormula, cloneFormula, createStatisticFunction,
    advancedFormulaRoot: ref(null), advancedFormulaPayload: ref({}),
    formulaValid: ref(true), activeMode: ref({ kind: 'ratio', multiplier: '100%' }),
    numeratorFactors: ref([]), denominatorFactors: ref([]), zeroStrategy: ref('返回 NULL'),
    unsupportedFormula: ref(false), formulaHydrating: ref(false), savedFormulaDisplay: ref(null),
    savedFormulaDefinition: ref(null), savedEditorFormulaSignature: ref(''),
    formulaMode: ref(''), customOperator: ref('ADD'), statisticOperator: ref('AVG'),
    deathFactorVersionId: ref(''), dischargeFactorVersionId: ref(''),
    findFactorByVersionId: factor, createFormulaFactorPlaceholder: (_, id) => factor(id) }
  return { scope, ...Function(...Object.keys(scope), `${body('editorFormulaSignature')}\n${body('hydrateFormulaFactors')}\n${body('createIndicatorFormulaPayload')}\n${body('applySelectedFactorReferences')}\nreturn {hydrateFormulaFactors,createIndicatorFormulaPayload,applySelectedFactorReferences}`)(...Object.values(scope)) }
}

test('ordinary statistic mode shares the method catalog and FUNCTION payloads with nested formulas', () => {
  assert.ok(source.includes('v-for="[code, label] in statisticMethods"'))
  for (const [method] of statisticMethods) {
    const e = editor()
    e.scope.activeMode.value = { kind: 'statistic' }
    e.scope.statisticOperator.value = method
    e.scope.numeratorFactors.value = [factor('A'), factor('B')]
    const formula = e.createIndicatorFormulaPayload(0).formula
    const expected = createStatisticFunction(method, formula.root.arguments)
    assert.deepEqual(formula.root, { nodeId: 'statistic_root', ...expected })
    assert.deepEqual(parseEditorFormula(formula), { mode: '统计量型', left: ['A', 'B'], right: [], statistic: method })
  }
})

test('nested arithmetic and ROUND hydrate factor references and save the exact original definition', () => {
  const e = editor()
  const formula = { schemaVersion: '1.0', calculationMode: 'TEMPORAL', root: {
    nodeId: 'round', nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [{
      nodeId: 'multiply', nodeType: 'BINARY', operator: 'MUL', left: {
        nodeId: 'divide', nodeType: 'BINARY', operator: 'DIV', zeroDenominatorPolicy: 'ERROR',
        left: { nodeId: 'subtract', nodeType: 'BINARY', operator: 'SUB', left: node('A'), right: add(node('B'), node('C')) }, right: node('D')
      }, right: { nodeId: 'constant', nodeType: 'CONST', value: '100', typeDescriptor: { valueType: 'DECIMAL', dimension: 'ONE', unit: 'ONE' } }
    }] }, display: { format: 'NUMBER', multiplier: '1', scale: 3, roundingMode: 'HALF_EVEN' } }
  e.hydrateFormulaFactors(formula)
  assert.equal(e.scope.unsupportedFormula.value, false)
  assert.equal(e.scope.formulaMode.value, '嵌套公式型')
  assert.deepEqual(e.scope.numeratorFactors.value.map(f => f.versionId), ['A', 'B', 'C', 'D'])
  assert.deepEqual(e.createIndicatorFormulaPayload(3), { resourceVersion: 3, formula })
  e.scope.activeMode.value = { kind: 'advanced' }
  e.scope.advancedFormulaPayload.value = formula
  e.scope.advancedFormulaRoot.value.arguments[0].right.value = '200'
  const output = e.createIndicatorFormulaPayload(4).formula
  assert.equal(output.root.arguments[0].right.value, '200')
  assert.equal(formula.root.arguments[0].right.value, '100')
  assert.equal(output.root.arguments[0].left.zeroDenominatorPolicy, 'ERROR')
  assert.deepEqual(output.display, formula.display)
  assert.equal(output.calculationMode, 'TEMPORAL')
})

test('hydrates both sides of (A+B)/(C+D) and does not collapse them after the library loads', () => {
  const e = editor()
  const formula = { root: { nodeType: 'BINARY', operator: 'DIV', left: add(node('A'), node('B')), right: add(node('C'), node('D')), zeroDenominatorPolicy: 'ERROR' }, display: { format: 'PERCENT', scale: 4 } }
  e.hydrateFormulaFactors(formula)
  e.applySelectedFactorReferences()
  assert.equal(e.scope.formulaMode.value, '复合比率型')
  assert.deepEqual(e.scope.numeratorFactors.value.map(f => f.versionId), ['A', 'B'])
  assert.deepEqual(e.scope.denominatorFactors.value.map(f => f.versionId), ['C', 'D'])
  const output = e.createIndicatorFormulaPayload(7)
  assert.deepEqual(parseEditorFormula(output.formula).left, ['A', 'B'])
  assert.deepEqual(parseEditorFormula(output.formula).right, ['C', 'D'])
  assert.equal(output.formula.display.scale, 4)
  assert.equal(output.resourceVersion, 7)
  assert.deepEqual(output.formula, formula)
})

test('all denominator policies hydrate and are submitted without substitution', () => {
  for (const policy of ['RETURN_NULL', 'RETURN_ZERO', 'ERROR']) {
    const e = editor()
    e.hydrateFormulaFactors({ root: { nodeType: 'BINARY', operator: 'DIV', left: node('A'), right: node('B'), zeroDenominatorPolicy: policy }, display: { format: 'PERCENT' } })
    assert.equal(e.createIndicatorFormulaPayload(0).formula.root.zeroDenominatorPolicy, policy)
    e.scope.zeroStrategy.value = zeroPolicyLabel(policy === 'ERROR' ? 'RETURN_ZERO' : 'ERROR')
    assert.equal(e.createIndicatorFormulaPayload(0).formula.root.zeroDenominatorPolicy, policy === 'ERROR' ? 'RETURN_ZERO' : 'ERROR')
  }
})

test('preserves non-percent compound ratios and protects unsupported node types', () => {
  assert.equal(parseEditorFormula({ root: { nodeType: 'BINARY', operator: 'DIV', left: add(node('A'), node('B')), right: node('C') } }).mode, '复合比值型')
  const e = editor()
  e.hydrateFormulaFactors({ root: { nodeType: 'UNKNOWN' } })
  assert.equal(e.scope.unsupportedFormula.value, true)
  assert.throws(() => e.createIndicatorFormulaPayload(0), /当前公式不支持/)
})

test('department achievement uses assessment and never data quality', () => {
  assert.equal(departmentAchievement({ qualityStatus: 'PASSED', value: 10 }), '未配置目标')
  const analysis = { performanceTarget: { targetValue: 5, improvementDirection: 'LOWER_IS_BETTER' } }
  assert.equal(departmentAchievement({ qualityStatus: 'PASSED', value: 10 }, analysis), '未达标')
  assert.equal(departmentAchievement({ qualityStatus: 'FAILED', value: 4 }, analysis), '达标')
  assert.equal(departmentAchievement({ value: null }, analysis), '无法判定')
  assert.equal(departmentAchievement({ value: 6 }, { performanceTarget: { targetValue: 5, improvementDirection: 'HIGHER_IS_BETTER' } }), '达标')
  assert.equal(departmentAchievement({ resultId: '100', value: 10 }, { ...analysis, targetAssessments: [{ resultId: '100', assessment: { status: 'MET' } }] }), '达标')
})

test('formula reads use version detail, without a nonexistent GET fallback', () => {
  for (const name of ['IndicatorEditor', 'IndicatorDetail', 'IndicatorAnalysis']) {
    const view = readFileSync(new URL(`../src/idmp/views/${name}.vue`, import.meta.url), 'utf8')
    assert.equal(view.includes('fetchIndicatorFormula'), false)
  }
})

test('basic metadata requests include all persisted presentation fields', () => {
  const form = { name: '指标', shortName: '简称', attribute: '定量', unit: '元', direction: '逐步降低', categoryPath: ['质量'] }
  const scope = { form, syncCategorySelection: () => form.categoryPath, indicatorWorkflow: { masterResourceVersion: 3 } }
  const create = Function(...Object.keys(scope), `${body('createIndicatorMetadataPayload')}\nreturn createIndicatorMetadataPayload`)(...Object.values(scope))
  const payload = create({ includeVersionMetadata: false })
  assert.equal(payload.resourceVersion, 3)
  for (const key of ['shortName', 'attribute', 'unit', 'direction']) assert.equal(payload[key], form[key])
  form.shortName = ''
  assert.equal(create({ includeVersionMetadata: false }).shortName, '')
})

function metadataEditor() {
  const form = { categoryPath: [], period: '年度', attribute: '定量', unit: '百分比（%）', direction: '逐步降低 ↓' }
  const scope = {
    form, savedCalculationDescription: ref(null), savedDataSources: ref([]),
    routeIndicatorKey: ref('EXISTING'), indicatorWorkflow: {},
    syncCategorySelection: value => (form.categoryPath = value), resolveCategoryPath: () => ['质量'],
    normalizeIndicatorDataSources: value => value, indicatorDataSourceKey: value => value,
    fromApiStatisticalPeriod: value => value, toOpaqueId: value => String(value ?? ''),
    resolveResourceVersion: value => value.resourceVersion,
    resolveMetadataResourceVersion: value => value.metadataResourceVersion,
    resetIndicatorTrialResultCollection() {},
  }
  return { form, ...Function(...Object.keys(scope), `${body('hydrateIndicatorSummary')}\n${body('createIndicatorMetadataPayload')}\nreturn { hydrateIndicatorSummary, createIndicatorMetadataPayload }`)(...Object.values(scope)) }
}

test('existing null or missing presentation metadata never acquires create defaults', () => {
  for (const missing of [null, undefined, '']) {
    const editor = metadataEditor()
    editor.hydrateIndicatorSummary({ id: '100', name: '旧指标', resourceVersion: 3,
      shortName: missing, attribute: missing, unit: missing, direction: missing })
    const payload = editor.createIndicatorMetadataPayload({ includeVersionMetadata: false })
    for (const key of ['shortName', 'attribute', 'unit', 'direction']) {
      assert.equal(editor.form[key], '')
      assert.equal(payload[key], '')
    }
    assert.equal(payload.resourceVersion, 3)
  }
})

test('existing configured metadata and explicit manual edits survive saving', () => {
  const editor = metadataEditor()
  const configured = { shortName: '费用', attribute: '定量', unit: '元', direction: '逐步降低 ↓' }
  editor.hydrateIndicatorSummary({ id: '100', name: '旧指标', resourceVersion: 3, ...configured })
  let payload = editor.createIndicatorMetadataPayload({ includeVersionMetadata: false })
  for (const [key, value] of Object.entries(configured)) assert.equal(payload[key], value)
  editor.form.unit = '人次'
  editor.form.direction = '监测比较'
  payload = editor.createIndicatorMetadataPayload({ includeVersionMetadata: false })
  assert.equal(payload.unit, '人次')
  assert.equal(payload.direction, '监测比较')
})

test('editing legacy empty metadata is valid while new indicator selections remain required', () => {
  const start = source.indexOf('const rules = ')
  const end = source.indexOf('\n\nfunction syncCategorySelection', start)
  const isNew = ref(false)
  const rules = Function('computed', 'isNew', 'required', `${source.slice(start, end)}\nreturn rules`)(
    computed, isNew, message => ({ required: true, message }),
  )
  for (const key of ['attribute', 'unit', 'direction']) assert.deepEqual(rules.value[key], [])
  isNew.value = true
  for (const key of ['attribute', 'unit', 'direction']) assert.equal(rules.value[key][0].required, true)
  for (const key of ['code', 'name']) assert.equal(rules.value[key][0].required, true)
})

test('obsolete scenario persistence demonstration notices are removed', () => {
  assert.equal(source.includes('规则/场景持久化仍为界面演示'), false)
  assert.equal(source.includes('规则/场景配置暂不随公式一起持久化'), false)
  assert.ok(source.includes('<IndicatorScenarioLinks'))
})

test('versionless indicators do not restore stale presentation defaults over backend values', () => {
  const form = { code: 'EXISTING', shortName: '', attribute: '', unit: '', direction: '', categoryPath: [], policies: [] }
  const saved = { form: { shortName: '旧缓存', attribute: '定量', unit: '百分比（%）', direction: '监测比较',
    definition: '尚未写入草稿版本的定义', categoryPath: ['质量'] } }
  const scope = { form, indicatorWorkflow: { indicatorId: '100', versionId: '' }, isNew: ref(false),
    routeIndicatorKey: ref('100'), activeTab: ref('basic'),
    sessionStorage: { getItem: () => JSON.stringify(saved) }, syncCategorySelection() {},
    restorePolicyDrafts: () => [],
    indicatorEditorStorageKey: id => `editor:${id}` }
  const restore = Function(...Object.keys(scope), `${body('restoreIndicatorEditorForm')}\nreturn restoreIndicatorEditorForm`)(...Object.values(scope))
  restore()
  for (const key of ['shortName', 'attribute', 'unit', 'direction']) assert.equal(form[key], '')
  assert.equal(form.definition, saved.form.definition)
  form.unit = '元'
  restore()
  assert.equal(form.unit, '元')
})
