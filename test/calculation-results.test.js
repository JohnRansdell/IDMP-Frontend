import test from 'node:test'
import assert from 'node:assert/strict'
import { calculationDimensionValue, calculationResultFields, calculationResultValue, nodeResultLabel } from '../src/idmp/utils/calculationResults.js'

test('case differences between the target grain and saved dimensions do not create empty duplicate columns', () => {
  const row = { dimensions: { out_dept_code: '14', doctor: 0, 病种: null } }
  assert.deepEqual(calculationResultFields(['OUT_DEPT_CODE', 'DOCTOR'], [row]), ['OUT_DEPT_CODE', 'DOCTOR', '病种'])
  assert.equal(calculationDimensionValue(row, 'OUT_DEPT_CODE'), '14')
  assert.equal(calculationDimensionValue(row, 'DOCTOR'), 0)
  assert.equal(calculationDimensionValue(row, '病种'), '-')
  assert.equal(calculationDimensionValue(row, 'missing'), '-')
})

test('single result preserves zero, text, booleans and formatted indicator values', () => {
  for (const [row, expected] of [[{ value: 0 }, '0'], [{ value: false }, '否'], [{ value: '日期文本' }, '日期文本'], [{ value: 0.15, displayValue: '15%' }, '15%'], [{ value: null }, '无有效值']]) {
    assert.equal(calculationResultValue(row), expected)
    assert.equal(nodeResultLabel({ status: 'SUCCEEDED', resultSummary: { status: 'AVAILABLE', rowCount: '1', singleResult: row } }), expected)
  }
})

test('multiple groups only display a count and never add the values', () => {
  assert.equal(nodeResultLabel({ status: 'SUCCEEDED', resultSummary: { status: 'AVAILABLE', rowCount: '102027642463173862' } }), '共 102027642463173862 条结果')
  assert.equal(nodeResultLabel({ status: 'SUCCEEDED', resultSummary: { status: 'EMPTY', rowCount: '0' } }), '暂无结果行')
})

test('latest failed and running execution hides even an old available summary', () => {
  const resultSummary = { status: 'AVAILABLE', rowCount: '1', singleResult: { value: 15 } }
  assert.equal(nodeResultLabel({ status: 'FAILED', resultSummary }), '本次执行无结果')
  assert.equal(nodeResultLabel({ status: 'RUNNING', resultSummary }), '尚未生成结果')
  assert.equal(nodeResultLabel({ status: 'SUCCEEDED' }), '暂未返回结果')
  assert.equal(nodeResultLabel({ status: 'SUCCEEDED', resultSummary: { status: 'QUALITY' } }), '校验已完成')
})
