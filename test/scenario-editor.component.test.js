import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapters from '../src/idmp/api/adapters/scenario.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/ScenarioEditor.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ form, saveAll, publish, saving, publishing, editable, pendingIndicatorId, availableIndicatorOptions, addIndicator, removeIndicator, openIndicator })\n</script>'))
const compiled = compileScript(descriptor, { id: 'scenario-editor-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled'], emits: ['click'], setup: (props, { slots, emit }) => () => vue.h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()) })
const Header = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('header', slots.actions?.()) })
const Pane = vue.defineComponent({ props: ['label'], setup: (props, { slots }) => () => vue.h('section', { 'aria-label': props.label }, slots.default?.()) })

function create(overrides = {}, status = 'DRAFT') {
  const calls = [], messages = [], navigations = []
  const server = {
    scenario: { id: '10', code: 'SCENE_TEST', name: '测试场景', type: 'CUSTOM' },
    version: { id: '11', versionNo: 1, publicationStatus: status, resourceVersion: 0, defaultPeriodType: 'MONTHLY',
      indicators: [{ indicatorVersionId: '100000000000000001', indicatorName: '测试指标', required: true }] }
  }
  const snapshot = () => JSON.parse(JSON.stringify(server))
  const deps = {
    ...adapters, PageHeader: Header, CodeTooltip: Pass,
    useRoute: () => ({ params: { scenarioId: '10' }, query: { versionId: '11' } }),
    useRouter: () => ({ push: target => navigations.push(target), replace: async () => {} }),
    ElMessage: { success: value => messages.push(value), error: value => messages.push(value) },
    ElMessageBox: { confirm: async () => {} },
    fetchIndicatorVersionList: async () => [
      { id: '100000000000000001', indicatorId: '40', indicatorName: '测试指标', versionNo: 1, publicationStatus: 'PUBLISHED' },
      { id: '100000000000000002', indicatorId: '41', indicatorName: '第二个指标', versionNo: 2, publicationStatus: 'PUBLISHED' },
      { id: '100000000000000003', indicatorName: '草稿指标', publicationStatus: 'DRAFT' }
    ],
    fetchIndicatorVersion: async id => { calls.push(['indicatorVersion', id]); return { indicatorId: '42' } },
    fetchScenarioVersion: async () => snapshot(), fetchScenarioVersions: async () => [snapshot().version],
    createScenarioVersion: async () => snapshot(),
    updateScenarioVersion: async (id, payload) => {
      calls.push(['patch', id, payload])
      assert.equal(payload.resourceVersion, server.version.resourceVersion)
      server.scenario.name = payload.name
      Object.assign(server.version, payload, { resourceVersion: server.version.resourceVersion + 1 })
      return snapshot()
    },
    replaceScenarioIndicators: async (id, payload) => {
      calls.push(['indicators', id, payload])
      assert.equal(payload.resourceVersion, server.version.resourceVersion)
      server.version.indicators = payload.indicators
      server.version.resourceVersion++
      return snapshot()
    },
    validateScenarioVersion: async id => {
      calls.push(['check', id])
      server.version.resourceVersion++
      return { valid: true, resourceVersion: server.version.resourceVersion }
    },
    publishScenarioVersion: async (id, resourceVersion) => {
      calls.push(['publish', id, resourceVersion])
      assert.equal(resourceVersion, server.version.resourceVersion)
      server.version.publicationStatus = 'PUBLISHED'
      return snapshot()
    },
    ...overrides
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(Component, { global: {
    components: { ElButton: Button, ElTabs: Pass, ElTabPane: Pane, ElForm: Pass, ElFormItem: Pass, ElInput: Pass, ElSelect: Pass, ElOption: Pass, ElDatePicker: Pass, ElAlert: Pass },
    stubs: { ElTable: true, ElTableColumn: true, ElSwitch: true }
  } })
  return { wrapper, calls, messages, navigations }
}

test('scenario editing only exposes basic information and indicator tabs, and saves without rule requests', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  assert.deepEqual(wrapper.findAll('section[aria-label]').map(pane => pane.attributes('aria-label')), ['基本信息', '关联指标'])
  assert.equal(wrapper.findAll('button').some(button => button.text() === '校验'), false)
  wrapper.vm.form.name = '更新后的场景'
  await wrapper.vm.saveAll()
  assert.deepEqual(calls.map(([action]) => action), ['patch', 'indicators'])
  assert.equal(calls[0][2].name, '更新后的场景')
  assert.equal(wrapper.vm.form.resourceVersion, 2)
  wrapper.unmount()
})

test('publishing saves current changes, checks automatically, and publishes the latest resource version', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  wrapper.vm.form.indicators[0].reportRequirementText = '每月上报'
  await wrapper.vm.publish()
  assert.deepEqual(calls.map(([action]) => action), ['patch', 'indicators', 'check', 'publish'])
  assert.equal(calls[1][2].indicators[0].reportRequirementText, '每月上报')
  assert.equal(calls[3][2], 3)
  assert.equal(wrapper.vm.form.publicationStatus, 'PUBLISHED')
  assert.equal(wrapper.vm.editable, false)
  wrapper.unmount()
})

