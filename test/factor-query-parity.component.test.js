import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { runtimeParameterDefinition, validateFilterNode, editableFilterTree, serializeFilterNode } from '../src/idmp/utils/dslBuilder.js'
import { factorCalculationMode, factorPeriodColumn, canonicalPeriodColumn, withoutLegacyPeriod } from '../src/idmp/utils/factorPeriod.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const Select = vue.defineComponent({ name: 'ElSelect', props: ['modelValue'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Input = vue.defineComponent({ name: 'ElInput', props: ['modelValue'], emits: ['update:modelValue'], setup: () => () => vue.h('input') })
const Button = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) })
const Field = vue.defineComponent({ name: 'SemanticFieldSelector', props: ['modelValue', 'fields'], emits: ['update:modelValue'], setup: () => () => vue.h('div', 'fields') })
const Expression = vue.defineComponent({ name: 'FactorExpressionEditor', props: ['modelValue', 'fields'], emits: ['update:modelValue'], setup: () => () => vue.h('div', 'expression') })

async function load(name, deps = {}) {
  const { descriptor } = parse(await readFile(new URL(`../src/idmp/components/${name}.vue`, import.meta.url), 'utf8'))
  let code = compileScript(descriptor, { id: `parity-${name}`, inlineTemplate: true }).content
  const bindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => { const [imported, local = imported] = name.trim().split(/\s+as\s+/); return `const ${local}=vue.${imported};` })).join('\n')
  code = code.replace(/^import .*$/gm, '').replace('export default', 'return')
  return Function('vue', 'deps', `const { ${Object.keys(deps).join(', ')} }=deps;\n${bindings}\n${code}`)(vue, deps)
}
const Predicate = await load('FactorPredicateEditor', { SemanticFieldSelector: Field, RuleValueEditor: Input, FactorExpressionEditor: Expression, runtimeParameterDefinition })
const Group = await load('ConditionGroupEditor', { FactorPredicateEditor: Predicate, ArrowRight: vue.defineComponent({ render: () => null }) })
const RuleValue = await load('RuleValueEditor')
const global = { components: { ElSelect: Select, ElInput: Input, ElButton: Button }, stubs: { ElOption: true, ElCheckbox: true, ElDatePicker: true, ElIcon: true } }
const fields = [{ code: 'age', dataType: 'INTEGER', kind: 'NUMBER' }]
const select = (wrapper, name) => wrapper.findAllComponents(Select).find(item => item.attributes('aria-label') === name)

async function mountSourceEditor(overrides = {}) {
  const { descriptor } = parse(await readFile(new URL('../src/idmp/views/FactorEditor.vue', import.meta.url), 'utf8'))
  const script = compileScript(descriptor, { id: 'factor-source-modes' })
  const deps = Object.fromEntries(Object.entries(script.imports).map(([name, binding]) => [name,
    binding.source === 'vue' ? vue[binding.imported] : () => undefined]))
  Object.assign(deps, {
    onMounted: () => {}, useRoute: () => ({ params: { id: 'new' }, query: {} }), useRouter: () => ({}),
    newResourceCode: () => 'TEST', newDerivedFactor: () => ({}),
    ElMessage: { warning: message => { throw new Error(message) } },
    fetchSourceTables: async () => [], fetchPhysicalTables: async () => [],
    adaptSourceTableList: rows => rows, adaptPhysicalTableList: rows => rows,
    fetchFactorVersionsByFactor: async () => [], editableFilterTree,
    factorCalculationMode, factorPeriodColumn, canonicalPeriodColumn, withoutLegacyPeriod,
    ...overrides
  })
  const code = script.content.replace(/^import .*$/gm, '').replace('export default', 'return')
  const component = Function('deps', `const { ${Object.keys(deps).join(', ')} }=deps;\n${code}`)(deps)
  component.render = () => vue.h('div')
  const wrapper = mount(component)
  return { wrapper, state: wrapper.vm.$.setupState }
}

