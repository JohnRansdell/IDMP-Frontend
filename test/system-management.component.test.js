import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/SystemManagement.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'system-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const code = compiled.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', [slots.default?.(), slots.meta?.(), slots.actions?.()]) })
const Button = vue.defineComponent({ setup: (_, { slots, attrs }) => () => vue.h('button', attrs, slots.default?.()) })
const State = vue.defineComponent({ props: ['title', 'description'], setup: props => () => vue.h('div', `${props.title || ''} ${props.description || ''}`) })
const Badge = vue.defineComponent({ props: ['label'], setup: props => () => vue.h('span', props.label) })

function create(authenticated = true) {
  const deps = {
    PageHeader: Pass, StatePanel: State, StatusBadge: Badge, Refresh: {},
    ElMessageBox: { confirm: async () => {} },
    ElMessage: { success() {}, error() {}, warning() {} },
    getStatusLabel: value => value, isAuthenticated: vue.ref(authenticated),
    sessionState: { user: authenticated ? { username: '300112', displayName: '测试医生', roles: ['科室分析员'] } : null },
    createSystemRole: async payload => ({ ...payload, status: 'ACTIVE' }),
    fetchHealth: async () => ({ status: 'UP', endpoint: 'GET /api/v1/health', internal: 'auth/me' }),
    fetchSystemUsers: async () => [], logout: async () => {}, logoutAll: async () => {}
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  return mount(Component, { global: { components: {
    ElButton: Button, ElForm: Pass, ElFormItem: Pass, ElInput: Pass,
    ElTable: Pass, ElTableColumn: Pass
  } } })
}

test('system management shows user-facing sections without endpoint documentation', () => {
  const wrapper = create()
  assert.match(wrapper.text(), /当前会话/)
  assert.match(wrapper.text(), /服务健康状态/)
  assert.match(wrapper.text(), /用户列表/)
  assert.match(wrapper.text(), /创建角色/)
  assert.doesNotMatch(wrapper.text(), /auth\/me|\/api\/|真实接口|请求适配层/)
  wrapper.unmount()
})

test('health checks show status without exposing the raw service response', async () => {
  const wrapper = create()
  await wrapper.findAll('button').find(button => button.text() === '检查服务').trigger('click')
  await flushPromises()
  assert.match(wrapper.text(), /正常/)
  assert.doesNotMatch(wrapper.text(), /auth\/me|\/api\/|endpoint|返回内容/)
  wrapper.unmount()
})

test('anonymous state is readable without implementation details', () => {
  const wrapper = create(false)
  assert.match(wrapper.text(), /请登录后查看账户信息/)
  assert.doesNotMatch(wrapper.text(), /auth\/me|\/api\/|请求适配层/)
  wrapper.unmount()
})
