import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardPublicationState, isPublishedDashboard } from '../src/idmp/features/dashboard/publication.js'
import { dashboardSummaryToCatalogEntry } from '../src/idmp/api/adapters/dashboard.js'

const remote = data => dashboardSummaryToCatalogEntry({ id: '1', ...data })

test('local and server drafts never enter the overview, including a publish status without a version', () => {
  for (const item of [{ origin: 'local', currentPublishedVersionId: '2' }, remote({}), remote({ status: 'PUBLISHED' })]) {
    assert.equal(isPublishedDashboard(item), false)
    assert.match(dashboardPublicationState(item).label, /草稿/)
  }
  assert.equal(isPublishedDashboard(remote({ currentPublishedVersionId: ' ' })), false)
})

test('published dashboard remains available while a separate draft is being edited', () => {
  const item = remote({ status: 'DRAFT', currentPublishedVersionId: 2, workingVersionId: 3, workingVersionStatus: 'DRAFT' })
  assert.equal(isPublishedDashboard(item), true)
  assert.deepEqual(dashboardPublicationState(item), { label: '已发布 · 有未发布修改', type: 'warning' })
})

test('working version status survives the adapter even when working version id is omitted', () => {
  const item = remote({ currentPublishedVersionId: '2', workingVersionStatus: 'DRAFT' })
  assert.equal(item.workingVersionStatus, 'DRAFT')
  assert.match(dashboardPublicationState(item).label, /未发布修改/)
})

test('publishing the working version changes the draft label and makes it available', () => {
  const draft = remote({ workingVersionId: '3', workingVersionStatus: 'DRAFT' })
  assert.equal(isPublishedDashboard(draft), false)
  const published = remote({ ...draft, status: 'PUBLISHED', currentPublishedVersionId: '3', workingVersionStatus: 'PUBLISHED' })
  assert.equal(isPublishedDashboard(published), true)
  assert.deepEqual(dashboardPublicationState(published), { label: '已发布', type: 'success' })
})

test('inactive dashboards do not enter the overview despite a historical published pointer', () => {
  for (const status of ['ARCHIVED', 'DISABLED', 'UNPUBLISHED', 'DELETED']) {
    assert.equal(isPublishedDashboard(remote({ status, currentPublishedVersionId: '2' })), false)
  }
})
