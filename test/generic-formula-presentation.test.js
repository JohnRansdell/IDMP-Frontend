import test from 'node:test'
import assert from 'node:assert/strict'
import { createOverviewPresentation } from '../src/idmp/features/analysis/overviewPresentation.js'
import { createIndicatorDataExplanation } from '../src/idmp/api/adapters/indicator.js'
import { resultOperandColumns } from '../src/idmp/features/shared/formulaPresentation.js'
import { buildAnalysisPdfReport } from '../src/idmp/features/analysis/pdfReport.js'
const ref = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id })
const binary = (operator, left, right) => ({ nodeType: 'BINARY', operator, left, right })
const constant = value => ({ nodeType: 'CONST', value })
const samples = [
  { name: '手术量合计', root: binary('ADD', ref('1'), ref('2')), value: 5604 },
  { name: '手术量差额', root: binary('SUB', ref('1'), ref('2')), value: -1666 },
  { name: '加权手术工作量', root: binary('ADD', binary('MUL', ref('1'), constant('1.5')), ref('2')), value: 7421.5 },
  { name: '综合工作量调整值', root: binary('SUB', binary('DIV', binary('ADD', ref('1'), ref('2')), constant('2')), constant('10')), value: 2792 },
  { name: '均值', root: { nodeType: 'FUNCTION', functionCode: 'AVG', arguments: [ref('1'), ref('2')] }, value: 2802 },
  { name: '条件工作量', root: { nodeType: 'FUNCTION', functionCode: 'IF', arguments: [{ nodeType: 'COMPARE', comparator: 'GT', left: ref('1'), right: constant('0') }, ref('2'), constant('0')] }, value: 3635 }
]
for (const sample of samples) test(`${sample.name}只显示指标结果和真实参与因子，不伪装分子分母`, () => {
  const formula = { root: sample.root }
  assert.deepEqual(resultOperandColumns([{ numeratorValue: 0, denominatorValue: 5 }], formula), [])
  const model = createOverviewPresentation({ formula, selected: true, report: {}, formal: {
    analysis: { dataAvailable: true }, overview: { value: sample.value, numeratorValue: 0, denominatorValue: 5 }, hasDrill: false
  } })
  assert.ok(!model.summaries.some(item => /分子|分母|计入事件数|统计对象总量/.test(item.label + (item.description || ''))))
  const explanation = createIndicatorDataExplanation({ version: { formula } })
  assert.equal(explanation.type, 'FACTORS')
  assert.deepEqual(explanation.operands.flatMap(item => item.factorVersionIds), ['1', '2'])
  assert.ok(explanation.operands.every(item => item.role === 'FACTOR'))
})
test('仅外层除法展示对应操作数；零保留而缺失字段不展示', () => {
  const formula = { root: binary('DIV', binary('SUB', ref('1'), ref('2')), constant('3')) }
  assert.deepEqual(resultOperandColumns([{ numerator: 0, denominator: 3 }], formula).map(item => item.label), ['分子', '分母'])
  assert.deepEqual(resultOperandColumns([{ numeratorValue: null, denominatorValue: null }]), [])
  assert.deepEqual(resultOperandColumns([{ numerator: false, denominator: '' }]), [])
})
test('非比率排名导出不产生空分子分母列，零操作数仍保留', () => {
  const build = rankRows => buildAnalysisPdfReport({ versionId: '1', rankRows }).sections[2]
  const generic = build([{ rank: 1, department: '骨科', rate: '-12.50', numerator: '-', denominator: '-', status: '-' }])
  assert.deepEqual(generic.columns, ['排名', '科室', '指标值', '状态'])
  assert.equal(generic.rows[0][2], '-12.50')
  assert.deepEqual(build([{ numerator: 0, denominator: 123 }]).columns, ['排名', '科室', '指标值', '分子', '分母', '状态'])
})
