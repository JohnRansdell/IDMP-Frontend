import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardDetailToSchema, schemaToDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'
import { normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { createWarningWidgetConfig, normalizeWarningWidgetConfig, warningEventToDashboardItem, warningWidgetQuery } from '../src/idmp/features/dashboard/warningWidget.js'

for (const config of [
  { status: '', severity: 'HIGH', pageSize: 3, showValue: false, showTime: false },
  { status: 'CLOSED', severity: '', pageSize: 7, showSeverity: false, ruleId: '102027642468111133' },
  { status: 'ACKNOWLEDGED', severity: 'MEDIUM', pageSize: 2, indicatorVersionId: '102027642468111104' }
]) test(`warning component retains ${config.status || 'all'} event filters and presentation after saving`, () => {
  const warning = normalizeWarningWidgetConfig(config)
  const schema = normalizeDashboardSchema({ version: 1, widgets: [{ id: 'events', type: 'warnings', config: { warning } }] })
  const payload = schemaToDashboardPayload(schema)
  const restored = dashboardDetailToSchema({ version: payload }).widgets[0]
  assert.deepEqual(restored.config.warning, warning)
  assert.deepEqual(warningWidgetQuery(restored.config.warning), warningWidgetQuery(warning))
  assert.equal(restored.config.style.__idmpWarningWidget, undefined)
})

test('warning widget normalizes only supported dashboard display filters', () => {
  assert.deepEqual(createWarningWidgetConfig(), {
    status: 'OPEN', severity: '', indicatorVersionId: '', ruleId: '', pageSize: 5,
    showTime: true, showSeverity: true, showValue: true
  })
  assert.deepEqual(normalizeWarningWidgetConfig({ status: 'BAD', severity: 'HIGH', pageSize: 99, showTime: false }), {
    status: 'OPEN', severity: 'HIGH', indicatorVersionId: '', ruleId: '', pageSize: 20,
    showTime: false, showSeverity: true, showValue: true
  })
})

test('warning widget query and presentation preserve audited event fields', () => {
  const config = { status: 'OPEN', severity: 'HIGH', indicatorVersionId: '9001', ruleId: '77', pageSize: 3, showTime: true, showSeverity: true, showValue: true }
  assert.deepEqual(warningWidgetQuery(config), { status: 'OPEN', severity: 'HIGH', indicatorVersionId: '9001', ruleId: '77', page: 1, size: 3 })
  const item = warningEventToDashboardItem({ id: 'event-1', ruleName: '死亡率阈值', severity: 'HIGH', status: 'OPEN', actualValue: 0.85, thresholdValue: 0.8, triggerTime: '2026-09-28 10:00:00' }, config)
  assert.equal(item.id, 'event-1')
  assert.equal(item.level, 'danger')
  assert.match(item.text, /死亡率阈值/)
  assert.match(item.text, /当前值 0.85/)
  assert.doesNotMatch(item.text, /阈值 0.8/)
  assert.equal(item.time, '2026-09-28 10:00:00')
})

test('warning widget handles nested conditions, zero values and missing values without a fictitious threshold', () => {
  for (const [actualValue, display] of [[0.41924399, '0.41924399'], [0, '0'], [null, '-']]) {
    const event = { warningType: 'THRESHOLD', actualValue, thresholdValue: null }
    const item = warningEventToDashboardItem(event)
    assert.equal(item.name, '阈值预警')
    assert.equal(item.detail, `当前值 ${display}`)
    assert.doesNotMatch(item.detail, /阈值/)
    assert.deepEqual(event, { warningType: 'THRESHOLD', actualValue, thresholdValue: null })
    assert.equal(warningEventToDashboardItem(event, { showValue: false }).detail, '')
  }
})
