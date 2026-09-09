import test from 'node:test'
import assert from 'node:assert/strict'
import { mappingActionAllowed, mappingActionCompleted, mappingCapabilities, mappingStatusLabel, mappingTypeDescription, mappingTypeLabel, normalizePage, policyReferenceRoleLabel } from '../src/idmp/api/adapters/mapping.js'

test('mapping adapter accepts current server page response and preserves opaque ids', () => {
  const page = normalizePage({ records: [{ id: '102027642460309830' }], total: '1', pageNum: 2, pageSize: 20 })
  assert.deepEqual(page, { items: [{ id: '102027642460309830' }], total: 1, page: 2, size: 20 })
})

test('mapping state capabilities follow the governance state machine', () => {
  assert.equal(mappingCapabilities({ reviewStatus: 'DRAFT' }).canSubmit, true)
  assert.equal(mappingCapabilities({ reviewStatus: 'PENDING_REVIEW' }).canApprove, true)
  assert.equal(mappingCapabilities({ reviewStatus: 'REJECTED' }).canEdit, true)
  assert.equal(mappingCapabilities({ reviewStatus: 'APPROVED', publicationStatus: 'PUBLISHED' }).canInvalidate, true)
  assert.equal(mappingCapabilities({ reviewStatus: 'INVALIDATED', publicationStatus: 'PUBLISHED' }).canInvalidate, false)
  assert.equal(mappingStatusLabel('REJECTED'), '已驳回')
})

test('mapping relationship labels retain containment direction and overlap meaning', () => {
  assert.equal(mappingTypeLabel('BROADER'), '源包含目标')
  assert.equal(mappingTypeLabel('NARROWER'), '源被目标包含')
  assert.match(mappingTypeDescription('RELATED'), /部分重叠/)
  assert.equal(policyReferenceRoleLabel('DEFINITION'), '定义依据')
})

test('mapping actions distinguish an allowed transition from an already completed transition', () => {
  assert.equal(mappingActionAllowed({ mapping: { reviewStatus: 'DRAFT' } }, 'submit'), true)
  assert.equal(mappingActionCompleted({ mapping: { reviewStatus: 'PENDING_REVIEW' } }, 'submit'), true)
  assert.equal(mappingActionCompleted({ mapping: { reviewStatus: 'APPROVED', publicationStatus: 'PUBLISHED' } }, 'approve'), true)
  assert.equal(mappingActionCompleted({ mapping: { reviewStatus: 'REJECTED' } }, 'reject'), true)
  assert.equal(mappingActionCompleted({ mapping: { reviewStatus: 'INVALIDATED' } }, 'invalidate'), true)
  assert.equal(mappingActionCompleted({ mapping: { reviewStatus: 'DRAFT' } }, 'submit'), false)
})
