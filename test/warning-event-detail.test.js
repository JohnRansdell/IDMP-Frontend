import assert from 'node:assert/strict'
import test from 'node:test'
import { warningEventCondition, warningEventDimensions, warningEventPeriod, warningEventScope } from '../src/idmp/features/warnings/eventDetail.js'

const event = (snapshot = {}, mode = 'ALL') => ({ actualValue: 0.41924399, warningType: 'THRESHOLD',
  triggerTime: '2026-10-22T03:07:28.386', periodStart: '2026-04-01T00:00:00', periodEnd: '2026-05-01T00:00:00',
  comparisonContext: { periodType: 'MONTHLY', resultScope: { mode }, dimensionSnapshot: snapshot } })

test('rule scope and the individual result are independent, including ALL and legacy rules', () => {
  assert.deepEqual(warningEventScope(event()), { rule: '全部结果', result: '总体结果' })
  assert.deepEqual(warningEventScope(event({ time_month: '2026-04' }, 'MAIN')), { rule: '总体结果', result: '分组结果' })
  assert.deepEqual(warningEventScope(event({ out_dept_code: '9012' })), { rule: '全部结果', result: '分组结果' })
  assert.deepEqual(warningEventScope(event({ 医生: 'A' }, 'GROUPED')), { rule: '分组结果', result: '分组结果' })
  assert.deepEqual(warningEventScope({ comparisonContext: { dimensionSnapshot: {} } }), { rule: '未记录', result: '总体结果' })
  assert.equal(warningEventScope({}).result, '未记录')
})

test('all explicit business dimensions and exact member values remain visible with optional dictionary labels', () => {
  const data = event({ OUT_DEPT_CODE: '9012', 科室名称: '骨科(东院)', 医生: 'A', TIME_MONTH: '2026-04', 自定义维度: null, 备注: '' })
  const rows = warningEventDimensions(data, new Map([['9012', '骨科（东院）']]))
  assert.equal(rows.length, 6)
  assert.deepEqual(rows[0], { field: 'OUT_DEPT_CODE', label: '出院科室编码（OUT_DEPT_CODE）', value: '9012（骨科（东院））' })
  assert.equal(rows[1].value, '骨科(东院)', 'Historical snapshot names are not overwritten')
  assert.equal(rows[3].value, '2026-04')
  assert.equal(rows[4].value, '空值')
  assert.equal(rows[5].value, '空字符串')
  assert.equal(warningEventDimensions(data)[0].value, '9012')
})

test('period uses the frozen bounds, not the much later warning trigger date', () => {
  assert.equal(warningEventPeriod(event()), '月度 · 2026-04-01 至 2026-04-30')
  assert.equal(warningEventPeriod({ triggerTime: event().triggerTime }), '未记录统计周期')
  assert.equal(warningEventPeriod({ ...event(), periodEnd: null }), '未记录统计周期')
})

test('nested threshold conditions omit the current value and preserve AND, OR and NOT', () => {
  const data = event()
  data.comparisonContext.condition = { logic: 'OR', children: [
    { logic: 'AND', children: [{ operator: 'GT', threshold: '0.4' }, { logic: 'NOT', children: [{ operator: 'GTE', threshold: '1' }] }] },
    { operator: 'EQ', threshold: '0.25' }
  ] }
  assert.equal(warningEventCondition(data), '（（指标值 > 0.4 且 非（指标值 ≥ 1）） 或 指标值 = 0.25）')
  assert.equal(warningEventCondition({ ...data, actualValue: 0 }), warningEventCondition(data))
})

test('trend and volatility describe only the rule, not evaluated or deviation values', () => {
  const delta = { operator: 'GT', threshold: '0.1', measure: 'DELTA' }
  const rate = { operator: 'GT', threshold: '0.1', measure: 'CHANGE_RATE' }
  const data = event()
  data.warningType = 'TREND'
  data.comparisonContext.condition = { logic: 'OR', children: [delta, rate] }
  data.comparisonContext.evaluatedConditions = [{ condition: delta, actualValue: 0.41924399, deviationValue: 0 }]
  assert.equal(warningEventCondition(data), '（变化值 > 0.1 或 变化率 > 0.1）')
  data.warningType = 'VOLATILITY'
  data.comparisonContext.condition = { operator: 'GTE', threshold: '2', windowSize: 4 }
  data.comparisonContext.evaluatedConditions = [{ condition: data.comparisonContext.condition, actualValue: 10, deviationValue: 2.5 }]
  assert.equal(warningEventCondition(data), '最近 4 个周期的标准差 ≥ 2')
  data.comparisonContext.evaluatedConditions = []
  data.comparisonContext.deviationValue = 3
  assert.equal(warningEventCondition(data), '最近 4 个周期的标准差 ≥ 2')
  assert.equal(warningEventCondition(event()), '未记录触发条件')
})

test('legacy scalar conditions retain their operator and zero threshold without the actual value', () => {
  const data = event()
  data.thresholdValue = 0
  data.comparisonContext.operator = 'GTE'
  assert.equal(warningEventCondition(data), '指标值 ≥ 0')
})
