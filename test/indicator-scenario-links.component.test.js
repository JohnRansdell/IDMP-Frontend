import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { associationLabels, changeRestriction, createScenarioAssociationService } from '../src/idmp/features/indicator/scenarioAssociations.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/IndicatorScenarioLinks.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ states, joinOpen, selectedScenarioIds, joinError, error, notice, join, requestChange, load, busy })\n</script>'))
const compiled = compileScript(descriptor, { id: 'scenario-association-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [original, local = original] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${original};`
})).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Button = vue.defineComponent({ props: ['disabled'], emits: ['click'], setup: (props, { slots, emit }) => () => vue.h('button', { disabled: props.disabled, onClick: () => !props.disabled && emit('click') }, slots.default?.()) })
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Alert = vue.defineComponent({ props: ['title'], setup: props => () => vue.h('p', props.title) })
const TARGET = '102027642463173253', OTHER = '102027642458358230'
const clone = value => JSON.parse(JSON.stringify(value))
const binding = id => ({ indicatorVersionId: id, displayOrder: 0, required: false, periodType: 'QUARTERLY', dimensionGrain: ['科室'], organizationScopeDsl: { nodeType: 'TRUE' }, reportRequirementText: '原有要求' })
function create({ published = true, permission = true, confirm = async () => {}, overrides = {} } = {}) {
  const scenes = [
    { id: '801', name: '可加入的正式场景', status: 'PUBLISHED', currentPublishedVersionId: '901' },
    { id: '802', name: '待移出场景', status: 'PUBLISHED', currentPublishedVersionId: '903' },
    { id: '803', name: '待加入场景', status: 'DRAFT' },
    { id: '804', name: '仅剩一个指标的场景', status: 'PUBLISHED', currentPublishedVersionId: '906' }
  ]
  const versions = new Map([
    ['901', { id: '901', scenarioId: '801', versionNo: 1, publicationStatus: 'PUBLISHED', resourceVersion: 2, indicators: [binding(OTHER)] }],
    ['903', { id: '903', scenarioId: '802', versionNo: 1, publicationStatus: 'PUBLISHED', resourceVersion: 2, indicators: [binding(TARGET), binding(OTHER)] }],
    ['904', { id: '904', scenarioId: '802', versionNo: 2, publicationStatus: 'DRAFT', resourceVersion: 3, indicators: [binding(OTHER)] }],
    ['905', { id: '905', scenarioId: '803', versionNo: 1, publicationStatus: 'DRAFT', resourceVersion: 4, indicators: [binding(TARGET), binding(OTHER)] }],
    ['906', { id: '906', scenarioId: '804', versionNo: 1, publicationStatus: 'PUBLISHED', resourceVersion: 5, indicators: [binding(TARGET)] }]
  ])
  const writes = [], navigations = []
  const api = {
    fetchAllScenarios: async () => clone(scenes),
    fetchScenarioVersions: async id => [...versions.values()].filter(row => row.scenarioId === id).map(clone),
    fetchScenarioVersion: async id => ({ scenario: clone(scenes.find(row => row.id === versions.get(id).scenarioId)), version: clone(versions.get(id)) }),
    createScenarioVersion: async (id, payload) => { writes.push({ kind: 'create', id, payload }); const version = { ...clone(versions.get(payload.copyFromVersionId)), id: '902', publicationStatus: 'DRAFT', versionNo: 2, resourceVersion: 0 }; versions.set('902', version); return { version: clone(version) } },
    replaceScenarioIndicators: async (id, payload) => { writes.push({ kind: 'replace', id, payload }); versions.get(id).indicators = clone(payload.indicators); versions.get(id).resourceVersion++ },
    ...overrides
  }
  const deps = { associationLabels, changeRestriction, createScenarioAssociationService, scenarioApi: api,
    useRouter: () => ({ push: target => navigations.push(target) }), canRequest: method => method === 'GET' || permission,
    getRequestSessionRevision: () => 1, ElMessageBox: { confirm } }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(Component, { props: { indicatorId: '100', versionId: TARGET, published }, global: { components: { ElButton: Button, ElAlert: Alert, ElTag: Pass }, stubs: {
    ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>' }, ElInput: true, ElCheckbox: true
  } } })
  return { wrapper, writes, navigations, versions }
}
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)

