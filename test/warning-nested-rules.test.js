import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWarningRulePayload, validateWarningCondition, validateWarningRuleForm, cleanWarningCondition, describeWarningCondition } from '../src/idmp/api/adapters/warning.js'

const leaf = (operator = 'GT', threshold = '0.05') => ({ operator, threshold })
test('missing grouping is validated before hidden threshold conditions', () => {
  const form = { code: 'TEST', name: 'Test', indicatorVersionId: '101', periodType: 'MONTHLY', warningType: 'THRESHOLD',
    conditionTree: leaf('GT', ''), resultScope: { mode: 'GROUPED', dimensions: [] } }
  assert.equal(validateWarningRuleForm(form), '请选择分组粒度')
  assert.match(validateWarningRuleForm({ ...form, resultScope: { mode: 'MAIN' } }), /数字阈值/)
})
test('condition preview preserves nesting, zero and incomplete thresholds', () => {
  const tree = { logic: 'AND', children: [leaf('GT', '10'), { logic: 'OR', children: [leaf('LT', '20'), { logic: 'NOT', children: [leaf('EQ', '0')] }] }] }
  assert.equal(describeWarningCondition(tree, 'THRESHOLD'), '（指标值 > 10 且 （指标值 < 20 或 非（指标值 = 0）））')
  assert.equal(describeWarningCondition(leaf('GT', ''), 'THRESHOLD'), '指标值 > 待填写')
  assert.equal(describeWarningCondition({ ...leaf(), measure: 'CHANGE_RATE' }, 'TREND'), '变化率 > 0.05')
  assert.equal(describeWarningCondition({ ...leaf(), windowSize: 6 }, 'VOLATILITY'), '最近 6 个周期的标准差 > 0.05')
})
test('nested AND/OR/NOT and per-member scopes survive payload serialization', () => {
  const tree = { logic: 'AND', children: [leaf(), { logic: 'OR', children: [leaf('LTE', '0.2'), { logic: 'NOT', children: [leaf('EQ', '0')] }] }] }
  const resultScope = { mode: 'GROUPED', targetCode: 'BASE', dimensions: ['DEPT_CODE', 'DEPT_NAME'], members: { DEPT_CODE: ['4101', '4102'] } }
  assert.equal(validateWarningCondition(tree, 'THRESHOLD'), '')
  const payload = buildWarningRulePayload({ warningType: 'THRESHOLD', conditionTree: tree, resultScope })
  assert.deepEqual(payload.condition, tree)
  assert.deepEqual(payload.scopePolicy.resultScope, resultScope)
})
test('every leaf retains historical settings in nested rules', () => {
  assert.deepEqual(cleanWarningCondition({ logic: 'NOT', children: [{ ...leaf(), measure: 'CHANGE_RATE' }] }, 'TREND'), { logic: 'NOT', children: [{ ...leaf(), measure: 'CHANGE_RATE' }] })
  assert.match(validateWarningCondition({ logic: 'AND', children: [{ ...leaf(), windowSize: 61 }] }, 'VOLATILITY'), /60/)
})
test('rejects malformed logic, empty thresholds and excessive depth', () => {
  for (const tree of [{ logic: 'AND', children: [] }, { logic: 'NOT', children: [leaf(), leaf()] }, leaf('BAD'), leaf('GT', 'NaN'), leaf('GT', '')]) assert.ok(validateWarningCondition(tree, 'THRESHOLD'))
  let tree = leaf()
  for (let i = 0; i < 8; i++) tree = { logic: 'NOT', children: [tree] }
  assert.match(validateWarningCondition(tree, 'THRESHOLD'), /8/)
})