test('failed publication checks display the reason without a diagnostic tab or a publish request', async () => {
  const { wrapper, calls, messages } = create({ validateScenarioVersion: async () => ({ valid: false, resourceVersion: 2, diagnostics: [{ severity: 'ERROR', message: '关联指标尚未发布' }] }) })
  await flushPromises()
  await wrapper.vm.publish()
  assert.deepEqual(calls.map(([action]) => action), ['patch', 'indicators'])
  assert.ok(messages.some(message => message.includes('关联指标尚未发布')))
  assert.equal(wrapper.vm.form.publicationStatus, 'DRAFT')
  assert.equal(wrapper.vm.publishing, false)
  assert.equal(wrapper.vm.editable, true)
  wrapper.unmount()
})

test('empty indicator bindings and save failures prevent publication', async () => {
  const first = create()
  await flushPromises()
  first.wrapper.vm.form.indicators = []
  await first.wrapper.vm.publish()
  assert.deepEqual(first.calls, [])
  assert.ok(first.messages.some(message => message.includes('至少关联一个')))
  first.wrapper.unmount()
  const second = create({ replaceScenarioIndicators: async () => { throw new Error('关联指标保存失败') } })
  await flushPromises()
  await second.wrapper.vm.publish()
  assert.deepEqual(second.calls.map(([action]) => action), ['patch'])
  assert.equal(second.wrapper.vm.form.resourceVersion, 1)
  assert.equal(second.wrapper.vm.form.indicators.length, 1)
  assert.equal(second.wrapper.vm.publishing, false)
  second.wrapper.unmount()
})

test('concurrent save/publish actions are blocked and published scenes are read-only', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  let writes = 0
  const current = create({ updateScenarioVersion: async () => { writes++; await pending; throw new Error('保存失败') } })
  await flushPromises()
  const publishing = current.wrapper.vm.publish()
  await vue.nextTick()
  assert.equal(current.wrapper.vm.editable, false)
  await current.wrapper.vm.publish()
  await current.wrapper.vm.saveAll()
  assert.equal(writes, 1)
  release()
  await publishing
  assert.equal(current.wrapper.vm.editable, true)
  current.wrapper.unmount()
  {
    const readonly = create({}, 'PUBLISHED')
    await flushPromises()
    await readonly.wrapper.vm.saveAll()
    await readonly.wrapper.vm.publish()
    assert.deepEqual(readonly.calls, [])
    assert.equal(readonly.wrapper.vm.editable, false)
    readonly.wrapper.vm.pendingIndicatorId = '100000000000000002'
    readonly.wrapper.vm.addIndicator()
    readonly.wrapper.vm.removeIndicator('100000000000000001')
    assert.equal(readonly.wrapper.vm.form.indicators.length, 1)
    readonly.wrapper.unmount()
  }
})

test('adding and removing bindings preserves requirements, excludes drafts and duplicates, and saves the final collection', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  wrapper.vm.form.indicators[0].reportRequirementText = '保留原上报要求'
  wrapper.vm.form.indicators[0].required = false
  assert.deepEqual(wrapper.vm.availableIndicatorOptions.map(item => item.id), ['100000000000000002'])
  wrapper.vm.pendingIndicatorId = '100000000000000002'
  wrapper.vm.addIndicator()
  assert.equal(wrapper.vm.form.indicators.length, 2)
  assert.equal(wrapper.vm.pendingIndicatorId, '')
  assert.equal(wrapper.vm.form.indicators[0].reportRequirementText, '保留原上报要求')
  assert.equal(wrapper.vm.form.indicators[0].required, false)
  wrapper.vm.pendingIndicatorId = '100000000000000001'
  wrapper.vm.addIndicator()
  assert.equal(wrapper.vm.form.indicators.length, 2)
  wrapper.vm.removeIndicator('100000000000000001')
  assert.equal(wrapper.vm.form.indicators[0].indicatorVersionId, '100000000000000002')
  assert.equal(wrapper.vm.form.indicators[0].displayOrder, 0)
  await wrapper.vm.saveAll()
  assert.equal(calls[1][2].indicators.length, 1)
  assert.equal(calls[1][2].indicators[0].indicatorVersionId, '100000000000000002')
  wrapper.unmount()
})

test('viewing a binding opens the selected indicator version and resolves older binding metadata when needed', async () => {
  const { wrapper, calls, navigations } = create()
  await flushPromises()
  await wrapper.vm.openIndicator(wrapper.vm.form.indicators[0])
  assert.deepEqual(navigations[0], { name: 'IndicatorDetail', params: { id: '40' }, query: { indicatorVersionId: '100000000000000001' } })
  assert.deepEqual(calls, [])
  await wrapper.vm.openIndicator({ indicatorVersionId: '100000000000000099' })
  assert.deepEqual(calls, [['indicatorVersion', '100000000000000099']])
  assert.equal(navigations[1].params.id, '42')
  wrapper.unmount()
})
