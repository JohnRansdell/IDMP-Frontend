import test from 'node:test'
import assert from 'node:assert/strict'
import { splitFormulaLinks } from '../src/idmp/utils/formulaLinks.js'

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
