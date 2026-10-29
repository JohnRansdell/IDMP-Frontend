import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const { normalizeReportFilters, reportFilterFields } = await import('../src/idmp/features/analysis/reportDimensions.js')
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/features/analysis/ReportDimensionFilters.vue', import.meta.url), 'utf8'))
const code = compileScript(descriptor, { id: 'report-filters', inlineTemplate: true }).content
const bindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [original, local = original] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${original};`
})).join('\n')
const Select = { name: 'ElSelect', props: ['modelValue', 'multiple', 'filterable', 'allowCreate', 'defaultFirstOption', 'remoteMethod'], template: '<div class="select"><slot /></div>' }
const Option = { name: 'ElOption', props: ['value', 'label'], template: '<span>{{label}}</span>' }
function harness(overrides = {}) {
  const deps = { normalizeReportFilters, reportFilterFields, getRequestSessionRevision: () => 1,
    fetchIndicatorGrainOptions: async () => [{ value: '2', label: '女性' }],
    fetchDepartmentDictionary: async () => [{ code: '15', name: '骨科' }, { code: '16', name: '儿科' }],
    requestJson: async () => ({ records: [{ code: '300112', name: '医生甲' }] }), ...overrides }
  const Component = Function('vue', 'deps', `${bindings}; const {${Object.keys(deps).join(',')}} = deps; ${code.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, deps)
  return props => mount(Component, { props: { indicatorId: '1', versionId: '2', ...props }, global: { components: { ElSelect: Select, ElOption: Option } } })
}

test('dashboard selections prefill and dictionary labels replace codes without querying metrics', async () => {
  const w = harness()({ fields: [{ code: '科室', label: '科室', role: 'DEPARTMENT' }, { code: '医生', label: '医生', role: 'DOCTOR' }, { code: '性别', label: '性别', grain: true }], modelValue: { 科室: ['15', '16'], 医生: '300112', 性别: '2' } })
  await flushPromises()
  assert.deepEqual(w.findAllComponents(Select).map(item => item.props('modelValue')), [['15', '16'], ['300112'], ['2']])
  for (const text of ['骨科', '儿科', '医生甲', '女性']) assert.ok(w.text().includes(text))
  assert.equal(w.emitted('update:modelValue'), undefined)
  w.unmount()
})

test('multiselect and clearing emit a draft, preserve other fields and allow custom path values', async () => {
  const w = harness()({ fields: [{ code: '诊断', label: '主要诊断' }], modelValue: { 诊断: ['J18'], 性别: ['2'] } })
  await flushPromises()
  const select = w.findAllComponents(Select)[0]
  for (const prop of ['multiple', 'filterable', 'allowCreate', 'defaultFirstOption']) assert.notEqual(select.props(prop), undefined)
  select.vm.$emit('update:modelValue', ['J18', 'I10'])
  assert.deepEqual(w.emitted('update:modelValue').at(-1)[0], { 诊断: ['J18', 'I10'], 性别: ['2'] })
  select.vm.$emit('update:modelValue', [])
  assert.deepEqual(w.emitted('update:modelValue').at(-1)[0], { 性别: ['2'] })
  w.unmount()
})

test('late candidates from a previous version cannot repopulate the new filter controls', async () => {
  let resolve
  const w = harness({ fetchIndicatorGrainOptions: () => new Promise(done => { resolve = done }) })({ fields: [{ code: '性别', label: '性别', grain: true }], modelValue: { 性别: '2' } })
  await w.setProps({ versionId: '3', modelValue: {}, fields: [{ code: '年龄', label: '年龄', grain: true }] })
  resolve([{ value: '2', label: '旧版本候选' }])
  await flushPromises()
  assert.doesNotMatch(w.text(), /旧版本候选|性别/)
  w.unmount()
})

test('candidate failures are visible while the selected filter is preserved', async () => {
  const w = harness({ fetchIndicatorGrainOptions: async () => { throw new Error('无候选读取权限') } })({ fields: [{ code: '性别', label: '性别', grain: true }], modelValue: { 性别: '2' } })
  await flushPromises()
  assert.match(w.get('[role="alert"]').text(), /无候选读取权限/)
  assert.deepEqual(w.findComponent(Select).props('modelValue'), ['2'])
  w.unmount()
})

test('late version metadata reloads dictionary labels for prefilled route values', async () => {
  const w = harness()({ fields: [], modelValue: { 科室: '15' } })
  await flushPromises()
  assert.match(w.text(), /15/)
  await w.setProps({ fields: [{ code: '科室', label: '科室', role: 'DEPARTMENT' }] })
  await flushPromises()
  assert.match(w.text(), /骨科/)
  assert.deepEqual(w.findComponent(Select).props('modelValue'), ['15'])
  w.unmount()
})

test('candidates returned after an account switch cannot expose the previous scope', async () => {
  let session = 1, resolve
  const w = harness({ getRequestSessionRevision: () => session, fetchDepartmentDictionary: () => new Promise(done => { resolve = done }) })({ fields: [{ code: '科室', label: '科室', role: 'DEPARTMENT' }], modelValue: { 科室: '15' } })
  session = 2
  resolve([{ code: '16', name: '上个账号可见科室' }])
  await flushPromises()
  assert.doesNotMatch(w.text(), /上个账号可见科室/)
  w.unmount()
})
