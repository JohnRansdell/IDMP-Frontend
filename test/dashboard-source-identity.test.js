import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { completeDashboardSourceBindings } from '../src/idmp/api/adapters/dashboardSourceIdentity.js'

test('version-only components receive identity without upgrading their fixed version', async () => {
  const input = [{ id: 'draft', widgets: [{ type: 'BAR', indicatorVersionId: 'old-version', title: '历史口径', fieldBindings: { dimensions: ['科室', '性别'] } }] }]
  const snapshot = structuredClone(input)
  const [result] = await completeDashboardSourceBindings(input, {
    fetchVersion: async id => { assert.equal(id, 'old-version'); return { indicatorId: 'indicator' } },
    fetchIndicator: async () => ({ code: 'IND_CODE', name: '住院费用', currentPublishedVersionId: 'new-version' })
  })
  assert.deepEqual(input, snapshot)
  assert.equal(result.widgets[0].indicatorVersionId, 'old-version')
  assert.equal(result.widgets[0].dataSourceCode, 'IND_CODE')
  assert.equal(result.widgets[0].dataSourceName, '住院费用')
  assert.deepEqual(result.widgets[0].fieldBindings, input[0].widgets[0].fieldBindings)
})

test('complete and non-indicator widgets make no extra metadata requests', async () => {
  const widgets = [{ type: 'BAR', dataSourceCode: 'already-bound', indicatorVersionId: 'v1' },
    { type: 'TEXT' }, { type: 'WARNINGS', indicatorVersionId: 'v1' }]
  const [result] = await completeDashboardSourceBindings([{ widgets }], {
    fetchVersion: () => assert.fail('unnecessary version read'), fetchIndicator: () => assert.fail('unnecessary indicator read')
  })
  assert.deepEqual(result.widgets, widgets)
})

test('history resolution deduplicates version and indicator reads within one request', async () => {
  const reads = []
  const input = ['v1', 'v1', 'v2'].map(id => ({ widgets: [{ type: 'BAR', indicatorVersionId: id }] }))
  const result = await completeDashboardSourceBindings(input, {
    fetchVersion: async id => { reads.push(id); return { indicatorId: 'one' } },
    fetchIndicator: async id => { reads.push(id); return { code: 'ONE' } }
  })
  assert.deepEqual(reads.sort(), ['one', 'v1', 'v2'])
  assert.deepEqual(result.map(v => v.widgets[0].indicatorVersionId), ['v1', 'v1', 'v2'])
})

test('cancelled loads never continue into the owning indicator lookup', async () => {
  const controller = new AbortController()
  await assert.rejects(completeDashboardSourceBindings([{ widgets: [{ indicatorVersionId: 'v1' }] }], {
    signal: controller.signal,
    fetchVersion: async () => { controller.abort(); return { indicatorId: 'one' } },
    fetchIndicator: () => assert.fail('cancelled read continued')
  }), { name: 'AbortError' })
})

test('missing identity is explicit rather than guessing by title or another version', async () => {
  await assert.rejects(completeDashboardSourceBindings([{ widgets: [{ indicatorVersionId: 'v1', title: '同名指标' }] }], {
    fetchVersion: async () => ({}), fetchIndicator: () => assert.fail('missing owner')
  }), /缺少所属指标/)
})

test('designer fallback and preview both retain fixed-version field metadata', async () => {
  const view = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  const preview = view.slice(view.indexOf('async function previewRemoteWidget('), view.indexOf('async function previewMetricGroupItem('))
  assert.match(preview, /const fields = remoteWidgetFields\(widget\)/)
  assert.match(view, /dashboardFieldsToFrontend\(remoteWidgetFields\(widget\)\)/)
})