test('domain mode only loads domain tables and never falls back to physical sources', async () => {
  const calls = []
  const { wrapper, state } = await mountSourceEditor({
    fetchSourceTables: async () => { calls.push('physical'); return [{ tableName: 'vmq_raw' }] },
    fetchPhysicalTables: async id => { calls.push(id); return [{ tableName: 'vmq_governed' }] }
  })
  await state.loadTables()
  assert.equal(state.tables[0].tableName, 'vmq_raw')
  state.sourceMode = 'DOMAIN'
  await state.handleSourceModeChange()
  assert.deepEqual([...state.tables], [])
  assert.deepEqual(calls, ['physical'])
  state.domains = [{ id: 'domain-1', code: 'INPATIENT' }]
  state.dslForm.domainCode = 'INPATIENT'
  await state.handleDomainChange()
  assert.equal(state.tables[0].tableName, 'vmq_governed')
  state.dslForm.domainCode = ''
  await state.handleDomainChange()
  assert.deepEqual([...state.tables], [])
  assert.deepEqual(calls, ['physical', 'domain-1'])
  wrapper.unmount()
})

test('SQL drafts save the exact definition and both optimistic versions, then reload the saved version', async () => {
  const calls = []
  const dsl = { dslType: 'FACTOR', definitionType: 'SQL', sqlTemplate: 'SELECT 1 AS factor_value', calculationMode: 'STATIC',
    parameters: [{ name: 'age', type: 'INTEGER' }], output: { valueType: 'DECIMAL' } }
  const { wrapper, state } = await mountSourceEditor({
    useRoute: () => ({ params: { id: '10' }, query: {} }),
    toOpaqueId: value => value == null ? '' : String(value),
    ElMessage: { success: () => {}, error: message => { throw Error(message) }, warning: message => { throw Error(message) } },
    updateFactor: async (id, payload) => { calls.push([id, JSON.parse(JSON.stringify(payload))]); return { resourceVersion: 8 } },
    fetchFactorVersion: async () => ({ id: '11', factorId: '10', status: 'DRAFT', resourceVersion: 6, dsl: state.currentDsl })
  })
  state.unsupportedDsl = dsl; state.dslForm.calculationMode = 'STATIC'
  state.basicFormRef = { validate: async () => true }
  state.hydrateWorkflow({ id: '10' }, { id: '11', status: 'VALIDATED', resourceVersion: 5, currentArtifactId: '19' })
  state.resourceVersion = 7
  state.savedDefinition = state.definitionSnapshot(dsl)
  state.unsupportedDsl.sqlTemplate = 'SELECT 2 AS factor_value'
  await vue.nextTick()
  assert.equal(state.workflow.compiled, false)
  await state.saveFactor()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '10')
  assert.equal(calls[0][1].dsl.sqlTemplate, 'SELECT 2 AS factor_value')
  assert.deepEqual(calls[0][1].dsl.parameters, dsl.parameters)
  assert.deepEqual(calls[0][1].dsl.output, dsl.output)
  assert.equal(calls[0][1].factorVersionId, '11')
  assert.equal(calls[0][1].resourceVersion, 7)
  assert.equal(calls[0][1].versionResourceVersion, 5)
  assert.equal(state.versionResourceVersion, 6)
  assert.equal(state.resourceVersion, 8)
  assert.equal(state.workflow.artifactId, '')
  assert.equal(state.workflow.resultsLoaded, false)
  assert.equal(state.definitionDirty, false)
  wrapper.unmount()
})

test('published versions cannot save or compile even if the action is invoked directly', async () => {
  const calls = []
  const { wrapper, state } = await mountSourceEditor({
    updateFactor: async () => calls.push('save'), compileFactorVersion: async () => calls.push('compile'),
    toOpaqueId: value => value == null ? '' : String(value)
  })
  state.hydrateWorkflow({ id: '10' }, { id: '11', status: 'PUBLISHED', resourceVersion: 6 })
  await state.saveFactor(); await state.saveDerivedFactor(); await state.saveNativeSqlFactor(); await state.compileCurrentVersion()
  assert.deepEqual(calls, [])
  assert.equal(state.workflow.published, true)
  wrapper.unmount()
})

