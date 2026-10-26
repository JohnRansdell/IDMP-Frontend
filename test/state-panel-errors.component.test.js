import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import * as icons from '@element-plus/icons-vue'
import { toUserMessage } from '../src/idmp/utils/userMessage.js'

const { descriptor } = parse(await readFile(new URL('../src/idmp/components/StatePanel.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'state-panel-errors', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, '').replace('export default', 'return')
const component = Function('vue', 'icons', 'toUserMessage', `const { CircleClose, DataLine, Loading, Lock, Warning } = icons; ${bindings}\n${code}`)(vue, icons, toUserMessage)
async function render(props) {
  const app = vue.createSSRApp(component, props)
  app.component('ElIcon', { setup: (_, { slots }) => () => vue.h('span', slots.default?.()) })
  return renderToString(app)
}

test('shared error panels hide technical details even for locally thrown errors', async () => {
  for (const type of ['error', 'permission', 'unavailable']) {
    const html = await render({ type, title: '读取失败：GET /api/v1/indicators', description: '查询失败：Cannot read properties of undefined' })
    assert.doesNotMatch(html, /\/api\/|GET|Cannot read|undefined/)
    assert.match(html, /重试|管理员/)
  }
})

test('error panels keep useful business errors and empty states keep ordinary content unchanged', async () => {
  assert.match(await render({ type: 'error', description: '指标编码已存在，请使用其他编码' }), /指标编码已存在，请使用其他编码/)
  assert.match(await render({ type: 'empty', title: '尚未创建', description: '请选择科室后查询' }), /请选择科室后查询/)
})
