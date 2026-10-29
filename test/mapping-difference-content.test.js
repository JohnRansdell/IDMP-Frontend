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
const tableSfc = parse(await readFile(new URL('../src/idmp/components/MappingDifferenceTable.vue', import.meta.url), 'utf8'))
const tableCode = compileScript(tableSfc.descriptor, { id: 'mapping-table', inlineTemplate: true }).content
const tableBindings = [...tableCode.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const Table = Function('vue', 'MappingDifferenceValue', `${tableBindings}\n${tableCode.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, Component)

test('business factor details and policies remain readable without SQL or compiler configuration', () => {
  const value = [{ factorName: '老年住院费用', versionNo: '2', factorVersionId: '90071992547409931', parameterValue: { 年龄下限: 65 }, filterConditionDisplayText: '仅统计已出院患者', calculationExpressionAst: { sqlTemplate: 'SELECT SUM(total_cost) FROM 病案表', dimensionBindings: { 科室: 'out_dept_code' } } }, { policyFileName: '质量统计要求', citationText: '仅统计住院患者' }]
  const w = mount(Component, { props: { value, counterpart: [] } })
  for (const expected of ['老年住院费用', 'V2', '年龄下限', '65', '质量统计要求', '仅统计住院患者', '仅统计已出院患者']) assert.ok(w.text().includes(expected), expected)
  assert.doesNotMatch(w.text(), /SELECT|out_dept_code|查询 SQL|计算定义/)
  assert.equal(w.text().includes('90071992547409931'), false)
  assert.equal(w.text().includes('已返回结构化内容'), false)
  w.unmount()
})

test('SQL-only changes do not produce business difference badges and snapshots stay untouched', () => {
  const factor = { factorName: '住院人数', versionNo: 1, parameterValue: { 年龄: 0, 排除: false } }
  const source = [{ ...factor, calculationExpressionAst: { sqlTemplate: 'SELECT COUNT(*) FROM old' }, outputDescriptor: { grain: ['old_field'] } }]
  const target = [{ ...factor, calculationExpressionAst: { sqlTemplate: 'SELECT COUNT(*) FROM new' }, outputDescriptor: { grain: ['new_field'] } }]
  const difference = { factors: { source, target, different: true }, sqlTemplate: { source: 'SELECT 1', target: 'SELECT 2', different: true } }
  const original = JSON.stringify(difference)
  const rows = buildDifferenceRows(difference)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].different, false)
  assert.deepEqual(rows[0].sourceValue, [factor])
  assert.equal(JSON.stringify(difference), original)
  target[0].parameterValue = { 年龄: 65, 排除: false }
  assert.equal(buildDifferenceRows(difference)[0].different, true)
})

test('factor display matches counterpart by name instead of comparing unrelated array positions', () => {
  const a = { factorName: '人数', versionNo: 1 }, b = { factorName: '费用', versionNo: 2 }
  assert.equal(content.differenceCounterpart(a, [b, a], 0), a)
  assert.equal(content.differenceCounterpart({ factorName: '新增' }, [b, a], 0), undefined)
})

test('business comparison has aligned source/target cells and supports filtering to empty', async () => {
  const rows = buildDifferenceRows({ unit: { source: '元', target: '人', different: true }, allowScenarioOverride: { source: false, target: false, different: false } })
  const w = mount(Table, { props: { rows } })
  assert.equal(w.findAll('[role="columnheader"]').length, 3)
  assert.equal(w.findAll('.comparison-row').length, 2)
  assert.equal(w.findAll('.comparison-row')[0].findAll('[role="cell"]').length, 2)
  assert.deepEqual(w.findAll('.comparison-status').map(item => item.text()), ['有差异', '一致'])
  assert.equal(w.findAll('.mapping-difference-value').filter(item => item.text() === '否').length, 2)
  await w.setProps({ rows: [] })
  assert.equal(w.findAll('.comparison-row').length, 0)
  assert.match(w.text(), /当前筛选下暂无差异项/)
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
  const versions = content.formulaDifferences(
    { root: { nodeType: 'FACTOR_REF', factorVersionId: 'old' } }, { root: { nodeType: 'FACTOR_REF', factorVersionId: 'new' } },
    [{ factorVersionId: 'old', factorName: '老年住院费用', versionNo: 1 }], [{ factorVersionId: 'new', factorName: '老年住院费用', versionNo: 2 }])
  assert.equal(versions[0].source, '老年住院费用 · V1')
  assert.equal(versions[0].target, '老年住院费用 · V2')
})