test('a draft change invalidates trial readiness and blocks compiling the old saved definition', async () => {
  const { wrapper, state } = await mountSourceEditor()
  state.unsupportedDsl = { dslType: 'FACTOR', definitionType: 'SQL', sqlTemplate: 'SELECT 1' }
  state.savedDefinition = state.definitionSnapshot(state.currentDsl)
  Object.assign(state.workflow, { versionId: '11', compiled: true, resultsLoaded: true })
  state.unsupportedDsl.sqlTemplate = 'SELECT 2'
  await vue.nextTick()
  assert.equal(state.workflow.compiled, false)
  assert.equal(state.workflow.resultsLoaded, false)
  await assert.rejects(state.compileCurrentVersion(), /请先保存草稿/)
  wrapper.unmount()
})

test('MySQL JSON key ordering does not mark a saved definition dirty', async () => {
  const { wrapper, state } = await mountSourceEditor()
  state.unsupportedDsl = { definitionType: 'SQL', dslType: 'FACTOR', output: { nullable: false, valueType: 'DECIMAL' }, sqlTemplate: 'SELECT 1' }
  state.savedDefinition = state.definitionSnapshot({ sqlTemplate: 'SELECT 1', output: { valueType: 'DECIMAL', nullable: false }, dslType: 'FACTOR', definitionType: 'SQL' })
  assert.equal(state.definitionDirty, false)
  state.unsupportedDsl.sqlTemplate = 'SELECT 2'
  assert.equal(state.definitionDirty, true)
  wrapper.unmount()
})

test('switching source mode clears source-dependent configuration including negated filters', async () => {
  const { wrapper, state } = await mountSourceEditor()
  state.sourceMode = 'DOMAIN'
  state.dslForm.domainCode = 'OLD'
  Object.assign(state.dslForm, { tableName: 'vmq_old', fieldCode: 'age', groupBy: ['dept'], periodColumn: 'in_date' })
  state.aggregateExpression = { expressionType: 'FIELD', fieldCode: 'age' }
  state.joins = [{ sourceAlias: 'join1' }]
  state.fields = [{ code: 'age' }]
  state.baseFields = [{ code: 'age' }]
  state.sourceDescriptors.base = { tableName: 'vmq_old' }
  state.relationOptions.base = [{ id: 'relation-1' }]
  Object.assign(state.filters, { nodeType: 'NOT', child: { nodeType: 'AND', children: [{ nodeType: 'TRUE' }] } })
  await state.handleSourceModeChange()
  for (const key of ['domainCode', 'tableName', 'fieldCode', 'periodColumn']) assert.equal(state.dslForm[key], '')
  for (const rows of [state.dslForm.groupBy, state.joins, state.fields, state.baseFields, state.filters.child.children]) assert.equal(rows.length, 0)
  assert.equal(state.aggregateExpression, null)
  assert.deepEqual(Object.keys(state.sourceDescriptors), [])
  assert.deepEqual(Object.keys(state.relationOptions), [])
  state.sourceMode = 'PHYSICAL'
  await state.handleSourceModeChange()
  assert.equal(state.dslForm.domainCode, '')
  wrapper.unmount()
})

test('a stale physical-table response cannot populate an unselected domain mode', async () => {
  let resolveTables
  const { wrapper, state } = await mountSourceEditor({ fetchSourceTables: () => new Promise(resolve => { resolveTables = resolve }) })
  const pending = state.loadTables()
  state.sourceMode = 'DOMAIN'
  await state.handleSourceModeChange()
  resolveTables([{ tableName: 'vmq_stale' }])
  await pending
  assert.deepEqual([...state.tables], [])
  assert.equal(state.sourceTablesLoading, false)
  wrapper.unmount()
})

