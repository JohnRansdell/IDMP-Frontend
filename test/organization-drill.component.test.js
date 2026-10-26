import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as organization from '../src/idmp/features/indicator/organizationDrill.js'
import { serializeDrillPaths, sqlImportGroupingFields } from '../src/idmp/features/indicator/grouping.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const icons = await import('@element-plus/icons-vue')
const { mount } = await import('@vue/test-utils')
const { descriptor } = parse(readFileSync(new URL('../src/idmp/components/OrganizationDrillPathEditor.vue', import.meta.url), 'utf8'))
let code = compileScript(descriptor, { id: 'organization-editor', inlineTemplate: true }).content
code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g, (_, names) => names.split(',').map(value => {
  const [name, alias = name] = value.trim().split(/\s+as\s+/)
  return `const ${alias} = vue.${name};`
}).join('\n')).replace(/^import .*$/gm, '').replace('export default', 'return')
const Editor = Function('vue', 'icons', 'organization', `const { ArrowRight } = icons; const { ${Object.keys(organization).join(',')} } = organization; ${code}`)(vue, icons, organization)
const Field = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled }, slots.default?.()) })
const Alert = vue.defineComponent({ props: ['title'], setup: props => () => vue.h('p', props.title) })
function create(paths = [], disabled = false) {
  let wrapper
  wrapper = mount(Editor, { props: { modelValue: paths, disabled, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) }, global: {
    components: { ElSwitch: Field, ElInput: Field, ElSelect: Field, ElButton: Button, ElAlert: Alert },
    stubs: { ElForm: { template: '<div><slot /></div>' }, ElFormItem: { template: '<div><slot /></div>' }, ElIcon: { template: '<span><slot /></span>' }, ElOption: true }
  } })
  return wrapper
}
const current = wrapper => wrapper.props('modelValue')
const custom = { pathCode: 'CUSTOM_DISEASE', pathName: '病种下钻', maxLevel: 'DISEASE', levels: [{ levelCode: 'ROOT', levelName: '全院' }, { levelCode: 'DISEASE', levelName: '病种', dimensionFieldCode: '病种' }] }
const department = (role = 'IN_DEPT') => ({ levelCode: role, levelName: '入院科室', dimensionFieldCode: '入院科室编码', memberKeyFieldCode: '入院科室编码', displayFieldCode: '入院科室名称' })
const path = { pathCode: 'ORGANIZATION', pathName: '组织下钻路径', maxLevel: 'IN_DEPT', levels: [{ levelCode: 'HOSPITAL', levelName: '全院' }, department()] }

test('new indicators start disabled and enable only the fixed hospital-to-department chain', async () => {
  const w = create([custom])
  assert.match(w.text(), /不会按科室隔离/)
  assert.equal(w.findAllComponents({ name: 'ElInput' }).length, 0)
  w.findComponent(Field).vm.$emit('update:modelValue', true)
  await vue.nextTick()
  assert.deepEqual(current(w)[0], custom)
  const selected = organization.organizationPath(current(w))
  assert.equal(selected.levels[1].dimensionFieldCode, '科室')
  assert.equal(organization.organizationConfigurationError(current(w)), '')
  assert.deepEqual(selected.levels.map(level => level.levelName), ['医院', '科室'])
  assert.doesNotMatch(w.text(), /不会按科室隔离/)
  w.unmount()
})

test('only department or doctor depth can be selected; source-field semantics do not create new levels', async () => {
  const w = create(organization.setOrganizationEnabled([custom], true))
  const change = async (label, value) => {
    const field = w.findAllComponents(Field).find(item => item.attributes('aria-label') === label)
    field.vm.$emit('update:modelValue', value)
    await vue.nextTick()
  }
  await change('组织下钻最深层级', 'ATTENDING_DOCTOR')
  assert.equal(organization.organizationConfigurationError(current(w)), '')
  const payload = serializeDrillPaths(current(w))
  assert.deepEqual(payload[1].levels.map(level => level.levelName), ['医院', '科室', '医生'])
  assert.equal(payload[1].levels[1].memberKeyFieldCode, '科室')
  assert.deepEqual(sqlImportGroupingFields(payload), ['病种', '科室', '医生'])
  assert.doesNotMatch(w.text(), /入院科室|出院科室|转入科室|添加层级/)
  assert.throws(() => organization.setOrganizationDepth(current(w), 'IN_DEPT'), /仅支持/)
  await change('是否启用组织下钻', false)
  assert.deepEqual(current(w), [custom])
  assert.match(w.text(), /不会按科室隔离/)
  w.unmount()
})

