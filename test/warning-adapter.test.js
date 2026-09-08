import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWarningRulePayload, normalizePage, validateWarningRuleForm, warningRuleCapabilities } from '../src/idmp/api/adapters/warning.js'

const validRule = () => ({
  code: 'MORTALITY_HIGH', name: '住院死亡率过高', description: '', warningType: 'THRESHOLD',
  indicatorVersionId: '102027642460303757', periodType: 'MONTHLY', scenarioVersionIds: [],
  includeNoScenario: true, operator: 'GT', threshold: '0.01', measure: 'DELTA', windowSize: 2,
  baselineIndicatorVersionId: '', baselineScenarioVersionId: '', recipientUserIds: ['1'],
  severity: 'HIGH', effectiveStartDate: '', effectiveEndDate: ''
})

test('warning adapter preserves opaque IDs and only sends the IN_APP policy', () => {
  const payload = buildWarningRulePayload(validRule())
  assert.equal(payload.indicatorVersionId, '102027642460303757')
  assert.deepEqual(payload.notificationPolicy, { channels: ['IN_APP'], recipientUserIds: ['1'] })
  assert.deepEqual(payload.scenarioScope, {})
})

test('scenario difference requires an explicit published baseline scenario', () => {
  const rule = validRule()
  rule.warningType = 'SCENARIO_DIFFERENCE'
  rule.baselineIndicatorVersionId = rule.indicatorVersionId
  assert.match(validateWarningRuleForm(rule), /基准场景/)
  rule.baselineScenarioVersionId = '102027642460308856'
  assert.equal(validateWarningRuleForm(rule), '')
})

test('warning capabilities distinguish draft publishing and published enablement', () => {
  assert.equal(warningRuleCapabilities({ version: { id: '1', publicationStatus: 'DRAFT' } }).canPublish, true)
  assert.equal(warningRuleCapabilities({ enableStatus: 'DISABLED', version: { publicationStatus: 'PUBLISHED' } }).canEnable, true)
  assert.equal(warningRuleCapabilities({ enableStatus: 'ENABLED', version: { publicationStatus: 'PUBLISHED' } }).canDisable, true)
})

test('warning page response normalizes current server pagination shape', () => {
  const page = normalizePage({ records: [{ id: '9001' }], total: '1', pageNum: 1, pageSize: 20 })
  assert.deepEqual(page, { records: [{ id: '9001' }], total: 1, page: 1, size: 20 })
})
