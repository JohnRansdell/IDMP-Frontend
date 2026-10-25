import test from 'node:test'
import assert from 'node:assert/strict'
import { fieldLabel, toUserMessage, sanitizeResponseMessages } from '../src/idmp/utils/userMessage.js'
import { formatApiError } from '../src/idmp/utils/apiError.js'
import { normalizeMessageOptions } from '../src/idmp/utils/message.js'

test('mixed Chinese transport diagnostics do not expose routes, hosts, status codes or gateway pages', () => {
  for (const raw of [
    '正式看板请求失败：/analysis/dashboard-data-sources/DASHBOARD_INPATIENT_MORTALITY_20260928/available-periods（HTTP 502）。服务暂时不可用',
    '加载失败：https://example.test/api/v1/indicators?token=secret',
    '读取失败：GET /api/v1/factors HTTP 403',
    '服务错误：<html><head>网关错误</head><body>nginx/1.24</body></html>',
    '请求失败：upstream timed out',
    '请求失败：Request failed with status code 502',
    '加载失败：Failed to fetch'
  ]) {
    const message = toUserMessage(raw)
    assert.match(message, /[\u3400-\u9fff]/)
    assert.doesNotMatch(message, /\/analysis|\/api\/|HTTP|status code|nginx|upstream|<html|example\.test|token=|Failed to fetch/)
    assert.equal(normalizeMessageOptions({ type: 'error', message: raw }).message, message)
    const payload = { widgets: { one: { status: 'ERROR', message: raw } }, diagnostics: [{ message: raw }] }
    sanitizeResponseMessages(payload)
    assert.equal(payload.widgets.one.message, message)
    assert.equal(payload.diagnostics[0].message, message)
  }
})

test('all API error consumers classify unavailable services, timeouts and permissions consistently', () => {
  for (const status of [500, 502, 503]) assert.equal(formatApiError({ status, message: 'Bad Gateway' }), '服务暂时不可用，请稍后重试。')
  assert.equal(formatApiError({ status: 504, message: 'Gateway Timeout' }), '请求超时，请稍后重试。')
  assert.equal(formatApiError({ status: 403, message: 'GET /api/v1/indicators HTTP 403' }), '当前账号没有权限执行此操作。')
  assert.equal(toUserMessage('科室筛选没有匹配结果，请调整条件'), '科室筛选没有匹配结果，请调整条件')
  assert.equal(toUserMessage('分子/分母不能为空'), '分子/分母不能为空')
})

test('validation and business messages use readable names', () => {
  assert.equal(fieldLabel('dataSources.[0]'), '第1项数据来源')
  assert.equal(toUserMessage('请求体字段 dataSources.[0] 格式错误 (traceId: test)'), '第1项数据来源格式不正确，请重新选择或填写。')
  assert.match(toUserMessage('name: must not be blank'), /名称不能为空/)
  assert.equal(toUserMessage('granularity仅支持DAILY/MONTHLY/QUARTERLY/YEARLY/STATIC'), '时间粒度仅支持日/月/季度/年/静态')
  assert.equal(formatApiError({ status: 409, message: '指标名称已存在' }), '指标名称已存在')
})

test('database cron parser and local layout internals never reach a toast', () => {
  for (const raw of ['计算失败: PreparedStatementCallback; bad SQL grammar', '执行失败: Cron expression needs 6 fields', 'SQL解析失败: Encountered unexpected token: {', 'invalid current dashboard schema: widgets[0].layout.x must be numeric']) {
    const shown = normalizeMessageOptions({ type: 'error', message: raw })
    assert.doesNotMatch(shown.message, /StatementCallback|SQL grammar|Cron expression|unexpected token|widgets\[/)
    assert.match(shown.message, /[\u3400-\u9fff]/)
  }
  assert.equal(normalizeMessageOptions({ type: 'success', message: '保存成功' }).message, '保存成功')
})

test('successful response diagnostics are sanitized without changing formulas rows or status codes', () => {
  const sql = 'SELECT message, reason FROM patient'
  const response = { status: 'FAILED', errorCode: 'SQL_ERROR', errorMessage: '执行失败: PreparedStatementCallback; bad SQL grammar', assessment: { reason: 'NO_TARGET' }, diagnostics: [{ code: 'DSL-006', path: 'output.field', message: 'Java NullPointerException', suggestion: '请检查 periodStart' }], formula: { message: sql }, rows: [{ message: sql, reason: 'abc' }], reason: 'manual note' }
  sanitizeResponseMessages(response)
  assert.match(response.errorMessage, /检查数据源/)
  assert.equal(response.errorCode, 'SQL_ERROR')
  assert.equal(response.assessment.reason, 'NO_TARGET')
  assert.equal(response.reason, 'manual note')
  assert.equal(response.formula.message, sql)
  assert.equal(response.rows[0].message, sql)
  assert.equal(response.diagnostics[0].code, 'DSL-006')
  assert.equal(response.diagnostics[0].path, 'output.field')
  assert.equal(response.diagnostics[0].suggestion, '请检查 开始日期')
  assert.equal(sanitizeResponseMessages({ reason: '用户填写的 name 说明' }).reason, '用户填写的 name 说明')
})
