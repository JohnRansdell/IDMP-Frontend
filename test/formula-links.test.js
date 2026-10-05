import test from 'node:test'
import assert from 'node:assert/strict'
import { splitFormulaFraction, splitFormulaLinks } from '../src/idmp/utils/formulaLinks.js'

test('比例、复杂函数和重复引用中的因子链接指向精确版本', () => {
  const expression = '最大值(【入院数】 ÷ 【总人数】，【入院数】) × 100'
  const segments = splitFormulaLinks(expression, [{ factorName: '入院数', factorVersionId: '102027642461312819' }, { factorName: '总人数', factorVersionId: '102027642461312817' }])
  assert.equal(segments.map(item => item.text).join(''), expression)
  assert.deepEqual(segments.filter(item => item.factorVersionId).map(item => item.factorVersionId), ['102027642461312819', '102027642461312817', '102027642461312819'])
})

test('同名因子按版本消歧，不将未知或歧义名称错误链接', () => {
  const segments = splitFormulaLinks('【人数（版本 11）】 + 【人数（版本 12）】 + 【人数】 + 【未知】', [{ factorName: '人数', factorVersionId: '11' }, { factorName: '人数', factorVersionId: '12' }])
  assert.deepEqual(segments.filter(item => item.factorVersionId).map(item => item.factorVersionId), ['11', '12'])
  assert.ok(segments.at(-1).text.includes('【人数】 + 【未知】'))
})

test('名称中的特殊符号原样保留，缺失元数据不会报错', () => {
  const expression = '【人数.*（测试）】 + 1'
  assert.equal(splitFormulaLinks(expression, [{ factorName: '人数.*（测试）', factorVersionId: '10' }])[0].factorVersionId, '10')
  assert.deepEqual(splitFormulaLinks(expression, null), [{ text: expression }])
  assert.deepEqual(splitFormulaLinks(null), [])
})

const ratio = { root: { nodeType: 'BINARY', operator: 'DIV' } }
const factors = [{ factorName: '总人次', factorVersionId: '11' }, { factorName: '未转科人次', factorVersionId: '12' }]
test('复合分子以分式展示，并保留每个引用因子的精确版本', () => {
  const expression = '((【总人次】 - 【未转科人次】) ÷ 【总人次】)'
  const fraction = splitFormulaFraction(ratio, { expression, displayExpression: `${expression} × 100（单位：%）`, factors })
  assert.equal(fraction.numerator.map(s => s.text).join(''), '总人次 - 未转科人次')
  assert.deepEqual(fraction.numerator.filter(s => s.factorVersionId).map(s => s.factorVersionId), ['11', '12'])
  assert.deepEqual(fraction.denominator, [{ text: '总人次', factorVersionId: '11' }])
  assert.equal(fraction.suffix, '× 100（单位：%）')
})

test('分子分母可为嵌套表达式、函数或常量，不把内部除法当成根除法', () => {
  const fraction = splitFormulaFraction(ratio, { expression: '((【总人次】 ÷ 2) ÷ 最大值(【未转科人次】，1))', factors })
  assert.equal(fraction.numerator.map(s => s.text).join(''), '总人次 ÷ 2')
  assert.equal(fraction.denominator.map(s => s.text).join(''), '最大值(未转科人次，1)')
  assert.deepEqual(splitFormulaFraction(ratio, { expression: '(1 ÷ 2)' }), {numerator:[{text:'1'}],denominator:[{text:'2'}],suffix:''})
})

test('分式保留因子名称内部的括号和除号，并消歧同名版本', () => {
  const unusual = [{factorName:'人数(入院) ÷ 测试',factorVersionId:'21'}, {factorName:'人数',factorVersionId:'22'}, {factorName:'人数',factorVersionId:'23'}]
  const fraction = splitFormulaFraction(ratio, { expression:'(【人数(入院) ÷ 测试】 ÷ (【人数（版本 22）】 + 【人数（版本 23）】))', factors:unusual })
  assert.deepEqual(fraction.numerator,[{text:'人数(入院) ÷ 测试',factorVersionId:'21'}])
  assert.deepEqual(fraction.denominator.filter(s=>s.factorVersionId).map(s=>s.factorVersionId),['22','23'])
})

test('不改变非比例、自定义文案、无法识别或不完整的公式', () => {
  for(const expression of ['业务自定义比例', '(【未知】 ÷ 2)', '(1 ÷ 2) + 3', '(1 ÷ 2 ÷ 3)', '((1 ÷ 2)', '( ÷ 2)']) {
    assert.equal(splitFormulaFraction(ratio, {expression}),null,expression)
  }
  assert.equal(splitFormulaFraction({root:{nodeType:'FUNCTION'}},{expression:'(1 ÷ 2)'}),null)
  assert.equal(splitFormulaFraction(ratio,{expression:'(1 ÷ 2)',displayExpression:'自定义展示'}),null)
  assert.equal(splitFormulaFraction(ratio,null),null)
})
