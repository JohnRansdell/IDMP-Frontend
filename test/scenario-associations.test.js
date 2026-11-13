import assert from 'node:assert/strict'
import test from 'node:test'
import { createScenarioAssociationService, associationStatus, changeRestriction, compareScenarioBindings } from '../src/idmp/features/indicator/scenarioAssociations.js'

const TARGET = '102027642463173253', OTHER = '102027642458358230'
const copy = value => JSON.parse(JSON.stringify(value))
const binding = (indicatorVersionId, extra = {}) => ({ indicatorVersionId, displayOrder: 0, required: false, periodType: 'QUARTERLY', dimensionGrain: ['科室'], organizationScopeDsl: { nodeType: 'TRUE' }, mappingOriginType: 'MANUAL', reportRequirementText: '原有上报要求', ...extra })
function fixture({ published = [binding(OTHER)], draft, onlyDraft = false, grants = () => true } = {}) {
  const calls = [], scene = { id: '801', name: '质量管理', status: onlyDraft ? 'DRAFT' : 'PUBLISHED', currentPublishedVersionId: onlyDraft ? null : '901', enableStatus: 'ENABLED' }
  const versions = new Map()
  if (!onlyDraft) versions.set('901', { id: '901', scenarioId: '801', versionNo: 1, publicationStatus: 'PUBLISHED', resourceVersion: 3, indicators: copy(published) })
  if (draft !== undefined || onlyDraft) versions.set('902', { id: '902', scenarioId: '801', versionNo: 2, publicationStatus: 'DRAFT', resourceVersion: 5, indicators: copy(draft || []) })
  const api = {
    fetchAllScenarios: async () => [copy(scene)],
    fetchScenarioVersions: async () => [...versions.values()].map(({ id, versionNo, publicationStatus }) => ({ id, versionNo, publicationStatus })),
    fetchScenarioVersion: async id => ({ scenario: copy(scene), version: copy(versions.get(String(id))) }),
    createScenarioVersion: async (id, body) => { calls.push({ kind: 'create', id, body }); const version = { ...copy(versions.get(body.copyFromVersionId)), id: '902', versionNo: 2, publicationStatus: 'DRAFT', resourceVersion: 0 }; versions.set('902', version); return { scenario: copy(scene), version: copy(version) } },
    replaceScenarioIndicators: async (id, body) => { calls.push({ kind: 'replace', id, body: copy(body) }); versions.get(id).indicators = copy(body.indicators); versions.get(id).resourceVersion++ }
  }
  return { scene, versions, calls, api, service: createScenarioAssociationService(api, grants) }
}

test('formal, pending addition and pending removal states derive from exact version membership', () => {
  const target = { indicators: [binding(TARGET)] }, absent = { indicators: [binding(OTHER)] }
  assert.equal(associationStatus({ published: target, draft: null }, TARGET), 'ACTIVE')
  assert.equal(associationStatus({ published: absent, draft: target }, TARGET), 'ADD')
  assert.equal(associationStatus({ published: target, draft: absent }, TARGET), 'REMOVE')
  assert.equal(associationStatus({ published: null, draft: target }, TARGET), 'ADD')
  assert.equal(associationStatus({ published: absent, draft: null }, TARGET), 'NONE')
})

test('joining a formal scene automatically copies the formal snapshot, then saves a draft without publishing', async () => {
  const { service, scene, calls } = fixture()
  const expected = await service.read(scene, TARGET)
  await service.change(expected, TARGET, 'ADD')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], { kind: 'create', id: '801', body: { copyFromVersionId: '901' } })
  assert.equal(calls[1].body.resourceVersion, 0)
  assert.deepEqual(calls[1].body.indicators[0], binding(OTHER))
  assert.equal(calls[1].body.indicators[1].indicatorVersionId, TARGET)
  assert.equal((await service.read(scene, TARGET)).status, 'ADD')
})

test('joining an existing draft keeps unrelated pending changes and every supported binding setting', async () => {
  const unrelated = binding(OTHER, { displayOrder: 9, required: true })
  const { service, scene, calls } = fixture({ draft: [unrelated] })
  await service.change(await service.read(scene, TARGET), TARGET, 'ADD')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.resourceVersion, 5)
  assert.deepEqual(calls[0].body.indicators[0], unrelated)
  assert.equal(calls[0].body.indicators[1].displayOrder, 10)
})

test('removal is stored only in draft; formal bindings stay intact until scene publication', async () => {
  const { service, scene, calls, versions } = fixture({ published: [binding(TARGET), binding(OTHER, { displayOrder: 1 })] })
  await service.change(await service.read(scene, TARGET), TARGET, 'REMOVE')
  assert.equal(calls.length, 2)
  assert.deepEqual(versions.get('901').indicators.map(row => row.indicatorVersionId), [TARGET, OTHER])
  assert.deepEqual(versions.get('902').indicators.map(row => row.indicatorVersionId), [OTHER])
  assert.equal((await service.read(scene, TARGET)).status, 'REMOVE')
})