test('saved factor domain configuration determines source mode on edit', async () => {
  for (const domainCode of ['', 'INPATIENT']) {
    const { wrapper, state } = await mountSourceEditor({
      fetchFactor: async () => ({ id: 'factor-1', dsl: { calculationMode: 'STATIC', primaryDomain: { domainCode }, filters: { nodeType: 'TRUE' } } })
    })
    state.domains = [{ id: 'domain-1', code: 'INPATIENT' }]
    await state.loadExisting()
    assert.equal(state.sourceMode, domainCode ? 'DOMAIN' : 'PHYSICAL')
    wrapper.unmount()
  }
})

test('value-set-bound fields still accept fixed values when standard values are not selected', () => {
  const wrapper = mount(RuleValue, { props: { field: { kind: 'VALUE_SET', dataType: 'STRING', options: [{ code: 'M', value: '1', label: '男性' }] },
    operator: 'EQ', modelValue: '2', useValueSet: false }, global })
  assert.equal(wrapper.findAllComponents(Input).length, 1)
  assert.equal(wrapper.findAllComponents(Select).length, 0)
  wrapper.unmount()
})

test('ordinary fields expose comparison operators and runtime parameters without value sets', async () => {
  const condition = vue.reactive({ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 })
  const wrapper = mount(Predicate, { props: { condition, fields }, global })
  assert.ok(select(wrapper, '判断方式').findAll('el-option-stub').some(item => item.attributes('value') === 'GTE'))
  select(wrapper, '条件值来源').vm.$emit('update:modelValue', 'PARAMETER'); await vue.nextTick()
  assert.equal(condition.parameterDefinition.type, 'INTEGER')
  const input = wrapper.findAllComponents(Input).find(item => item.attributes('aria-label') === '运行参数名称')
  input.vm.$emit('update:modelValue', ''); await vue.nextTick()
  assert.ok(wrapper.findAllComponents(Input).some(item => item.attributes('aria-label') === '运行参数名称'), 'clearing a parameter name does not hide its input')
  assert.match(validateFilterNode(condition, [], fields).join(' '), /运行参数名称/)
  input.vm.$emit('update:modelValue', 'minAge'); await vue.nextTick()
  assert.deepEqual(validateFilterNode(condition, [], fields), [])
  select(wrapper, '判断方式').vm.$emit('update:modelValue', 'IS_NULL'); await vue.nextTick()
  assert.equal(condition.parameter, undefined)
  assert.equal(select(wrapper, '条件值来源'), undefined)
  wrapper.unmount()
})

test('logical groups add OR and NOT conditions, and existing NOT leaves remain editable', async () => {
  const original = { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 } }
  const node = vue.reactive(editableFilterTree(original))
  const wrapper = mount(Group, { props: { node, fields }, global })
  assert.equal(wrapper.findAllComponents(Predicate).length, 0)
  await wrapper.find('button[aria-label="展开条件组 1"]').trigger('click')
  await wrapper.find('button[aria-label="展开条件 1"]').trigger('click')
  assert.equal(wrapper.findAllComponents(Predicate).length, 1)
  assert.equal(node.children[0].child.nodeType, 'AND')
  const nestedRegion = wrapper.find('[role="region"][aria-label="条件组 1"]')
  await nestedRegion.findAll('button').find(item => item.text() === '添加条件组').trigger('click')
  assert.equal(node.children[0].child.children.length, 2)
  const modes = wrapper.findAllComponents(Select).filter(item => item.attributes('aria-label') === '条件组合方式')
  modes[0].vm.$emit('update:modelValue', 'OR'); await vue.nextTick()
  assert.equal(node.nodeType, 'OR')
  assert.equal(serializeFilterNode(node).children[0].nodeType, 'NOT')
  wrapper.unmount()
})