test('card distinguishes active and pending states and does not write while loading', async () => {
  const { wrapper, writes } = create()
  await flushPromises()
  for (const text of ['已生效', '待加入', '待移出', '撤销加入', '撤销移出', '移出场景']) assert.ok(wrapper.text().includes(text), text)
  assert.deepEqual(writes, [])
  wrapper.unmount()
})

test('joining selects scene only and automatically creates its draft with the original bindings preserved', async () => {
  const { wrapper, writes } = create()
  await flushPromises()
  await button(wrapper, '加入场景').trigger('click')
  assert.equal(wrapper.vm.joinOpen, true)
  wrapper.vm.selectedScenarioIds = ['801']
  await wrapper.vm.join()
  assert.deepEqual(writes.map(row => row.kind), ['create', 'replace'])
  assert.deepEqual(writes[1].payload.indicators[0], binding(OTHER))
  assert.equal(writes[1].payload.indicators[1].indicatorVersionId, TARGET)
  assert.match(wrapper.vm.notice, /保存待加入/)
  assert.equal(wrapper.vm.joinOpen, false)
  wrapper.unmount()
})

test('pending removal can be undone and the original period and grain are restored', async () => {
  const { wrapper, writes } = create()
  await flushPromises()
  await wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '802'))
  assert.equal(writes.length, 1)
  const restored = writes[0].payload.indicators.find(row => row.indicatorVersionId === TARGET)
  assert.equal(restored.periodType, 'QUARTERLY')
  assert.deepEqual(restored.dimensionGrain, ['科室'])
  assert.match(wrapper.vm.notice, /撤销待移出/)
  wrapper.unmount()
})

test('cancelled confirmation and the last remaining indicator send no mutations', async () => {
  const { wrapper, writes } = create({ confirm: async () => { throw 'cancel' } })
  await flushPromises()
  await wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '803'))
  assert.deepEqual(writes, [])
  await wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '804'))
  assert.match(wrapper.vm.error, /最后一个指标/)
  assert.deepEqual(writes, [])
  wrapper.unmount()
})

test('draft indicator versions and read-only users cannot submit association changes', async () => {
  for (const args of [{ published: false }, { permission: false }]) {
    const { wrapper, writes } = create(args)
    await flushPromises()
    assert.equal(button(wrapper, '加入场景'), undefined)
    wrapper.vm.selectedScenarioIds = ['801']
    await wrapper.vm.join()
    await wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '803'))
    assert.deepEqual(writes, [])
    wrapper.unmount()
  }
})

test('opening pending changes navigates to the exact draft without saving anything', async () => {
  const { wrapper, navigations, writes } = create()
  await flushPromises()
  await button(wrapper, '查看变更').trigger('click')
  assert.deepEqual(navigations[0], { name: 'ScenarioEditor', params: { scenarioId: '802' }, query: { versionId: '904', tab: 'indicators' } })
  assert.deepEqual(writes, [])
  wrapper.unmount()
})

test('concurrent clicks are blocked and stale context after confirmation never submits a write', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper, writes } = create({ confirm: () => pending })
  await flushPromises()
  const first = wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '803'))
  await wrapper.vm.requestChange(wrapper.vm.states.find(row => row.scenario.id === '803'))
  await wrapper.setProps({ versionId: 'another-version' })
  resolve(); await first; await flushPromises()
  assert.deepEqual(writes, [])
  wrapper.unmount()
})

test('a failed read shows a retry error instead of editable empty content', async () => {
  const { wrapper, writes } = create({ overrides: { fetchAllScenarios: async () => { throw new Error('场景读取失败') } } })
  await flushPromises()
  assert.match(wrapper.text(), /场景读取失败/)
  assert.deepEqual(writes, [])
  wrapper.unmount()
})


test('pending card reads show a loading state instead of an empty association message', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper } = create({ overrides: { fetchAllScenarios: () => pending } })
  assert.equal(wrapper.find('[role="status"]').exists(), true)
  assert.doesNotMatch(wrapper.text(), /尚未关联场景/)
  resolve([]); await flushPromises()
  assert.equal(wrapper.find('[role="status"]').exists(), false)
  assert.match(wrapper.text(), /尚未关联场景/)
  wrapper.unmount()
})