test('undoing a removal restores its formal period, grain, scope and reporting settings', async () => {
  const original = binding(TARGET, { required: true, reportRequirementText: '需恢复原要求' })
  const { service, scene, versions } = fixture({ published: [original, binding(OTHER)], draft: [binding(OTHER)] })
  await service.change(await service.read(scene, TARGET), TARGET, 'ADD')
  const restored = versions.get('902').indicators.find(row => row.indicatorVersionId === TARGET)
  assert.deepEqual({ ...restored, displayOrder: original.displayOrder }, original)
})

test('undoing a pending addition removes only that draft binding', async () => {
  const { service, scene, versions } = fixture({ draft: [binding(OTHER), binding(TARGET)] })
  await service.change(await service.read(scene, TARGET), TARGET, 'REMOVE')
  assert.deepEqual(versions.get('902').indicators.map(row => row.indicatorVersionId), [OTHER])
  assert.equal((await service.read(scene, TARGET)).status, 'NONE')
})

test('last indicator is blocked before draft creation and before any write', async () => {
  for (const options of [{ published: [binding(TARGET)] }, { onlyDraft: true, draft: [binding(TARGET)] }]) {
    const { service, scene, calls } = fixture(options)
    await assert.rejects(service.change(await service.read(scene, TARGET), TARGET, 'REMOVE'), /最后一个指标/)
    assert.deepEqual(calls, [])
  }
})

test('changed resource version or settings require a new confirmation instead of overwriting concurrent work', async () => {
  const { service, scene, calls, versions } = fixture({ draft: [binding(OTHER)] })
  const expected = await service.read(scene, TARGET)
  versions.get('902').resourceVersion++
  await assert.rejects(service.change(expected, TARGET, 'ADD'), /重新确认/)
  assert.deepEqual(calls, [])
})

test('missing permissions, disabled scenes and duplicate versions fail closed', async () => {
  const restricted = fixture({ grants: () => false })
  await assert.rejects(restricted.service.change(await restricted.service.read(restricted.scene, TARGET), TARGET, 'ADD'), /权限/)
  assert.deepEqual(restricted.calls, [])
  const normal = fixture()
  normal.scene.enableStatus = 'DISABLED'
  assert.match(changeRestriction(await normal.service.read(normal.scene, TARGET), TARGET, 'ADD'), /停用/)
  const invalid = fixture({ draft: [binding(OTHER), binding(OTHER)] })
  await assert.rejects(invalid.service.read(invalid.scene, TARGET), /重复/)
})

test('existing matching binding is a no-op and late context changes stop writes', async () => {
  const { service, scene, calls } = fixture({ draft: [binding(OTHER), binding(TARGET)] })
  assert.equal((await service.change(await service.read(scene, TARGET), TARGET, 'ADD')).changed, false)
  await assert.rejects(service.change(await service.read(scene, TARGET), TARGET, 'REMOVE', () => { throw new Error('页面已切换') }), /切换/)
  assert.deepEqual(calls, [])
})

test('new empty draft accepts additions, while a full 500-item list is rejected without writes', async () => {
  const empty = fixture({ onlyDraft: true })
  await empty.service.change(await empty.service.read(empty.scene, TARGET), TARGET, 'ADD')
  assert.equal(empty.calls[0].body.indicators.length, 1)
  const full = fixture({ draft: Array.from({ length: 500 }, (_, n) => binding(String(n))) })
  await assert.rejects(full.service.change(await full.service.read(full.scene, TARGET), TARGET, 'ADD'), /500/)
  assert.deepEqual(full.calls, [])
})

test('failed save reports that a new draft may exist, without silently retrying or publishing', async () => {
  const f = fixture()
  f.api.replaceScenarioIndicators = async () => { throw new Error('版本冲突') }
  await assert.rejects(f.service.change(await f.service.read(f.scene, TARGET), TARGET, 'ADD'), /已创建场景草稿.*版本冲突/)
  assert.equal(f.calls.length, 1)
})

test('change summary distinguishes added, removed and modified exact indicator versions', () => {
  const before = [binding('1'), binding('2')]
  const after = [binding('2', { required: true }), binding('3')]
  const diff = compareScenarioBindings(after, before)
  assert.deepEqual(diff.added.map(row => row.indicatorVersionId), ['3'])
  assert.deepEqual(diff.removed.map(row => row.indicatorVersionId), ['1'])
  assert.deepEqual(diff.changed.map(row => row.indicatorVersionId), ['2'])
})
