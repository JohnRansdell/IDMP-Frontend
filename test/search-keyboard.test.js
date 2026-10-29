import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'

test('every searchable selector opts into first-candidate keyboard selection', async () => {
  const missing = []
  const selectorFiles = new Set()
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) { await walk(file); continue }
      if (!file.endsWith('.vue')) continue
      const { descriptor } = parse(await readFile(file, 'utf8'))
      const prop = (node, name) => node.props.find(item => item.type === 6 ? item.name === name : item.name === 'bind' && item.arg?.content === name)
      function visit(node) {
        if (node.type === 1 && ['el-select', 'el-select-v2'].includes(node.tag) && prop(node, 'filterable')) {
          selectorFiles.add(file)
          const first = prop(node, 'default-first-option')
          if (!first || first.type === 7 && first.exp?.content !== 'true') missing.push(`${file}:${node.loc.start.line}`)
        }
        if (node.type === 1 && node.tag === 'el-cascader' && prop(node, 'filterable')) {
          assert.ok(file.endsWith('/SearchableCascader.vue'), `${file}: searchable cascaders must use the keyboard adapter`)
        }
        for (const child of node.children || []) visit(child)
      }
      if (descriptor.template?.ast) visit(descriptor.template.ast)
    }
  }
  await walk('src')
  for (const file of ['src/idmp/components/IndicatorVersionPicker.vue', 'src/idmp/components/ResourceReferenceSelect.vue', 'src/idmp/views/IndicatorMapping.vue']) {
    assert.ok(selectorFiles.has(file), `audit must include ${file}`)
  }
  assert.deepEqual(missing, [])
})
