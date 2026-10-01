import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiError } from '../src/idmp/api/request.js'

test('API errors keep actionable Chinese business messages', () => {
  const error = createApiError(409, { message: '指标名称已存在', traceId: 'trace-1' }, '/indicators')
  assert.match(error.message, /指标名称已存在/)
  assert.equal(error.rawMessage, '指标名称已存在')
  assert.equal(error.traceId, 'trace-1')
})

test('API errors hide backend parser, stack, gateway and English internals', () => {
  assert.match(createApiError(400, { message: 'SQL语法解析失败: Encountered unexpected token: "{"' }).message, /SQL 语句格式有误/)
  assert.doesNotMatch(createApiError(400, { message: 'SQL语法解析失败: Encountered unexpected token: "{"' }).message, /unexpected token/)
  assert.equal(createApiError(500, { message: 'java.lang.NullPointerException at App.java:42' }).message, '服务暂时不可用，请稍后重试。')
  assert.equal(createApiError(502, { message: 'Bad Gateway' }).message, '服务暂时不可用，请稍后重试。')
  assert.equal(createApiError(400, { message: 'Invalid import period' }).message, '请求未能完成，请检查输入后重试。')
})