test('fixed expression values and fields remain distinct when switching value sources', async () => {
  const condition = vue.reactive({ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 })
  const wrapper = mount(Predicate, { props: { condition, fields }, global })
  select(wrapper, '筛选对象').vm.$emit('update:modelValue', 'EXPRESSION'); await vue.nextTick()
  assert.equal(condition.left.expressionType, 'FIELD')
  select(wrapper, '条件值来源').vm.$emit('update:modelValue', 'FIXED'); await vue.nextTick()
  assert.equal(condition.right.expressionType, 'LITERAL')
  assert.equal(select(wrapper, '条件值来源').props('modelValue'), 'FIXED')
  wrapper.unmount()
})

test('combination dropdown toggles negation without losing conditions or changing AND/OR semantics', async () => {
  const node = vue.reactive({ nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }] })
  const wrapper = mount(Group, { props: { node, fields }, global })
  const children = node.children
  await wrapper.find('button[aria-label="展开条件 1"]').trigger('click')
  for (const mode of ['NOT_AND', 'NOT_OR', 'OR', 'NOT_AND', 'AND']) {
    select(wrapper, '条件组合方式').vm.$emit('update:modelValue', mode)
    await vue.nextTick()
    const negated = mode.startsWith('NOT_')
    assert.equal(node.nodeType, negated ? 'NOT' : mode)
    assert.equal(negated ? node.child.children : node.children, children)
    assert.equal(select(wrapper, '条件组合方式').props('modelValue'), mode)
    assert.equal(wrapper.findAllComponents(Predicate).length, 1)
    const serialized = serializeFilterNode(node, fields)
    assert.equal(negated ? serialized.child.nodeType : serialized.nodeType, mode.replace('NOT_', ''))
  }
  select(wrapper, '条件组合方式').vm.$emit('update:modelValue', 'NOT_OR'); await vue.nextTick()
  await wrapper.findAll('button').find(item => item.text() === '添加条件').trigger('click')
  assert.equal(node.child.children.length, 2)
  await wrapper.findAll('button').find(item => item.text() === '删除条件').trigger('click')
  assert.equal(node.child.children.length, 1)
  assert.ok(!wrapper.text().includes('不满足以下条件'))
  assert.ok(!wrapper.text().includes('添加否定组'))
  wrapper.unmount()
})

test('existing negated OR group appears as a single dropdown and retains its meaning', async () => {
  const node = vue.reactive(editableFilterTree({ nodeType: 'NOT', child: { nodeType: 'OR', children: [
    { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }
  ] } }))
  const wrapper = mount(Group, { props: { node, fields }, global })
  await wrapper.find('button[aria-label="展开条件组 1"]').trigger('click')
  const modes = wrapper.findAllComponents(Select).filter(item => item.attributes('aria-label') === '条件组合方式')
  assert.deepEqual(modes.map(item => item.props('modelValue')), ['AND', 'NOT_OR'])
  assert.equal(serializeFilterNode(node, fields).children[0].child.nodeType, 'OR')
  wrapper.unmount()
})

test('conditions and nested groups default to collapsed without changing the saved filter', async () => {
  const node = vue.reactive({ nodeType: 'AND', children: [
    { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 },
    { nodeType: 'OR', children: [{ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'LT', value: 60 }] }
  ] })
  const before = serializeFilterNode(node, fields)
  const wrapper = mount(Group, { props: { node, fields }, global })
  assert.equal(wrapper.findAllComponents(Predicate).length, 0)
  assert.equal(wrapper.findAllComponents(Select).length, 1, 'only the root combination is visible')
  assert.equal(wrapper.find('button[aria-label="展开条件 1"]').attributes('aria-expanded'), 'false')
  assert.equal(wrapper.find('button[aria-label="展开条件组 2"]').attributes('aria-expanded'), 'false')
  await wrapper.find('button[aria-label="展开条件组 2"]').trigger('click')
  assert.equal(wrapper.findAllComponents(Select).length, 2)
  assert.equal(wrapper.findAllComponents(Predicate).length, 0, 'nested conditions also default to collapsed')
  await wrapper.find('[role="region"][aria-label="条件组 2"] button[aria-label="展开条件 1"]').trigger('click')
  assert.equal(wrapper.findAllComponents(Predicate).length, 1)
  assert.equal(wrapper.find('button[aria-label="收起条件组 2"]').attributes('aria-expanded'), 'true')
  await wrapper.find('button[aria-label="收起条件组 2"]').trigger('click')
  assert.equal(wrapper.findAllComponents(Predicate).length, 0)
  assert.deepEqual(serializeFilterNode(node, fields), before)
  assert.equal(wrapper.emitted('update'), undefined, 'folding is not a definition change')
  wrapper.unmount()
})

