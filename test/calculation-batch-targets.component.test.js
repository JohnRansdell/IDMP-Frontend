import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { calculationQueryError } from '../src/idmp/utils/calculationQuery.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/CalculationBatchTargets.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ targets, page, loading, error, loadPage, expandTarget, changePage })\n</script>'))
const compiled = compileScript(descriptor, { id: 'batch-targets-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, specifiers]) => specifiers.split(',').map(specifier => {
    const [imported, local = imported] = specifier.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Panel = vue.defineComponent({ name: 'CalculationTargetsPanel', props: ['targets', 'batchStatus', 'retryingNodeId'], emits: ['expand', 'retry'], setup: props => () => vue.h('div', props.targets.map(t => `${t.targetId}:${t.nodes?.length ?? '-'}:${t.nodesError || ''}`).join('|')) })
const State = vue.defineComponent({ props: ['title', 'description'], setup: (props, { slots }) => () => vue.h('div', [props.title, props.description, slots.actions?.()]) })
const Pagination = vue.defineComponent({ name: 'ElPagination', props: ['total', 'currentPage', 'pageSize', 'disabled'], emits: ['current-change'], setup: () => () => vue.h('div') })
const Button = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) })
const overview = (id = '102027642461312818') => ({ batchId: id, status: 'RUNNING', targetCount: 10001 })
function create(overrides = {}) {
  const calls = []
  const deps = {
    StatePanel: State, CalculationTargetsPanel: Panel, calculationQueryError,
    fetchCalcTargets: async (id, page, size, options) => { calls.push(['page', id, page, size, options.signal]); return { total: '10001', records: [{ targetId: String(page * 20), status: 'RUNNING', nodes: [] }] } },
    fetchCalcTargetNodes: async (id, targetId, options) => { calls.push(['nodes', id, targetId, options.signal]); return [{ nodeId: '1', status: 'RUNNING', attemptNo: 1 }] },
    ...overrides
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${bindings}; ${code}`)(vue, deps)
  const wrapper = mount(Component, { props: { overview: overview() }, global: { components: { ElButton: Button, ElPagination: Pagination }, stubs: { ElEmpty: true } } })
  return { wrapper, calls }
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

test('initial load requests twenty targets and never loads nodes until expanded', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  assert.deepEqual(calls.map(call => call.slice(0, 4)), [['page', overview().batchId, 1, 20]])
  assert.equal(wrapper.findComponent(Pagination).props('total'), 10001)
  wrapper.findComponent(Panel).vm.$emit('expand', '20')
  await flushPromises()
  assert.deepEqual(calls[1].slice(0, 3), ['nodes', overview().batchId, '20'])
  assert.equal(wrapper.vm.targets[0].nodes[0].attemptNo, 1)
  wrapper.findComponent(Panel).vm.$emit('retry', { nodeId: '1' })
  assert.deepEqual(wrapper.emitted('retry'), [[{ nodeId: '1' }]])
  wrapper.unmount()
})

test('page change aborts obsolete nodes, keeps IDs exact and does not fetch every target', async () => {
  const pending = deferred()
  let signal
  const { wrapper, calls } = create({ fetchCalcTargetNodes: async (_batch, _target, options) => { signal = options.signal; return pending.promise } })
  await flushPromises()
  wrapper.vm.expandTarget('20')
  await vue.nextTick()
  wrapper.findComponent(Pagination).vm.$emit('current-change', 2)
  await flushPromises()
  assert.equal(signal.aborted, true)
  assert.equal(wrapper.vm.page, 2)
  assert.equal(wrapper.vm.targets[0].targetId, '40')
  pending.resolve([{ nodeId: 'obsolete' }]); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodes, undefined)
  assert.deepEqual(calls.map(call => call.slice(0, 4)), [['page', overview().batchId, 1, 20], ['page', overview().batchId, 2, 20]])
  wrapper.unmount()
})

test('refresh retains current page and expanded target, and fetches the new execution', async () => {
  let attempt = 1
  const { wrapper } = create({ fetchCalcTargetNodes: async () => [{ nodeId: '1', attemptNo: attempt }] })
  await flushPromises()
  wrapper.vm.changePage(2); await flushPromises()
  wrapper.vm.expandTarget('40'); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodes[0].attemptNo, 1)
  attempt = 2
  await wrapper.setProps({ overview: { ...overview(), status: 'SUCCEEDED' } }); await flushPromises()
  assert.equal(wrapper.vm.page, 2)
  assert.equal(wrapper.vm.targets[0].nodes[0].attemptNo, 2)
  assert.equal(wrapper.vm.targets[0].nodesLoading, false)
  wrapper.unmount()
})

test('collapsed targets ignore late errors and can be opened again', async () => {
  const pending = deferred()
  let reads = 0
  const { wrapper } = create({ fetchCalcTargetNodes: async () => ++reads === 1 ? pending.promise : [{ nodeId: 'latest' }] })
  await flushPromises()
  wrapper.vm.expandTarget('20'); await vue.nextTick()
  wrapper.vm.expandTarget('')
  pending.reject(new Error('过期错误')); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodesError, '')
  wrapper.vm.expandTarget('20'); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodes[0].nodeId, 'latest')
  wrapper.unmount()
})

test('target and node failures remain independently retryable and timeouts never imply failed calculation', async () => {
  let failPage = true, failNodes = true
  const { wrapper } = create({
    fetchCalcTargets: async () => { if (failPage) throw { status: 408 }; return { total: '1', records: [{ targetId: '20' }] } },
    fetchCalcTargetNodes: async () => { if (failNodes) throw new Error('源服务暂不可用'); return [{ nodeId: 'ok' }] }
  })
  await flushPromises()
  assert.match(wrapper.text(), /查询超时不代表计算失败或已停止/)
  failPage = false
  await wrapper.find('button').trigger('click'); await flushPromises()
  wrapper.vm.expandTarget('20'); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodesError, '源服务暂不可用')
  assert.equal(wrapper.findComponent(Panel).exists(), true)
  failNodes = false
  wrapper.vm.expandTarget('20'); await flushPromises()
  assert.equal(wrapper.vm.targets[0].nodes[0].nodeId, 'ok')
  wrapper.unmount()
})

test('batch switch and unmount prevent stale target responses from changing the new context', async () => {
  const old = deferred()
  const { wrapper } = create({ fetchCalcTargets: async id => id === overview().batchId ? old.promise : { total: '1', records: [{ targetId: 'new' }] } })
  await wrapper.setProps({ overview: overview('102027642461312999') }); await flushPromises()
  old.resolve({ total: '9', records: [{ targetId: 'old' }] }); await flushPromises()
  assert.equal(wrapper.vm.targets[0].targetId, 'new')
  wrapper.unmount()
  const pending = deferred(), state = create({ fetchCalcTargets: () => pending.promise })
  state.wrapper.unmount()
  pending.resolve({ total: '1', records: [{ targetId: 'late' }] }); await flushPromises()
  assert.deepEqual(state.wrapper.emitted('retry'), undefined)
})
