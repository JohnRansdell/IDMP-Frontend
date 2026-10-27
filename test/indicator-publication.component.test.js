import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { resolveAccessGrant } from '../src/idmp/auth/accessPolicy.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const { useIndicatorPublicationState } = await import('../src/idmp/features/indicator/useIndicatorPublicationState.js')
const { descriptor } = parse(await readFile(new URL('../src/idmp/features/indicator/components/IndicatorPublishPanel.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'publication-step', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local}=vue.${imported};`
})).join('\n')
const StatePanel = vue.defineComponent({ props: ['title', 'description'], setup: props => () => vue.h('div', `${props.title} ${props.description}`) })
const Panel = Function('vue', 'StatePanel', `${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, StatePanel)
const Button = vue.defineComponent({ props: ['disabled', 'loading'], emits: ['click'], setup: (props, { slots, emit }) =>
  () => vue.h('button', { disabled: props.disabled || props.loading, onClick: () => emit('click') }, slots.default?.()) })
function panel(props = {}) {
  return mount(Panel, { props: { workflow: { versionId: 'version', published: false }, loading: {},
    policyState: {}, policyDrafts: [], gates: [], ...props }, global: {
    components: { ElButton: Button }, directives: { access: { beforeMount: (el, binding) => { el.hidden = !resolveAccessGrant(binding.value) } } }
  } })
}

test('the publication step blocks absent versions and in-flight policy writes and emits one publish intent', async () => {
  const wrapper = panel({ workflow: { versionId: '', published: false } })
  const publish = () => wrapper.findAll('button').find(button => button.text() === '发布指标版本')
  assert.equal(publish().element.disabled, true)
  await wrapper.setProps({ workflow: { versionId: 'version', published: false }, policyState: { saving: true } })
  assert.equal(publish().element.disabled, true)
  await wrapper.setProps({ policyState: { saving: false } })
  await publish().trigger('click')
  assert.equal(wrapper.emitted('publish').length, 1)
  wrapper.unmount()
})

test('published versions expose policy retries while static and temporary-parameter indicators omit formal calculation', async () => {
  const wrapper = panel({ workflow: { versionId: 'version', published: true }, policyDrafts: [{}], isStatic: true })
  assert.ok(!wrapper.text().includes('独立正式计算并查看结果'))
  const retry = wrapper.findAll('button').find(button => button.text() === '重试保存政策来源')
  await retry.trigger('click')
  assert.equal(wrapper.emitted('retry-policy').length, 1)
  await wrapper.setProps({ isStatic: false, temporaryParameters: true })
  assert.ok(!wrapper.text().includes('独立正式计算并查看结果'))
  await wrapper.setProps({ temporaryParameters: false })
  await wrapper.findAll('button').find(button => button.text() === '独立正式计算并查看结果').trigger('click')
  assert.equal(wrapper.emitted('formal-result').length, 1)
  wrapper.unmount()
})

test('publication status follows policy loading and completed workflow without mutating the definition', () => {
  const workflow = vue.reactive({ versionId: '', compiled: false, published: false })
  const policy = vue.reactive({ count: 0, pending: 0, error: '' })
  const hasResults = vue.ref(false)
  const state = useIndicatorPublicationState({ indicatorWorkflow: workflow, policySourceState: policy, hasIndicatorTrialResults: hasResults })
  assert.equal(state.canPublishIndicatorVersion.value, false)
  workflow.versionId = 'version'
  assert.ok(state.publishPanelDescription.value.includes('政策'))
  policy.count = 1; workflow.compiled = true; hasResults.value = true
  assert.equal(state.workflowSteps.value[1].state, 'complete')
  workflow.published = true
  assert.equal(state.canPublishIndicatorVersion.value, false)
  assert.equal(state.publishGates.value.at(-1).state, 'pass')
})

test('readiness distinguishes acquired results from business confirmation and resets when results are invalidated', () => {
  const workflow = vue.reactive({ versionId: 'draft', compiled: false, published: false })
  const policy = vue.reactive({ count: 1, pending: 0, error: '' })
  const hasResults = vue.ref(false)
  const state = useIndicatorPublicationState({ indicatorWorkflow: workflow, policySourceState: policy, hasIndicatorTrialResults: hasResults })
  const gate = label => state.publishGates.value.find(row => row.label === label)
  assert.deepEqual(state.workflowSteps.value.map(step => step.key), ['basic', 'formula', 'scene', 'publish'])
  assert.equal(state.workflowSteps.value[2].state, 'optional')
  assert.equal(gate('公式校验').state, 'pending')
  assert.equal(gate('试算结果').stateLabel, '待试算')
  workflow.compiled = true; hasResults.value = true
  assert.equal(gate('公式校验').state, 'pass')
  assert.equal(gate('试算结果').stateLabel, '已取得结果')
  assert.match(gate('试算结果').description, /核对数值是否符合业务预期/)
  assert.equal(gate('发布确认').state, 'pending')
  assert.doesNotMatch(JSON.stringify(state.publishGates.value), /Hash|AST|一致性.*通过/)
  hasResults.value = false; workflow.compiled = false
  assert.equal(gate('试算结果').state, 'pending')
  assert.equal(gate('公式校验').state, 'pending')
})

test('checklist navigation returns to the relevant configuration without publishing', async () => {
  const wrapper = panel({ gates: [{ label: '试算结果', description: '请核对结果', state:'pass', stateLabel:'已取得结果', targetTab:'formula', targetSection:'trial', actionLabel:'查看试算结果' }] })
  await wrapper.findAll('button').find(button => button.text() === '查看试算结果').trigger('click')
  assert.deepEqual(wrapper.emitted('navigate')[0], [{ tab:'formula', section:'trial' }])
  assert.equal(wrapper.emitted('publish'), undefined)
  await wrapper.setProps({ loading:{ publish:true } })
  assert.equal(wrapper.findAll('button').find(button => button.text() === '查看试算结果').element.disabled, true)
  wrapper.unmount()
})
