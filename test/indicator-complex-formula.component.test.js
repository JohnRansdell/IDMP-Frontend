import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as arithmetic from '../src/idmp/features/indicator/arithmeticFormula.js'
import { parseEditorFormula } from '../src/idmp/features/indicator/formulaEditor.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')

async function component(file) {
  const { descriptor } = parse(await readFile(new URL(`../src/idmp/components/${file}.vue`, import.meta.url), 'utf8'))
  const compiled = descriptor.scriptSetup ? compileScript(descriptor, { id: file, inlineTemplate: true }).content : descriptor.script.content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
  return Function('vue', 'arithmetic', `const { ${Object.keys(arithmetic).join(',')} } = arithmetic;\n${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, arithmetic)
}
const Expression = await component('IndicatorFormulaExpression')
const Editor = await component('IndicatorFormulaNodeEditor')
const ref = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id })
const constant = value => ({ nodeType: 'CONST', value, typeDescriptor: { valueType: 'DECIMAL', unit: 'ONE', dimension: 'ONE' } })
const binary = (operator, left, right) => ({ nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) })
const round = node => ({ nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [node] })
const fraction = binary('DIV', binary('SUB', ref('11'), binary('ADD', ref('12'), ref('13'))), ref('14'))
const formula = { root: round(binary('MUL', fraction, constant('100'))), display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' } }
const factors = ['总费用', '药品费用', '耗材费用', '出院人次'].map((name, index) => ({ versionId: String(index + 11), name }))

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

const Field = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: () => () => vue.h('div') })
test('recursive editor exposes every factor, constant and per-node zero policy, emitting only the changed branch', async () => {
  const w = mount(Editor, { props: { modelValue: formula.root, factors }, global: { components: { ElSelect: Field, ElInput: Field, ElInputNumber: Field }, stubs: { ElOption: true } } })
  const constantInput = w.findAllComponents(Field).find(f => f.attributes('aria-label') === '数字常量')
  assert.equal(constantInput.props('modelValue'), '100')
  constantInput.vm.$emit('update:modelValue', '200')
  await vue.nextTick()
  const updated = w.emitted('update:modelValue').at(-1)[0]
  assert.equal(updated.arguments[0].right.value, '200')
  assert.deepEqual(updated.arguments[0].left, formula.root.arguments[0].left)
  assert.equal(formula.root.arguments[0].right.value, '100')
  assert.equal(w.findAllComponents(Field).filter(f => f.attributes('aria-label') === '引用因子').length, 4)
  assert.equal(w.findAllComponents(Field).filter(f => f.attributes('aria-label') === '该节点分母为零策略').length, 1)
  await w.setProps({ disabled: true })
  assert.ok(w.findAllComponents(Field).every(f => f.props('disabled')))
  w.unmount()
})
