import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatusLabel, resolveStatusPresentation } from '../src/idmp/design/status.js'

test('status labels localize standard and compatible codes', () => {
  assert.equal(getStatusLabel(' draft '), '草稿')
  const labels = {
    SUCCESS: '已成功',
    CANCELED: '已取消',
    PASSED: '已通过',
    PASS: '已通过',
    TRIAL_PASS: '试算通过',
    TRIAL: '试算结果',
    NOT_CALCULABLE: '不可计算',
    VALID: '校验通过',
    VALID_WITH_WARNINGS: '校验通过（有警告）',
    COMPILED: '已编译',
    COMPILED_WITH_WARNINGS: '已编译（有警告）',
    WARN: '警告',
    WARNING: '警告',
    ERROR: '错误',
    BLOCK: '阻断',
    UNKNOWN: '状态未知',
    MATCHED: '已匹配',
    UNMATCHED: '未匹配',
    REJECTED: '已拒绝',
    MAPPED: '已映射',
    UNMAPPED: '未映射'
  }
  Object.entries(labels).forEach(([status, label]) => assert.equal(getStatusLabel(status), label))
})

test('unknown codes and custom Chinese labels remain unchanged', () => {
  assert.equal(getStatusLabel('FUTURE_STATE'), 'FUTURE_STATE')
  assert.deepEqual(resolveStatusPresentation({ status: 'PUBLISHED', label: '当前版本' }), {
    label: '当前版本',
    tone: 'success'
  })
})

test('presentation localizes English labels and prioritizes explicit tone', () => {
  assert.deepEqual(resolveStatusPresentation({ status: 'DRAFT', label: 'PUBLISHED', tone: 'danger' }), {
    label: '已发布',
    tone: 'danger'
  })
  assert.deepEqual(resolveStatusPresentation({ label: 'PASSED' }), {
    label: '已通过',
    tone: 'success'
  })
})
