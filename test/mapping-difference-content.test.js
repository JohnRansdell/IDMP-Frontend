import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as content from '../src/idmp/features/mapping/differenceContent.js'
import { buildDifferenceRows } from '../src/idmp/features/mapping/presentation.js'
const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/MappingDifferenceValue.vue', import.meta.url), 'utf8'), { filename: 'MappingDifferenceValue.vue' })
const compiled = compileScript(descriptor, { id: 'mapping-value', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const Component = Function('vue', 'content', `const {${Object.keys(content).join(',')}} = content; ${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, content)

test('factor SQL, bindings, parameters and policies are visible rather than summarized away', () => {
  const value = [{ factorName: '老年住院费用', versionNo: '2', factorVersionId: '90071992547409931', calculationExpressionAst: { sqlTemplate: 'SELECT SUM(total_cost) FROM 病案表', dimensionBindings: { 科室: 'out_dept_code' }, parameters: [{ name: '年龄下限', value: 65 }] } }, { policyFileName: '质量统计要求', citationText: '仅统计住院患者' }]
  const w = mount(Component, { props: { value, counterpart: [] } })
  for (const expected of ['老年住院费用', 'SELECT SUM(total_cost)', 'out_dept_code', '年龄下限', '65', '质量统计要求', '仅统计住院患者']) assert.ok(w.text().includes(expected), expected)
  assert.equal(w.text().includes('90071992547409931'), false)
  assert.equal(w.text().includes('已返回结构化内容'), false)
  w.unmount()
})
test('false, zero, null and empty collections remain distinguishable', () => {
  for (const [value, text] of [[false, '否'], [0, '0'], [null, '未配置'], [[], '无配置'], [{}, '无业务配置'], [{ nodeId: '1' }, '无业务配置']]) {
    const w = mount(Component, { props: { value } }); assert.equal(w.text(), text); w.unmount()
  }
})
test('snapshot metadata is not rendered as a bogus comparison row', () => {
  const source = { root: { nodeType: 'CONST', value: '0' } }
  const rows = buildDifferenceRows({ schemaVersion: '1.0', hasDifferences: true, formulaAst: { source, target: null, different: true } })
  assert.equal(rows.length, 1); assert.equal(rows[0].sourceValue, source)
})
test('formula changes identify operators, display precision and exact factor versions, ignoring node IDs only', () => {
  const root = { nodeType: 'BINARY', operator: 'SUB', left: { nodeType: 'FACTOR_REF', factorVersionId: '1' }, right: { nodeType: 'CONST', value: '0' } }
  assert.deepEqual(content.formulaDifferences({ root }, { root: { ...root, nodeId: 'other' } }), [])
  const changes = content.formulaDifferences({ root, display: { scale: 2 } }, { root: { ...root, operator: 'DIV' }, display: { scale: 4 } })
  assert.deepEqual(changes.map(x => [x.path.join('/'), x.source, x.target]), [['公式/运算符', '减', '除'], ['展示格式/小数位数', '2', '4']])
})