test('historical selections retain their exact maximum and are editable without rewriting published paths', async () => {
  const legacy = { ...path, pathVersionId: '999', levels: [...path.levels, { levelCode: 'ATTENDING_DOCTOR', levelName: '医生', dimensionFieldCode: '医生' }] }
  const snapshot = JSON.stringify(legacy)
  const w = create([legacy])
  assert.equal(w.get('[aria-label="组织下钻链路"]').text(), '医院科室')
  const field = w.findAllComponents(Field).find(item => item.attributes('aria-label') === '组织下钻最深层级')
  field.vm.$emit('update:modelValue', 'DEPARTMENT')
  await vue.nextTick()
  const edited = current(w)[0]
  assert.equal(edited.pathVersionId, undefined)
  assert.equal(edited.maxLevel, 'DEPARTMENT')
  assert.equal(edited.levels[1].dimensionFieldCode, '入院科室编码')
  assert.equal(edited.levels.length, 2)
  assert.equal(JSON.stringify(legacy), snapshot)
  w.unmount()
  const published = create([legacy], true)
  assert.ok(published.findAllComponents(Field).every(item => item.props('disabled')))
  assert.ok(published.findAll('button').every(item => item.attributes('disabled') !== undefined))
  published.unmount()
})

test('organization validation rejects hospital-only, doctor-first, duplicate roles and malformed fields', () => {
  assert.equal(organization.organizationConfigurationError([]), '')
  assert.equal(organization.organizationConfigurationError([path]), '')
  assert.match(organization.organizationConfigurationError([{ ...path, maxLevel: 'HOSPITAL' }]), /科室层级/)
  const doctor = { levelCode: 'ATTENDING_DOCTOR', levelName: '医生', dimensionFieldCode: '医生编码' }
  assert.match(organization.organizationConfigurationError([{ ...path, maxLevel: 'ATTENDING_DOCTOR', levels: [path.levels[0], doctor] }]), /链路必须/)
  assert.match(organization.organizationConfigurationError([{ ...path, maxLevel: 'ATTENDING_DOCTOR', levels: [...path.levels, department(), doctor] }]), /链路必须/)
  assert.match(organization.organizationConfigurationError([{ ...path, levels: [path.levels[0], { ...department(), dimensionFieldCode: 'dept;DROP' }] }]), /只能包含/)
})

test('editable organization paths bind only codes without rewriting business paths or historical snapshots', () => {
  const historical = { ...path, pathVersionId: '999' }
  const snapshot = JSON.stringify(historical)
  const result = organization.codeOnlyOrganizationPaths([custom, historical])
  assert.equal(result[0], custom)
  assert.equal(result[1].pathVersionId, undefined)
  assert.equal(result[1].levels[1].memberKeyFieldCode, '入院科室编码')
  assert.equal(result[1].levels[1].displayFieldCode, undefined)
  assert.deepEqual(sqlImportGroupingFields(result), ['病种', '入院科室编码'])
  assert.equal(JSON.stringify(historical), snapshot)
  assert.equal(organization.codeOnlyOrganizationPaths(result), result)
})

test('preflight never automatically enables organization and factor changes preserve the user choice', () => {
  const source = readFileSync(new URL('../src/idmp/views/IndicatorEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /<OrganizationDrillPathEditor v-model="selectedDrillPaths"/)
  assert.doesNotMatch(source, /applyOrganizationDefaults|organizationDefaultsInitialized/)
  assert.match(source, /path\.pathCode\.startsWith\('CUSTOM_'\) \|\| path\.pathCode === 'ORGANIZATION'/)
  assert.match(source, /dimension\.pathCode !== 'ORGANIZATION'/)
})

test('published historical custom paths do not incorrectly promise public visibility', async () => {
  const w = create([custom], true)
  await w.setProps({ legacyIsolation: true })
  assert.match(w.text(), /当前发布版本沿用历史科室隔离/)
  assert.doesNotMatch(w.text(), /具有指标读取权限的用户可查看全院结果/)
  w.unmount()
})
