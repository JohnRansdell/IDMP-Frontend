import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePage,
  normalizeMergeObject,
  normalizePeriodType,
  normalizePublicationStatus,
  normalizeResourceId,
  scenarioDetailToForm,
  scenarioFormToPatch,
  scenarioVersionCapabilities,
  selectScenarioVersion,
  toIndicatorBinding,
  toOverridePayload
} from '../src/idmp/api/adapters/scenario.js'

test('scenario page adapter accepts the page shape returned by the current server', () => {
  const result = normalizePage({ records: [{ id: '102027642458358229' }], total: '4', pageNum: 2, pageSize: 5 })

  assert.deepEqual(result, {
    items: [{ id: '102027642458358229' }],
    total: 4,
    page: 2,
    size: 5
  })
})

test('scenario adapter preserves resource IDs beyond the JavaScript safe integer range', () => {
  const id = '102027642458358230'

  assert.equal(normalizeResourceId(id), id)
  assert.equal(toIndicatorBinding({ indicatorVersionId: id }, 0).indicatorVersionId, id)
  assert.equal(toOverridePayload({ indicatorVersionId: id, overrideType: 'DISPLAY', targetNodePath: 'root', overrideValue: {}, priority: 0 }).indicatorVersionId, id)
  assert.equal(scenarioDetailToForm({ version: { indicators: [{ indicatorVersionId: id }] } }).indicators[0].indicatorVersionId, id)
})

test('scenario adapter sends an object to the server merge pipeline', () => {
  assert.deepEqual(normalizeMergeObject([]), {})
  assert.deepEqual(normalizeMergeObject(null), {})
  assert.deepEqual(normalizeMergeObject({ primary: 'HQMS' }), { primary: 'HQMS' })
  assert.deepEqual(
    scenarioDetailToForm({ version: { defaultDataSourcePriority: [] } }).defaultDataSourcePriority,
    {}
  )
})

test('scenario list opens an existing draft before the published version', () => {
  const versions = [
    { id: '900000000000000001', publicationStatus: 'PUBLISHED' },
    { id: '900000000000000002', publicationStatus: 'DRAFT' }
  ]

  assert.equal(selectScenarioVersion(versions, '900000000000000001').id, '900000000000000002')
  assert.equal(selectScenarioVersion([versions[0]], versions[0].id).id, versions[0].id)
})

test('scenario version capabilities enforce the business state rules', () => {
  assert.deepEqual(scenarioVersionCapabilities('DRAFT'), {
    status: 'DRAFT', canView: true, canEdit: true, canValidate: true, canPublish: true, canStartEdit: false
  })
  assert.deepEqual(scenarioVersionCapabilities('PUBLISHED'), {
    status: 'PUBLISHED', canView: true, canEdit: false, canValidate: false, canPublish: false, canStartEdit: true
  })
  assert.deepEqual(scenarioVersionCapabilities('ARCHIVED'), {
    status: 'ARCHIVED', canView: true, canEdit: false, canValidate: false, canPublish: false, canStartEdit: false
  })
  assert.equal(normalizePublicationStatus(' unexpected '), 'UNKNOWN')
  assert.equal(scenarioDetailToForm({ version: {} }).publicationStatus, 'UNKNOWN')
  assert.equal(scenarioDetailToForm({ version: { status: 'draft' } }).publicationStatus, 'DRAFT')
})

test('scenario period adapter normalizes supported and legacy values', () => {
  assert.equal(normalizePeriodType(' monthly '), 'MONTHLY')
  assert.equal(normalizePeriodType('MONTH'), 'MONTHLY')
  assert.equal(normalizePeriodType('月度'), 'MONTHLY')
  assert.equal(normalizePeriodType({ code: 'YEAR' }), 'YEARLY')
})

test('scenario detail exposes an unknown period as unselected', () => {
  const form = scenarioDetailToForm({
    scenario: { id: 1 },
    version: { id: 2, defaultPeriodType: 'EVERY_TWO_MONTHS' }
  })

  assert.equal(form.defaultPeriodType, '')
})

test('scenario patch sends only an API-supported period value', () => {
  assert.equal(scenarioFormToPatch({ defaultPeriodType: '季度' }).defaultPeriodType, 'QUARTERLY')
  assert.deepEqual(
    scenarioFormToPatch({ defaultPeriodType: 'MONTHLY', defaultDataSourcePriority: [] }).defaultDataSourcePriority,
    {}
  )
  assert.throws(
    () => scenarioFormToPatch({ defaultPeriodType: 'EVERY_TWO_MONTHS' }),
    /默认统计周期无效/
  )
})
