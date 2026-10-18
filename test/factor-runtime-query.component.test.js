import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { inheritedFactorParameters } from '../src/idmp/utils/factorRuntimeParameters.js'
import { buildSqlRuntimeParameterValues, validateSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'
import { normalizeTrialPeriodRecommendation, recommendationPeriod } from '../src/idmp/utils/trialPeriodRecommendation.js'
import { factorQueryRows } from '../src/idmp/features/factor/detail.js'
const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/FactorRuntimeQuery.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ load, runQuery, values, period, result, declarations, schemaError, queryError, recommendationError })\n</script>'))
const compiled = compileScript(descriptor, { id: 'factor-runtime-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => { const [imported, local = imported] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${imported};` })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Alert = vue.defineComponent({ props: ['title'], setup: (props, { slots }) => () => vue.h('div', [props.title, slots.default?.()]) })
function create(overrides = {}, props = {}) {
  const calls = []
  const deps = {
    inheritedFactorParameters, buildSqlRuntimeParameterValues, validateSqlRuntimeParameterValues, normalizeTrialPeriodRecommendation, recommendationPeriod, factorQueryRows, getStatusLabel: value => value || '-',
    RuntimeParameterFields: Pass, StatePanel: Pass,
    fetchCompileArtifact: async id => ({ id, parameterSchema: { parameters: [] } }),
    fetchFactorVersion: async () => ({ currentArtifactId: 'upstream-artifact' }),
    fetchFactorTrialPeriodRecommendation: async () => ({ availabilityStatus: 'AVAILABLE', recommendedPeriodStart: '2026-01-01T00:00:00', recommendedPeriodEnd: '2026-02-01T00:00:00' }),
    queryFactorVersion: async (id, payload, options) => { calls.push({ id, payload, options }); return { executionMode: 'AD_HOC_SOURCE', rows: [{ value: 0 }] } }, ...overrides
  }
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(component, { props: { versionId: 'version', artifactId: 'artifact', calculationMode: 'STATIC', ...props }, global: { components: { ElButton: Pass, ElAlert: Alert, ElDatePicker: Pass, ElTag: Pass }, stubs: { ElTable: true, ElTableColumn: true } } })
  return { wrapper, calls }
}
test('static queries omit periods, preserve zero values and use a fresh backend request', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  await wrapper.vm.runQuery()
  assert.deepEqual(calls, [{ id: 'version', payload: { parameters: {} }, options: { cache: 'no-store' } }])
  assert.equal(wrapper.vm.result.rows[0].value, 0)
  wrapper.unmount()
})
test('temporal queries use the recommended period and accept manual input after recommendation failure', async () => {
  const { wrapper, calls } = create({}, { calculationMode: 'TEMPORAL' })
  await flushPromises()
  await wrapper.vm.runQuery()
  assert.equal(calls[0].payload.periodStart, '2026-01-01T00:00:00')
  wrapper.unmount()
  const manual = create({ fetchFactorTrialPeriodRecommendation: async () => { throw new Error('无推荐周期') } }, { calculationMode: 'TEMPORAL' })
  await flushPromises()
  await manual.wrapper.vm.runQuery()
  assert.equal(manual.calls.length, 0)
  manual.wrapper.vm.period = ['2026-03-01T00:00:00', '2026-04-01T00:00:00']
  await vue.nextTick()
  await manual.wrapper.vm.runQuery()
  assert.equal(manual.calls.length, 1)
  manual.wrapper.unmount()
})
test('composite runtime parameters are inherited and required values are validated', async () => {
  const { wrapper, calls } = create({ fetchCompileArtifact: async id => id === 'artifact' ? { id, logicalPlan: { factorDependencies: [{ factorVersionId: 'upstream' }] } } : { id, parameterSchema: { parameters: [{ code: 'deptCode', type: 'STRING', required: true }] } } })
  await flushPromises()
  assert.equal(wrapper.vm.declarations[0].code, 'deptCode')
  await wrapper.vm.runQuery()
  assert.equal(calls.length, 0)
  wrapper.vm.values = { deptCode: 'A' }
  await vue.nextTick()
  await wrapper.vm.runQuery()
  assert.deepEqual(calls[0].payload.parameters, { deptCode: 'A' })
  wrapper.unmount()
})
test('failed parameter schema blocks queries and retry can recover', async () => {
  let fail = true
  const { wrapper, calls } = create({ fetchCompileArtifact: async id => { if (fail) throw new Error('产物读取失败'); return { id } } })
  await flushPromises()
  await wrapper.vm.runQuery()
  assert.equal(calls.length, 0)
  assert.match(wrapper.vm.schemaError, /读取失败/)
  fail = false
  await wrapper.vm.load()
  await flushPromises()
  await wrapper.vm.runQuery()
  assert.equal(calls.length, 1)
  wrapper.unmount()
})
test('changing version or parameters discards pending results from the previous query', async () => {
  let release
  const result = new Promise(resolve => { release = resolve })
  const { wrapper } = create({ queryFactorVersion: () => result })
  await flushPromises()
  const query = wrapper.vm.runQuery()
  await wrapper.setProps({ versionId: 'new-version', artifactId: 'new-artifact' })
  await flushPromises()
  release({ rows: [{ value: 'old' }] })
  await query
  assert.equal(wrapper.vm.result, null)
  wrapper.unmount()
})
test('uncompiled versions cannot load parameters or execute queries', async () => {
  const { wrapper, calls } = create({}, { artifactId: '' })
  await flushPromises()
  await wrapper.vm.runQuery()
  assert.equal(calls.length, 0)
  assert.match(wrapper.text(), /尚未取得编译产物/)
  wrapper.unmount()
})
