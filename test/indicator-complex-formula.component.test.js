import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as arithmetic from '../src/idmp/features/indicator/arithmeticFormula.js'
import * as composer from '../src/idmp/features/indicator/formulaComposer.js'
import { parseEditorFormula } from '../src/idmp/features/indicator/formulaEditor.js'
import { getAggregationLabel } from '../src/idmp/utils/dslBuilder.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const icons = await import('@element-plus/icons-vue')
const { mount } = await import('@vue/test-utils')

async function component(file) {
  const { descriptor } = parse(await readFile(new URL(`../src/idmp/components/${file}.vue`, import.meta.url), 'utf8'))
  const compiled = descriptor.scriptSetup ? compileScript(descriptor, { id: file, inlineTemplate: true }).content : descriptor.script.content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
  return Function('vue', 'arithmetic', 'composer', 'icons', 'getAggregationLabel', `const { ${Object.keys(arithmetic).join(',')} } = arithmetic; const { ${Object.keys(composer).join(',')} } = composer; const { ArrowRight, Box, Close, Delete, Operation, Plus, Rank, RefreshLeft, RefreshRight, Search, Tickets } = icons;\n${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, arithmetic, composer, icons, getAggregationLabel)
}
const Expression = await component('IndicatorFormulaExpression')
const Editor = await component('IndicatorFormulaComposer')
const ref = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id })
const constant = value => ({ nodeType: 'CONST', value, typeDescriptor: { valueType: 'DECIMAL', unit: 'ONE', dimension: 'ONE' } })
const binary = (operator, left, right) => ({ nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) })
const round = node => ({ nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [node] })
const fraction = binary('DIV', binary('SUB', ref('11'), binary('ADD', ref('12'), ref('13'))), ref('14'))
const formula = { root: round(binary('MUL', fraction, constant('100'))), display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' } }
const factors = ['总费用', '药品费用', '耗材费用', '出院人次'].map((name, index) => ({ versionId: String(index + 11), name }))

test('SQL imported CASE, boolean conditions and NULL remain visible and round-trip without losing semantics', () => {
  const root = { nodeType: 'CONDITION', nullConditionPolicy: 'WHEN_FALSE', condition: {
    nodeType: 'FUNCTION', functionCode: 'OR', arguments: [
      { nodeType: 'FUNCTION', functionCode: 'IS_NULL', arguments: [ref('11')] },
      { nodeType: 'COMPARE', comparator: 'EQ', left: ref('12'), right: { ...constant('0'), sqlLiteral: true } }
    ] }, whenTrue: { ...constant(null), sqlLiteral: true, typeDescriptor: { ...constant(null).typeDescriptor, nullable: true } }, whenFalse: round(fraction) }
  const parsed = parseEditorFormula({ root })
  assert.equal(parsed.mode, '嵌套公式型')
  const built = arithmetic.buildArithmeticFormula(root)
  assert.equal(built.root.nullConditionPolicy, 'WHEN_FALSE')
  assert.equal(built.root.whenTrue.value, null)
  assert.equal(built.root.condition.arguments[1].right.sqlLiteral, true)
  const wrapper = mount(Expression, { props: { formula: { root }, factors } })
  assert.match(wrapper.text(), /是否为空/)
  assert.match(wrapper.text(), /空值/)
  assert.equal(wrapper.text().includes('null'), false)
  assert.equal(wrapper.findAll('.math-fraction').length, 1)
  wrapper.unmount()
})

test('outer ROUND and multiplier render a real fraction with separate rounding notes', () => {
  const w = mount(Expression, { props: { formula, factors }, slots: { factor: ({ id, text }) => vue.h('button', { 'data-version': id }, text) } })
  assert.equal(w.findAll('.math-fraction').length, 1)
  assert.equal(w.find('.math-numerator').text(), '总费用−(药品费用+耗材费用)')
  assert.equal(w.find('.math-denominator').text(), '出院人次')
  assert.equal(w.find('.math-expression').text(), '总费用−(药品费用+耗材费用)出院人次×100')
  assert.equal(w.find('.math-notes').text(), '保留 2 位小数，四舍五入')
  assert.deepEqual(w.findAll('button').map(b => b.attributes('data-version')), ['11', '12', '13', '14'])
  w.unmount()
})

test('nested division and internal ROUND retain their arithmetic order and semantics', () => {
  const w = mount(Expression, { props: { formula: { root: binary('DIV', round(fraction), constant('3')) }, factors } })
  assert.equal(w.findAll('.math-fraction').length, 2)
  assert.ok(w.find('.math-expression').text().includes('ROUND('))
  assert.ok(w.find('.math-expression').text().includes('保留 2 位小数'))
  w.unmount()
})

test('display multiplier is applied once and percent is a suffix, not a hidden factor of 100', () => {
  const w = mount(Expression, { props: { formula: { root: fraction, display: { format: 'PERCENT', multiplier: '1' } }, factors } })
  assert.equal(w.text().includes('100'), false)
  assert.ok(w.text().includes('单位：%'))
  w.unmount()
})

test('same-name factors remain distinguishable by exact version IDs', () => {
  const w = mount(Expression, { props: { formula: { root: binary('DIV', ref('11'), ref('12')) }, factors: [{ factorVersionId: '11', factorName: '费用' }, { factorVersionId: '12', factorName: '费用' }] } })
  assert.equal(w.find('.math-numerator').text(), '费用（版本 11）')
  assert.equal(w.find('.math-denominator').text(), '费用（版本 12）')
  w.unmount()
})

test('unsupported nodes stay on the detail fallback instead of rendering an incorrect expression', () => {
  assert.equal(arithmetic.arithmeticFormulaError({ nodeType: 'CONST', value: true }), '请填写有效数字常量')
  assert.ok(arithmetic.arithmeticFormulaError(binary('DIV', ref('11'), null)))
  assert.equal(parseEditorFormula({ root: { nodeType: 'FUNCTION', functionCode: 'UNKNOWN' } }), null)
})

test('coalesce requires at least two arguments to match backend validation', () => {
  for (const nodeType of ['FUNCTION', 'COALESCE']) {
    const node = { nodeType, functionCode: 'COALESCE', arguments: [ref('11')] }
    assert.equal(arithmetic.arithmeticFormulaError(node), '空值替代至少需要两个参数')
    assert.equal(arithmetic.arithmeticFormulaError({ ...node, arguments: [ref('11'), constant('0')] }), '')
  }
})

test('new nodes receive unique IDs without changing original IDs, metadata, or constants', () => {
  const original = { ...formula, calculationMode: 'TEMPORAL' }
  const snapshot = JSON.stringify(original)
  const output = arithmetic.buildArithmeticFormula(original.root, original)
  const ids = []
  const visit = node => { ids.push(node.nodeId); [node.left, node.right, ...(node.arguments || [])].filter(Boolean).forEach(visit) }
  visit(output.root)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every(Boolean))
  assert.equal(JSON.stringify(original), snapshot)
  assert.equal(output.calculationMode, 'TEMPORAL')
  assert.deepEqual(output.display, original.display)
  assert.deepEqual(arithmetic.arithmeticFactorIds(output.root), ['11', '12', '13', '14'])
  assert.throws(() => arithmetic.buildArithmeticFormula(constant('abc')), /有效数字/)
  assert.throws(() => arithmetic.buildArithmeticFormula(formula.root, { display: { multiplier: '' } }), /展示乘数/)
})

const Field = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue', 'change'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled', 'icon'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled }, slots.default?.()) })
const Dialog = vue.defineComponent({ props: ['modelValue'], setup: (props, { slots }) => () => props.modelValue ? vue.h('div', { class: 'dialog' }, [slots.default?.(), slots.footer?.()]) : null })
const Tooltip = vue.defineComponent({ inheritAttrs: false, props: ['visible', 'content', 'enterable', 'showAfter', 'hideAfter', 'transition', 'popperClass'], setup: (_, { slots }) => () => slots.default?.() })
const editorComponents = { ElSelect: Field, ElInput: Field, ElInputNumber: Field, ElButton: Button, ElDialog: Dialog, ElTooltip: Tooltip }
const mountEditor = (modelValue = composer.emptyFormulaSlot(), props = {}) => mount(Editor, { props: { modelValue, factors, ...props }, global: { components: editorComponents, stubs: { ElOption: true, ElIcon: true, ElEmpty: true, ElAlert: true }, directives: { loading: {} } } })
const latest = w => w.emitted('update:modelValue').at(-1)[0]
async function drag(w, selector, target) {
  const data = new Map()
  const dataTransfer = { setData: (key, value) => data.set(key, value), getData: key => data.get(key) || '' }
  await w.get(selector).trigger('dragstart', { dataTransfer })
  await w.get(target).trigger('drop', { dataTransfer })
  await w.get(selector).trigger('dragend', { dataTransfer })
}

test('drag a mode, open its numerator, nest a sum, then drag factors into that nested mode', async () => {
  const w = mountEditor()
  await drag(w, '[data-mode="QUOTIENT"]', '.root-dropzone')
  assert.equal(latest(w).operator, 'DIV')
  assert.equal(w.get('.active-block-heading h3').text(), '比值型')
  await drag(w, '[data-mode="SUM"]', '[data-slot-label="分子"]')
  assert.equal(w.get('.active-block-heading h3').text(), '加法合成型')
  assert.ok(w.get('.composer-breadcrumb').text().includes('分子'))
  await drag(w, '[data-factor-version="11"]', '[data-slot-label="参与项 1"]')
  await drag(w, '[data-factor-version="12"]', '[data-slot-label="参与项 2"]')
  assert.equal(latest(w).left.left.factorVersionId, '11')
  assert.equal(latest(w).left.right.factorVersionId, '12')
  await w.get('.composer-breadcrumb button').trigger('click')
  await drag(w, '[data-factor-version="14"]', '[data-slot-label="分母"]')
  const root = latest(w)
  assert.equal(root.right.factorVersionId, '14')
  assert.equal(arithmetic.arithmeticFormulaError(root), '')
  assert.equal(arithmetic.arithmeticFormulaText(root, factors), '((总费用 + 药品费用) ÷ 出院人次)')
  assert.ok(!JSON.stringify(arithmetic.buildArithmeticFormula(root)).includes('editorMode'))
  w.unmount()
})

async function pointer(w, selector, target, { cancel, outside = false, unmount = false } = {}) {
  const original = document.elementFromPoint
  document.elementFromPoint = () => outside ? document.body : w.get(target).element
  const event = (name, x, y) => {
    const value = new window.MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.defineProperty(value, 'pointerId', { value: 7 })
    return value
  }
  try {
    w.get(selector).element.dispatchEvent(event('pointerdown', 10, 10))
    document.dispatchEvent(event('pointermove', 12, 12))
    await vue.nextTick()
    assert.equal(w.find('.is-dragging').exists(), false)
    document.dispatchEvent(event('pointermove', 100, 100))
    await vue.nextTick()
    if (unmount) w.unmount()
    else if (cancel === 'Escape') document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    else if (cancel === 'blur') window.dispatchEvent(new window.Event('blur'))
    else if (cancel) document.dispatchEvent(event('pointercancel', 100, 100))
    document.dispatchEvent(event('pointerup', 100, 100))
    await vue.nextTick()
  } finally { document.elementFromPoint = original }
}

test('pointer dragging fills modes and factors, opens nested blocks, and suppresses the trailing click', async () => {
  const w = mountEditor()
  await pointer(w, '[data-mode="QUOTIENT"]', '.root-dropzone')
  assert.equal(latest(w).operator, 'DIV')
  await w.get('[data-mode="QUOTIENT"]').trigger('click')
  assert.equal(w.emitted('update:modelValue').length, 1)
  await pointer(w, '[data-mode="ARITHMETIC"]', '[data-slot-label="分子"]')
  assert.equal(latest(w).left.operator, 'SUB')
  await pointer(w, '[data-factor-version="11"]', '[data-slot-label="被减数"]')
  await pointer(w, '[data-mode="SUM"]', '[data-slot-label="减数"]')
  await pointer(w, '[data-factor-version="12"]', '[data-slot-label="参与项 1"]')
  await pointer(w, '[data-factor-version="13"]', '[data-slot-label="参与项 2"]')
  await w.get('.composer-breadcrumb button').trigger('click')
  await pointer(w, '[data-factor-version="14"]', '[data-slot-label="分母"]')
  assert.deepEqual(latest(w), fraction)
  await w.get('[data-slot-label="分子"]').trigger('click')
  await w.get('[data-slot-label="减数"]').trigger('click')
  assert.equal(w.get('.active-block-heading h3').text(), '加法合成型')
  assert.equal(w.find('.is-dragging').exists(), false)
  assert.equal(document.querySelector('.formula-drag-preview'), null)
  w.unmount()
})

test('cancelled, outside, readonly and unmounted pointer drags never insert a formula', async () => {
  for (const options of [{ cancel: true }, { cancel: 'Escape' }, { cancel: 'blur' }, { outside: true }, { unmount: true }]) {
    const w = mountEditor()
    await pointer(w, '[data-mode="QUOTIENT"]', '.root-dropzone', options)
    assert.equal(w.emitted('update:modelValue'), undefined)
    assert.equal(document.querySelector('.formula-drag-preview'), null)
    if (!options.unmount) w.unmount()
  }
  const w = mountEditor(undefined, { disabled: true })
  await pointer(w, '[data-mode="QUOTIENT"]', '.root-dropzone')
  assert.equal(w.emitted('update:modelValue'), undefined)
  w.unmount()
})

test('mode hints are exclusive, close immediately, and support hover, focus and disabled-mode explanations', async () => {
  const w = mountEditor()
  const tips = () => w.findAllComponents(Tooltip).filter(tip => tip.props('popperClass') === 'formula-mode-tooltip')
  const visible = () => tips().filter(tip => tip.props('visible')).map(tip => tip.props('content'))
  const trigger = code => w.get(`[data-mode="${code}"]`).element.parentElement
  const event = async (code, name) => { trigger(code).dispatchEvent(new window.Event(name, { bubbles: true })); await vue.nextTick() }
  await event('SUM', 'mouseenter')
  assert.deepEqual(visible(), ['A + B + …'])
  await event('QUOTIENT', 'mouseenter')
  await event('SUM', 'mouseleave')
  assert.deepEqual(visible(), ['分子 ÷ 分母'])
  await event('QUOTIENT', 'mouseleave')
  assert.deepEqual(visible(), [])
  await event('SUM', 'focusin')
  assert.equal(visible().length, 1)
  await w.get('[data-mode="SUM"]').trigger('keydown', { key: 'Escape' })
  assert.deepEqual(visible(), [])
  await event('STATISTIC', 'mouseenter')
  assert.deepEqual(visible(), ['平均数 / 中位数 / 最小值 / 最大值 / P90 分位数'])
  await w.setProps({ disabled: true })
  await event('SUM', 'mouseenter')
  assert.deepEqual(visible(), [])
  for (const tip of tips()) {
    assert.equal(tip.props('hideAfter'), 0)
    assert.equal(tip.props('enterable'), false)
    assert.equal(tip.props('transition'), 'formula-tooltip-instant')
  }
  w.unmount()
})

test('pressing or dragging palette material closes hints and prevents them reopening until the gesture ends', async () => {
  const w = mountEditor()
  const visible = () => w.findAllComponents(Tooltip).filter(tip => tip.props('popperClass') === 'formula-mode-tooltip' && tip.props('visible'))
  const hover = async () => { w.get('[data-mode="SUM"]').element.parentElement.dispatchEvent(new window.Event('mouseenter')); await vue.nextTick() }
  await hover()
  assert.equal(visible().length, 1)
  await w.get('[data-mode="SUM"]').trigger('pointerdown', { button: 0, pointerId: 7, clientX: 10, clientY: 10 })
  await hover()
  assert.equal(visible().length, 0)
  document.dispatchEvent(new window.Event('pointercancel'))
  await hover()
  assert.equal(visible().length, 1)
  await pointer(w, '[data-factor-version="11"]', '.root-dropzone', { outside: true })
  assert.equal(visible().length, 0)
  await hover()
  await w.get('[data-mode="SUM"]').trigger('dragstart', { dataTransfer: { setData() {} } })
  await hover()
  assert.equal(visible().length, 0)
  await w.get('[data-mode="SUM"]').trigger('dragend')
  await hover()
  await w.get('[data-mode="SUM"]').trigger('click')
  assert.equal(visible().length, 0)
  w.unmount()
})

test('selecting a mode then clicking palette factors fills selected slots and supports more than two operands', async () => {
  const w = mountEditor()
  await w.get('[data-mode="SUM"]').trigger('click')
  await w.get('[data-factor-version="11"]').trigger('click')
  await w.get('[data-factor-version="12"]').trigger('click')
  await w.findAll('button').find(button => button.text() === '添加参与项').trigger('click')
  await w.get('[data-factor-version="13"]').trigger('click')
  assert.deepEqual(arithmetic.arithmeticFactorIds(latest(w)), ['11', '12', '13'])
  await w.get('button[aria-label="移除参与项 2"]').trigger('click')
  assert.deepEqual(arithmetic.arithmeticFactorIds(latest(w)), ['11', '13'])
  assert.equal(w.findAll('[data-slot-label]').length, 2)
  await w.get('button[aria-label="撤销公式修改"]').trigger('click')
  assert.deepEqual(arithmetic.arithmeticFactorIds(latest(w)), ['11', '12', '13'])
  await w.get('button[aria-label="重做公式修改"]').trigger('click')
  assert.deepEqual(arithmetic.arithmeticFactorIds(latest(w)), ['11', '13'])
  w.unmount()
})

test('new empty sum operands can be removed, while the final two empty slots stay disabled', async () => {
  const w = mountEditor(composer.createFormulaBlock('SUM'))
  assert.equal(w.get('[aria-label="清空参与项 1"]').attributes('disabled'), '')
  assert.equal(w.get('[aria-label="清空参与项 2"]').attributes('disabled'), '')
  await w.findAll('button').find(button => button.text() === '添加参与项').trigger('click')
  const original = latest(w)
  assert.equal(w.findAll('[data-slot-label]').length, 3)
  assert.equal(w.get('[aria-label="移除参与项 3"]').attributes('disabled'), undefined)
  await w.get('[aria-label="移除参与项 3"]').trigger('click')
  assert.equal(w.findAll('[data-slot-label]').length, 2)
  assert.equal(w.get('[aria-label="清空参与项 1"]').attributes('disabled'), '')
  await w.get('[aria-label="撤销公式修改"]').trigger('click')
  assert.deepEqual(latest(w), original)
  await w.get('[aria-label="移除参与项 1"]').trigger('click')
  assert.equal(w.findAll('[data-slot-label]').length, 2)
  assert.ok(composer.describeFormulaBlock(latest(w)).slots.every(slot => composer.isEmptyFormulaSlot(slot.node)))
  w.unmount()
})

test('removing an empty nested operand preserves existing factors and other formula branches', async () => {
  const original = binary('DIV', binary('ADD', { ...ref('11'), nodeId: 'original_factor' }, ref('12')), ref('14'))
  const w = mountEditor(original)
  await w.get('[data-slot-label="分子"]').trigger('click')
  await w.findAll('button').find(button => button.text() === '添加参与项').trigger('click')
  await w.get('[aria-label="移除参与项 3"]').trigger('click')
  assert.deepEqual(latest(w), original)
  assert.equal(w.get('[aria-label="清空参与项 1"]').attributes('disabled'), undefined)
  await w.get('[aria-label="清空参与项 1"]').trigger('click')
  assert.equal(w.findAll('[data-slot-label]').length, 2)
  assert.ok(composer.isEmptyFormulaSlot(latest(w).left.left))
  assert.equal(latest(w).left.right.factorVersionId, '12')
  assert.deepEqual(latest(w).right, original.right)
  w.unmount()
})

test('published sum formulas cannot remove even an empty extra operand', async () => {
  const original = binary('ADD', binary('ADD', ref('11'), ref('12')), composer.emptyFormulaSlot())
  const w = mountEditor(original, { disabled: true })
  for (const button of w.findAll('.slot-heading button')) {
    assert.equal(button.attributes('disabled'), '')
    await button.trigger('click')
  }
  assert.equal(w.emitted('update:modelValue'), undefined)
  assert.equal(w.findAll('[data-slot-label]').length, 3)
  w.unmount()
})

test('editing a loaded constant preserves unrelated branches, exact IDs, metadata and the original input', async () => {
  const original = { ...formula.root, nodeId: 'root_original', metadata: { note: '原定义' } }
  const snapshot = JSON.stringify(original)
  const w = mountEditor(original)
  await w.get('[data-slot-label="计算对象"]').trigger('click')
  const input = w.findAllComponents(Field).find(field => field.attributes('aria-label') === '百分比乘数')
  assert.equal(input.props('modelValue'), '100')
  input.vm.$emit('change', '200')
  await vue.nextTick()
  assert.equal(latest(w).arguments[0].right.value, '200')
  assert.deepEqual(latest(w).arguments[0].left, original.arguments[0].left)
  assert.equal(latest(w).nodeId, 'root_original')
  assert.deepEqual(latest(w).metadata, original.metadata)
  assert.equal(JSON.stringify(original), snapshot)
  w.unmount()
})

test('adding operations wraps an existing subtree without losing node IDs, policies or metadata', () => {
  const node = { ...fraction, nodeId: 'existing_fraction', zeroDenominatorPolicy: 'RETURN_ZERO', metadata: { note: '原始表达式' } }
  const snapshot = JSON.stringify(node)
  for (const operator of ['ADD', 'SUB', 'MUL', 'DIV', 'ROUND']) {
    const wrapped = arithmetic.wrapArithmeticNode(node, operator)
    assert.deepEqual(operator === 'ROUND' ? wrapped.arguments[0] : wrapped.left, node)
    assert.equal(wrapped.nodeId, undefined)
    assert.equal(JSON.stringify(node), snapshot)
    if (operator === 'DIV') assert.equal(wrapped.zeroDenominatorPolicy, 'RETURN_NULL')
  }
  assert.throws(() => arithmetic.wrapArithmeticNode(node, 'INVALID'), /不支持/)
})

test('dropping a mode onto an existing operand keeps it while replacing a subtree with a factor requires confirmation', async () => {
  const w = mountEditor(binary('DIV', ref('11'), ref('14')))
  await drag(w, '[data-mode="SUM"]', '[data-slot-label="分子"]')
  assert.deepEqual(latest(w).left.left, ref('11'))
  await w.get('.composer-breadcrumb button').trigger('click')
  const count = w.emitted('update:modelValue').length
  await drag(w, '[data-factor-version="12"]', '[data-slot-label="分子"]')
  assert.equal(w.emitted('update:modelValue').length, count)
  assert.ok(w.find('.dialog').exists())
  await w.findAll('.dialog button').find(b => b.text() === '取消').trigger('click')
  assert.deepEqual(latest(w).left.left, ref('11'))
  await drag(w, '[data-factor-version="12"]', '[data-slot-label="分子"]')
  await w.findAll('.dialog button').find(b => b.text() === '替换').trigger('click')
  assert.equal(latest(w).left.factorVersionId, '12')
  await w.get('button[aria-label="撤销公式修改"]').trigger('click')
  assert.deepEqual(latest(w).left.left, ref('11'))
  w.unmount()
})

test('nested mode shares the formula editor surface and keeps a live preview adjacent to its controls', async () => {
  const view = await readFile(new URL('../src/idmp/views/IndicatorEditor.vue', import.meta.url), 'utf8')
  assert.match(view, /class="formula-builder advanced-formula-builder"/)
  assert.match(view, /class="formula-preview" aria-label="公式预览"/)
})

test('nested display controls stay beside the editor and outside the sticky preview', async () => {
  const view = await readFile(new URL('../src/idmp/views/IndicatorEditor.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(view)
  const document = new JSDOM(descriptor.template.content).window.document
  const settings = document.querySelector('.advanced-display-settings')
  assert.equal(document.querySelectorAll('.advanced-display-settings').length, 1)
  assert.equal(settings.parentElement.className, 'formula-preview-settings')
  assert.equal(document.querySelector('.formula-preview .advanced-display-settings'), null)
  assert.equal(settings.getAttribute('v-if'), "activeMode.kind === 'advanced'")
  assert.equal(document.querySelector('.advanced-formula-builder .advanced-display-settings'), null)
  for (const label of ['嵌套公式展示格式', '展示乘数', '展示小数位数', '展示舍入方式']) {
    assert.equal(settings.querySelector(`[aria-label="${label}"]`).getAttribute(':disabled'), 'indicatorWorkflow.published')
  }
})

test('factor palette follows both calculation modes and formula workspace without changing selection behavior', async () => {
  const w = mountEditor()
  const sections = Array.from(w.get('.formula-composer').element.children)
  const factorSection = w.get('.composer-factor-section').element
  assert.ok(sections.indexOf(factorSection) > sections.indexOf(w.get('.composer-palette').element))
  assert.ok(sections.indexOf(factorSection) > sections.indexOf(w.get('.composer-workspace').element))
  assert.equal(w.find('.composer-palette .factor-piece').exists(), false)
  assert.equal(w.findAll('.composer-factor-section .factor-piece').length, factors.length)
  await w.get('[data-mode="QUOTIENT"]').trigger('click')
  await w.get('[data-factor-version="11"]').trigger('click')
  assert.equal(latest(w).left.factorVersionId, '11')
  const source = await readFile(new URL('../src/idmp/components/IndicatorFormulaComposer.vue', import.meta.url), 'utf8')
  assert.match(source, /\.composer-factor-section\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  w.unmount()
})

test('a factor selected before any mode uses a selectable factor item and can be wrapped without losing its reference', async () => {
  const w = mountEditor(undefined, { factors: [{ versionId: '11', name: '出院总费用', code: 'TOTAL_COST', aggregation: 'SUM', domain: '住院病案' }] })
  await w.get('[data-factor-version="11"]').trigger('click')
  const slot = w.get('[aria-label="当前因子槽位"]')
  assert.equal(slot.get('strong').text(), '出院总费用')
  assert.equal(slot.get('small').text(), '数值求和 | 住院病案')
  assert.equal(w.find('.scalar-piece').exists(), false)
  await w.get('[aria-label="更换因子"]').trigger('click')
  assert.equal(slot.attributes('aria-pressed'), 'true')
  await w.get('[data-mode="SUM"]').trigger('click')
  assert.equal(latest(w).left.factorVersionId, '11')
  await w.get('[aria-label="撤销公式修改"]').trigger('click')
  assert.equal(w.get('.scalar-factor strong').text(), '出院总费用')
  w.unmount()
})

test('a constant selected before any mode has a compact value field and grouped type fields with undo and published guards', async () => {
  const w = mountEditor()
  await w.get('[aria-label="添加数字常量"]').trigger('click')
  assert.equal(w.get('.scalar-constant > span').text(), '数值')
  assert.equal(w.find('.scalar-piece').exists(), false)
  assert.deepEqual(w.findAll('.constant-settings label > span').map(label => label.text()), ['常量量纲', '常量单位'])
  const value = w.findComponent('[aria-label="数字常量"]')
  value.vm.$emit('update:modelValue', '120.5')
  await vue.nextTick()
  assert.equal(latest(w).value, '120.5')
  assert.equal(arithmetic.arithmeticFormulaError(latest(w)), '')
  w.findComponent('[aria-label="常量单位"]').vm.$emit('update:modelValue', 'CNY')
  await vue.nextTick()
  assert.equal(latest(w).typeDescriptor.unit, 'CNY')
  await w.get('[aria-label="撤销公式修改"]').trigger('click')
  assert.equal(latest(w).typeDescriptor.unit, 'ONE')
  assert.equal(latest(w).value, '120.5')
  await w.setProps({ disabled: true })
  const count = w.emitted('update:modelValue').length
  value.vm.$emit('update:modelValue', '999')
  await vue.nextTick()
  assert.equal(value.props('disabled'), true)
  assert.equal(w.emitted('update:modelValue').length, count)
  w.unmount()
})

test('nested factor cards show name, aggregation and domain without exposing resource codes', async () => {
  const w = mountEditor(undefined, { factors: [{ versionId: '11', name: '总费用', code: 'TOTAL_COST', aggregation: 'SUM', domain: '住院病案' }, { versionId: '12', name: '旧因子' }] })
  const cards = w.findAll('.factor-piece')
  assert.equal(cards[0].get('strong').text(), '总费用')
  assert.equal(cards[0].get('small').text(), '数值求和 | 住院病案')
  assert.equal(cards[0].get('.factor-add').text(), '添加')
  assert.equal(cards[1].get('small').text(), '- | -')
  await w.get('[data-mode="QUOTIENT"]').trigger('click')
  await cards[0].get('.factor-add').trigger('click')
  assert.equal(latest(w).left.factorVersionId, '11')
  await w.setProps({ disabled: true })
  assert.ok(w.findAll('.factor-piece').every(card => card.attributes('disabled') === ''))
  w.unmount()
})

test('published formulas reject drag and field edits; foreign drops and unknown factors never mutate formulas', async () => {
  const w = mountEditor(formula.root, { disabled: true })
  for (const field of w.findAllComponents(Field)) field.vm.$emit('update:modelValue', 'invalid')
  await w.get('.composer-canvas').trigger('drop', { dataTransfer: { getData: () => JSON.stringify({ kind: 'mode', code: 'SUM' }) } })
  assert.equal(w.emitted('update:modelValue'), undefined)
  await w.setProps({ disabled: false, modelValue: composer.emptyFormulaSlot() })
  await w.get('.root-dropzone').trigger('drop', { dataTransfer: { getData: () => '{bad data}' } })
  await w.get('.root-dropzone').trigger('drop', { dataTransfer: { getData: () => JSON.stringify({ kind: 'factor', versionId: 'unknown' }) } })
  assert.equal(w.emitted('update:modelValue'), undefined)
  assert.equal(w.get('[data-mode="STATISTIC"]').attributes('disabled'), undefined)
  w.unmount()
})

test('ratio templates carry multiplication exactly once and composite slots navigate to real additive subtrees', () => {
  const ratio = composer.createFormulaBlock('RATIO')
  assert.equal(ratio.operator, 'MUL')
  assert.equal(ratio.right.value, '100')
  assert.equal(ratio.left.operator, 'DIV')
  assert.equal(composer.describeFormulaBlock(ratio).name, '简单比率型')
  const composite = composer.createFormulaBlock('COMPOSITE_RATIO')
  const slots = composer.describeFormulaBlock(composite).slots
  assert.equal(composer.formulaAt(composite, slots[0].path).operator, 'ADD')
  assert.equal(composer.formulaAt(composite, slots[1].path).operator, 'ADD')
  for (const mode of composer.formulaBlockModes.filter(m => !m.disabled)) assert.ok(composer.describeFormulaBlock(composer.createFormulaBlock(mode.code)).slots.length)
  assert.equal(composer.createFormulaBlock('STATISTIC').functionCode, 'AVG')
})

test('all supported function templates validate and preserve arguments and nested factor references', () => {
  for (const [code] of arithmetic.formulaFunctions) {
    const node = composer.createFunctionBlock(code)
    node.arguments = node.arguments.map((_, index) => ref(String(index + 11)))
    assert.equal(arithmetic.arithmeticFormulaError(node), '')
    const result = arithmetic.buildArithmeticFormula(node)
    assert.equal(result.root.functionCode, code)
    assert.deepEqual(arithmetic.arithmeticFactorIds(result.root), node.arguments.map(arg => arg.factorVersionId))
    assert.ok(arithmetic.arithmeticFormulaText(node, factors).includes(code))
    const w = mount(Expression, { props: { formula: result, factors } })
    assert.ok(w.text().includes('总费用'))
    if (code !== 'ROUND') assert.equal(w.text().includes('ROUND'), false)
    w.unmount()
  }
})

test('statistic formula roundtrips use FUNCTION and preserve non-P90 percentiles in advanced mode', () => {
  assert.deepEqual(parseEditorFormula({ root: { nodeType: 'FUNCTION', functionCode: 'AVG', arguments: [ref('11'), ref('12')] } }), { mode: '统计量型', statistic: 'AVG', left: ['11', '12'], right: [] })
  const percentile = { nodeType: 'FUNCTION', functionCode: 'PERCENTILE', percentile: '0.9', arguments: [ref('11'), ref('12')] }
  assert.equal(parseEditorFormula({ root: percentile }).statistic, 'P90')
  assert.equal(parseEditorFormula({ root: { ...percentile, percentile: '0.75' } }).mode, '嵌套公式型')
  assert.ok(arithmetic.arithmeticFormulaError({ ...percentile, percentile: '' }))
  assert.ok(arithmetic.arithmeticFormulaError({ ...percentile, percentile: '1.1' }))
  assert.ok(arithmetic.arithmeticFormulaError({ ...percentile, arguments: [] }))
})

test('conditional formulas retain comparison operands, factor IDs and stable node IDs', () => {
  const condition = { nodeType: 'COMPARE', comparator: 'GT', left: ref('11'), right: constant('0') }
  const node = { nodeType: 'FUNCTION', functionCode: 'IF', arguments: [condition, ref('12'), constant('0')] }
  const output = arithmetic.buildArithmeticFormula(node)
  assert.equal(parseEditorFormula(output).mode, '嵌套公式型')
  assert.deepEqual(arithmetic.arithmeticFactorIds(output.root), ['11', '12'])
  assert.ok(output.root.arguments[0].right.nodeId)
  const w = mount(Expression, { props: { formula: output, factors } })
  assert.ok(w.text().includes('条件选择'))
  assert.ok(w.text().includes('>'))
  w.unmount()
})

test('statistic composer can add and remove objects, configure IF conditions, and undo edits', async () => {
  const w = mountEditor({ nodeType: 'FUNCTION', functionCode: 'AVG', arguments: [ref('11'), ref('12')] })
  await w.get('button[aria-label="移除统计对象 2"]').trigger('click')
  assert.equal(latest(w).arguments.length, 1)
  await w.get('[aria-label="撤销公式修改"]').trigger('click')
  assert.equal(latest(w).arguments.length, 2)
  await w.findAll('button').find(button => button.text() === '添加统计对象').trigger('click')
  assert.equal(latest(w).arguments.length, 3)
  await w.setProps({ modelValue: composer.createFunctionBlock('IF') })
  await drag(w, '[data-mode="COMPARE"]', '[data-slot-label="条件"]')
  assert.equal(latest(w).arguments[0].nodeType, 'COMPARE')
  w.unmount()
})

test('statistic palette exposes the same five methods without generic functions or an editable P90 percentile', async () => {
  const w = mountEditor()
  await drag(w, '[data-mode="STATISTIC"]', '.root-dropzone')
  assert.equal(w.get('.active-block-heading h3').text(), '统计量型')
  assert.equal(w.findAll('[data-slot-label]').length, 1)
  assert.equal(w.get('[data-slot-label]').attributes('data-slot-label'), '统计对象 1')
  const select = w.findComponent('[aria-label="选择统计方法"]')
  assert.deepEqual(select.findAll('el-option-stub').map(option => [option.attributes('value'), option.attributes('label')]), arithmetic.statisticMethods)
  assert.equal(w.find('[aria-label="公式函数"]').exists(), false)
  await drag(w, '[data-factor-version="11"]', '[data-slot-label="统计对象 1"]')
  for (const [method] of arithmetic.statisticMethods) {
    select.vm.$emit('update:modelValue', method)
    await vue.nextTick()
    const node = latest(w)
    assert.equal(node.functionCode, method === 'P90' ? 'PERCENTILE' : method)
    assert.deepEqual(node.arguments, [ref('11')])
    assert.equal(arithmetic.arithmeticFormulaError(node), '')
    assert.equal(parseEditorFormula({ root: node }).statistic, method)
    assert.equal(w.get('.active-block-heading h3').text(), '统计量型')
    assert.equal(w.find('[aria-label="分位点"]').exists(), false)
    if (method === 'P90') assert.equal(node.percentile, '0.9')
    else assert.equal(Object.hasOwn(node, 'percentile'), false)
  }
  select.vm.$emit('update:modelValue', 'AVG')
  await vue.nextTick()
  assert.equal(Object.hasOwn(latest(w), 'percentile'), false)
  await w.setProps({ disabled: true })
  const count = w.emitted('update:modelValue').length
  select.vm.$emit('update:modelValue', 'P90')
  await vue.nextTick()
  assert.equal(w.emitted('update:modelValue').length, count)
  w.unmount()
})

test('nested statistic objects preserve child formulas and node IDs when changing methods', async () => {
  const child = binary('SUB', ref('11'), ref('12'))
  const nested = { ...arithmetic.createStatisticFunction('P90', [child, ref('13')]), nodeId: 'statistic_child' }
  const root = binary('DIV', nested, ref('14'))
  const w = mountEditor(root)
  await w.get('[data-slot-label="分子"]').trigger('click')
  const select = w.findComponent('[aria-label="选择统计方法"]')
  select.vm.$emit('update:modelValue', 'MAX')
  await vue.nextTick()
  const expected = { ...nested, functionCode: 'MAX' }
  delete expected.percentile
  assert.deepEqual(latest(w).left, expected)
  assert.deepEqual(latest(w).right, ref('14'))
  assert.equal(arithmetic.arithmeticFormulaError(latest(w)), '')
  assert.equal(parseEditorFormula({ root: latest(w) }).mode, '嵌套公式型')
  await w.get('[aria-label="撤销公式修改"]').trigger('click')
  assert.deepEqual(latest(w), root)
  w.unmount()
})

test('existing non-P90 percentiles remain editable as generic functions without changing their value', async () => {
  const node = { nodeId: 'custom_percentile', nodeType: 'FUNCTION', functionCode: 'PERCENTILE', percentile: '0.75', arguments: [ref('11'), ref('12')] }
  const w = mountEditor(node)
  assert.equal(w.find('[aria-label="选择统计方法"]').exists(), false)
  assert.equal(w.findComponent('[aria-label="分位点"]').props('modelValue'), '0.75')
  assert.equal(w.find('[aria-label="公式函数"]').exists(), true)
  assert.equal(w.emitted('update:modelValue'), undefined)
  assert.equal(parseEditorFormula({ root: node }).mode, '嵌套公式型')
  w.unmount()
})
