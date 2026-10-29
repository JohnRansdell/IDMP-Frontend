import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { indicatorVersionLabel } from '../src/idmp/features/mapping/presentation.js'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/IndicatorMappingDetail.vue', import.meta.url), 'utf8')
const { descriptor } = parseSfc(source)
const labels = []
function visit(node) {
  if (node.type === 1 && node.props.some(prop => prop.name === 'class' && prop.value?.content.includes('relation-party__version'))) labels.push(node.loc.source)
  for (const child of node.children || []) visit(child)
}
visit(descriptor.template.ast)
assert.equal(labels.length, 2)
const render = vue.compile(`<div>${labels.join('')}</div>`)

for (const [name, sourceIndicator, targetIndicator, expected] of [
  ['separate version numbers', { versionNo: '1', indicatorVersionId: '102027642468026658' }, { versionNo: '3', indicatorVersionId: '102027642468062316' }, ['指标版本 V1', '指标版本 V3']],
  ['missing numbers never fall back to identifiers', { indicatorVersionId: '102027642468026658' }, { versionNo: null, indicatorVersionId: '102027642468062316' }, ['指标版本 -', '指标版本 -']],
  ['absent references', undefined, undefined, ['指标版本 -', '指标版本 -']]
]) test(name, () => {
  const wrapper = mount({ render, setup: () => ({ mapping: { sourceIndicator, targetIndicator }, indicatorVersionLabel }) })
  assert.deepEqual(wrapper.findAll('.relation-party__version').map(item => item.text()), expected)
  wrapper.unmount()
})

test('mapping list renders version numbers from references, never opaque IDs', async () => {
  const { descriptor } = parseSfc(await readFile(new URL('../src/idmp/views/IndicatorMapping.vue', import.meta.url), 'utf8'))
  const spans = []
  function visitList(node) {
    if (node.type === 1 && node.props.some(prop => prop.name === 'class' && prop.value?.content.includes('mapping-version'))) spans.push(node.loc.source)
    for (const child of node.children || []) visitList(child)
  }
  visitList(descriptor.template.ast)
  assert.equal(spans.length, 2)
  for (const number of ['1', '12', null]) {
    const ref = { versionNo: number, indicatorVersionId: '102027642468026658' }
    const wrapper = mount({ render: vue.compile(`<div>${spans.join('')}</div>`), setup: () => ({ row: { sourceIndicator: ref, targetIndicator: ref }, indicatorVersionLabel }) })
    assert.deepEqual(wrapper.findAll('.mapping-version').map(item => item.text()), Array(2).fill(`指标版本 ${number ? `V${number}` : '-'}`))
    wrapper.unmount()
  }
})
