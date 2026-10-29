import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { parse } from '@vue/compiler-sfc'

test('all asynchronous tables distinguish pending queries from empty results', async () => {
  let checked = 0
  for (const file of await readdir(new URL('../src/idmp/', import.meta.url), { recursive: true })) {
    if (!file.endsWith('.vue')) continue
    const source = await readFile(new URL('../src/idmp/' + file.replaceAll('\\', '/'), import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [], file)
    function walk(node) {
      if (node.tag === 'el-table') {
        const loading = node.props.find(p => p.type === 7 && p.name === 'loading')?.exp?.content
        if (loading) {
          const empty = node.props.find(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'empty-text')?.exp?.content
          assert.ok(empty?.includes(loading) && empty.includes('正在查询'), `${file}: 加载期间不能显示暂无数据`)
          checked++
        }
      }
      for (const child of node.children || []) walk(child)
    }
    if (descriptor.template) walk(descriptor.template.ast)
  }
  assert.ok(checked >= 16)
})