test('new conditions and groups start folded and can be deleted without expanding', async () => {
  const node = vue.reactive({ nodeType: 'AND', children: [] })
  const wrapper = mount(Group, { props: { node, fields }, global })
  for (const text of ['添加条件', '添加条件组']) await wrapper.findAll('button').find(item => item.text() === text).trigger('click')
  assert.equal(node.children.length, 2)
  assert.equal(wrapper.findAllComponents(Predicate).length, 0)
  assert.ok(wrapper.find('button[aria-label="展开条件 1"]').exists())
  assert.ok(wrapper.find('button[aria-label="展开条件组 2"]').exists())
  await wrapper.find('button[aria-label="删除条件组 2"]').trigger('click')
  await wrapper.find('button[aria-label="删除条件 1"]').trigger('click')
  assert.equal(node.children.length, 0)
  assert.equal(wrapper.emitted('update').length, 4)
  wrapper.unmount()
})

test('expanded state follows the condition object after deletion, reordering and replacement', async () => {
  const first = { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'LT', value: 18 }
  const second = { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }
  const third = { nodeType: 'OR', children: [] }
  const node = vue.reactive({ nodeType: 'AND', children: [first, second, third] })
  const wrapper = mount(Group, { props: { node, fields }, global })
  await wrapper.find('button[aria-label="展开条件 2"]').trigger('click')
  await wrapper.find('button[aria-label="删除条件 1"]').trigger('click')
  assert.ok(wrapper.find('button[aria-label="收起条件 1"]').exists())
  assert.equal(wrapper.findComponent(Predicate).props('condition').value, 18)
  node.children.reverse(); await vue.nextTick()
  assert.ok(wrapper.find('button[aria-label="展开条件组 1"]').exists())
  assert.ok(wrapper.find('button[aria-label="收起条件 2"]').exists())
  node.children[1] = { nodeType: 'PREDICATE', fieldCode: 'age', operator: 'EQ', value: 20 }
  await vue.nextTick()
  assert.ok(wrapper.find('button[aria-label="展开条件 2"]').exists())
  assert.equal(wrapper.findAllComponents(Predicate).length, 0)
  wrapper.unmount()
})

test('editing a nested condition propagates changes and retains them across folding', async () => {
  const node = vue.reactive({ nodeType: 'AND', children: [
    { nodeType: 'OR', children: [{ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }] }
  ] })
  const wrapper = mount(Group, { props: { node, fields }, global })
  await wrapper.find('button[aria-label="展开条件组 1"]').trigger('click')
  await wrapper.find('button[aria-label="展开条件 1"]').trigger('click')
  wrapper.findComponent(Predicate).findComponent(Input).vm.$emit('update:modelValue', 21)
  await vue.nextTick()
  assert.equal(node.children[0].children[0].value, 21)
  assert.equal(wrapper.emitted('update').length, 1)
  await wrapper.find('button[aria-label="收起条件组 1"]').trigger('click')
  await wrapper.find('button[aria-label="展开条件组 1"]').trigger('click')
  await wrapper.find('button[aria-label="展开条件 1"]').trigger('click')
  assert.equal(wrapper.findComponent(Predicate).props('condition').value, 21)
  assert.equal(serializeFilterNode(node, fields).children[0].children[0].value, 21)
  wrapper.unmount()
})
