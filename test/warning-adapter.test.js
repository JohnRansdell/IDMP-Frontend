import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWarningRulePayload, normalizePage, normalizeWarningRule, serializeWarningRulePayload, validateWarningRuleForm, warningLabel, warningRuleCapabilities, warningRecipientLabel } from '../src/idmp/api/adapters/warning.js'

const validRule = () => ({
  code: 'MORTALITY_HIGH', name: '住院死亡率过高', description: '', warningType: 'THRESHOLD',
  indicatorVersionId: '102027642460303757', periodType: 'MONTHLY',
  operator: 'GT', threshold: '0.01', measure: 'DELTA', windowSize: 2, recipientUserIds: ['1'],
  severity: 'HIGH', effectiveStartDate: '', effectiveEndDate: ''
})

test('recipient labels use names and employee numbers, never internal IDs', () => {
  assert.equal(warningRecipientLabel({ id: '9007199254740993', username: '00112', displayName: '张医生' }), '张医生 · 00112')
  assert.equal(warningRecipientLabel({ id: '123', username: '00112' }), '00112')
  assert.equal(warningRecipientLabel({ id: '123' }), '未命名用户')
  assert.equal(warningRecipientLabel({ username: 'T', displayName: 'T' }), 'T')
})

test('employee-number recipient requests contain no internal user IDs', () => {
  const rule = { ...validRule(), recipientUsernames: ['00112', 'T', '00112'] }
  const payload = buildWarningRulePayload(rule)
  assert.equal(validateWarningRuleForm(rule), '')
  assert.deepEqual(payload.notificationPolicy, { channels: ['IN_APP'], recipientUsernames: ['00112', 'T'] })
  const json = serializeWarningRulePayload(payload)
  assert.doesNotMatch(json, /recipientUserIds/)
  assert.deepEqual(JSON.parse(json).notificationPolicy.recipientUsernames, ['00112', 'T'])
  assert.match(validateWarningRuleForm({ ...rule, recipientUsernames: [] }), /接收人/)
})

test('warning comparison operators use Chinese business labels', () => {
  assert.equal(warningLabel('GT'), '大于（>）')
  assert.equal(warningLabel('GTE'), '大于等于（≥）')
  assert.equal(warningLabel('LT'), '小于（<）')
  assert.equal(warningLabel('LTE'), '小于等于（≤）')
  assert.equal(warningLabel('EQ'), '等于（=）')
  assert.equal(warningLabel('NE'), '不等于（≠）')
})

test('warning adapter preserves opaque IDs and only sends the IN_APP policy', () => {
  const payload = buildWarningRulePayload(validRule())
  assert.equal(payload.indicatorVersionId, '102027642460303757')
  assert.deepEqual(payload.notificationPolicy, { channels: ['IN_APP'], recipientUserIds: ['1'] })
  assert.deepEqual(payload.scenarioScope, {})
  assert.deepEqual(payload.scopePolicy, { includeNoScenario: true })
})

test('warning request serializes large IDs as exact JSON integers', () => {
  const rule = validRule()
  rule.recipientUserIds = ['1', '9007199254740993']
  const json = serializeWarningRulePayload(buildWarningRulePayload(rule))

  assert.match(json, /"indicatorVersionId":102027642460303757/)
  assert.match(json, /"recipientUserIds":\[1,9007199254740993\]/)
  assert.doesNotMatch(json, /"9007199254740993"/)
})

test('scenario-based warning types and stale scenario form fields are ignored', () => {
  const rule = validRule()
  rule.warningType = 'SCENARIO_DIFFERENCE'
  assert.equal(validateWarningRuleForm(rule), '请选择预警类型')
  rule.warningType = 'THRESHOLD'
  rule.scenarioVersionIds = ['102027642460314531']
  rule.includeNoScenario = false
  assert.equal(validateWarningRuleForm(rule), '')
  assert.deepEqual(buildWarningRulePayload(rule).scenarioScope, {})
  assert.deepEqual(buildWarningRulePayload(rule).scopePolicy, { includeNoScenario: true })
})

test('warning capabilities distinguish draft publishing and published enablement', () => {
  assert.equal(warningLabel('ENABLED'), '已启用')
  assert.equal(warningLabel('DISABLED'), '未启用')
  assert.equal(warningLabel('DRAFT'), '未发布')
  assert.equal(warningLabel('PUBLISHED'), '已发布')
  assert.equal(warningRuleCapabilities({ version: { id: '1', publicationStatus: 'DRAFT' } }).canPublish, true)
  assert.equal(warningRuleCapabilities({ enableStatus: 'DISABLED', version: { publicationStatus: 'PUBLISHED' } }).canEnable, true)
  assert.equal(warningRuleCapabilities({ enableStatus: 'ENABLED', version: { publicationStatus: 'PUBLISHED' } }).canDisable, true)
})

test('warning rule normalization exposes actions for summary response variants', () => {
  const draft = normalizeWarningRule({ id: '10', enableStatus: 'DISABLED', draftVersionId: '11' })
  assert.equal(draft.version.id, '11')
  assert.equal(draft.version.publicationStatus, 'DRAFT')
  assert.equal(warningRuleCapabilities(draft).canPublish, true)

  const published = normalizeWarningRule({ id: '10', enableStatus: 'DISABLED', currentPublishedVersionId: '12' })
  assert.equal(published.version.publicationStatus, 'PUBLISHED')
  assert.equal(warningRuleCapabilities(published).canEnable, true)

  const actionResponse = normalizeWarningRule({ id: '10', enableStatus: 'ENABLED', resourceVersion: 3 })
  assert.equal(Object.hasOwn(actionResponse.version, 'publicationStatus'), false)
})

test('warning list version preserves draft metadata and publication actions', () => {
  const draft = normalizeWarningRule({
    id: '408390314040246553', enableStatus: 'DISABLED', currentPublishedVersionId: null,
    version: { id: '4531077215463426812', publicationStatus: 'DRAFT', warningType: 'THRESHOLD', resourceVersion: 1 }
  })
  assert.equal(warningLabel(draft.version.publicationStatus), '未发布')
  assert.equal(draft.version.resourceVersion, 1)
  assert.deepEqual(warningRuleCapabilities(draft), {
    canEdit: true, canPublish: true, canEnable: false, canDisable: false
  })
  const missingVersion = normalizeWarningRule({ id: '10', currentPublishedVersionId: null, version: null })
  assert.equal(warningLabel(missingVersion.version.publicationStatus), '-')
  assert.equal(warningRuleCapabilities(missingVersion).canPublish, false)
})

test('warning page response normalizes current server pagination shape', () => {
  const page = normalizePage({ records: [{ id: '9001' }], total: '1', pageNum: 1, pageSize: 20 })
  assert.deepEqual(page, { records: [{ id: '9001' }], total: 1, page: 1, size: 20 })
})
