import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'

test('factor create/edit hides grouping controls without dropping persisted grouping', async () => {
  const source = await readFile(new URL('../src/idmp/views/FactorEditor.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const ast = descriptor.template.ast
  const visit = node => {
    if (node.type === 1 && node.props.some(p => p.type === 6 && p.name === 'class' && p.value?.content === 'group-by-form')) {
      assert.ok(node.props.some(p => p.type === 7 && p.name === 'if' && p.exp?.content === 'definitionOnly'))
      return 1
    }
    return (node.children || []).reduce((count, child) => count + visit(child), 0)
  }
  assert.equal(visit(ast), 1)
  assert.match(source, /groupBy:dslForm\.groupBy/)
  assert.match(source, /dslForm\.groupBy = \(dsl\.groupBy \|\| \[\]\)/)
})
