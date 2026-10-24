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
const Table = vue.defineComponent({ props: ['data'], setup: props => () => vue.h('div', props.data.map(row => vue.h('span', row.displayName))) })

function create(authenticated = true, overrides = {}) {
  const calls = { health: 0, users: 0 }, messages = []
  const deps = {
    PageHeader: Pass, StatePanel: State, StatusBadge: Badge, Refresh: {},
    ElMessageBox: { confirm: async () => {} },
    ElMessage: Object.fromEntries(['success', 'error', 'warning'].map(type => [type, message => messages.push({ type, message })])),
    getStatusLabel: value => value, isAuthenticated: vue.ref(authenticated),
    sessionState: { user: authenticated ? { username: '300112', displayName: '测试医生', roles: ['科室分析员'] } : null },
    createSystemRole: async payload => ({ ...payload, status: 'ACTIVE' }),
    fetchHealth: async () => {
      calls.health++
      return overrides.fetchHealth ? overrides.fetchHealth() : { status: 'UP', endpoint: 'GET /api/v1/health', internal: 'auth/me' }
    },
    fetchSystemUsers: async () => {
      calls.users++
      return overrides.fetchSystemUsers ? overrides.fetchSystemUsers() : []
    },
    logout: async () => {}, logoutAll: async () => {}
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(Component, { global: { components: {
    ElButton: Button, ElForm: Pass, ElFormItem: Pass, ElInput: Pass,
    ElTable: Table, ElTableColumn: Pass
  } } })
  wrapper.testCalls = calls
  wrapper.testMessages = messages
  return wrapper
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
  await flushPromises()
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
  assert.equal(wrapper.testCalls.users, 0)
  wrapper.unmount()
})

test('entering the page loads health and users once without automatic toasts', async () => {
  const wrapper = create(true, { fetchSystemUsers: async () => ({ records: [{ username: '300112', displayName: '自动加载医生' }] }) })
  assert.deepEqual(wrapper.testCalls, { health: 1, users: 1 })
  await flushPromises()
  assert.match(wrapper.text(), /正常/)
  assert.match(wrapper.text(), /自动加载医生/)
  assert.doesNotMatch(wrapper.text(), /尚未执行健康检查|尚未读取用户/)
  assert.deepEqual(wrapper.testMessages, [])
  await wrapper.findAll('button').find(button => button.text() === '读取用户').trigger('click')
  await flushPromises()
  assert.equal(wrapper.testCalls.users, 2)
  assert.deepEqual(wrapper.testMessages, [{ type: 'success', message: '用户列表已更新' }])
  wrapper.unmount()
})

test('a pending health check does not delay users or permit duplicate requests', async () => {
  let resolveHealth
  const pending = new Promise(resolve => { resolveHealth = resolve })
  const wrapper = create(true, { fetchHealth: () => pending, fetchSystemUsers: async () => [{ username: '300112', displayName: '已加载医生' }] })
  await flushPromises()
  assert.match(wrapper.text(), /正在检查服务/)
  assert.match(wrapper.text(), /已加载医生/)
  await wrapper.findAll('button').find(button => button.text() === '检查服务').trigger('click')
  assert.equal(wrapper.testCalls.health, 1)
  resolveHealth({ status: 'UP' })
  await flushPromises()
  assert.match(wrapper.text(), /正常/)
  wrapper.unmount()
})

test('automatic load failures have independent inline errors and remain retryable', async () => {
  let failing = true
  const wrapper = create(true, {
    fetchHealth: async () => { if (failing) throw new Error('服务暂时不可用'); return { status: 'UP' } },
    fetchSystemUsers: async () => { if (failing) throw new Error('用户读取超时'); return [] }
  })
  await flushPromises()
  assert.match(wrapper.text(), /服务健康检查失败/)
  assert.match(wrapper.text(), /用户列表读取失败/)
  assert.deepEqual(wrapper.testMessages, [])
  failing = false
  await wrapper.findAll('button').find(button => button.text() === '检查服务').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '读取用户').trigger('click')
  await flushPromises()
  assert.match(wrapper.text(), /正常/)
  assert.match(wrapper.text(), /未返回用户记录/)
  assert.deepEqual(wrapper.testCalls, { health: 2, users: 2 })
  wrapper.unmount()
})

test('system health and users requests bypass caches on entry and refresh', async () => {
  const source = await readFile(new URL('../src/idmp/api/modules/system.js', import.meta.url), 'utf8')
  const code = source.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '').replaceAll('export ', '')
  const calls = []
  const api = Function('requestJson', `
    const hydrateCurrentUser = () => {}, loginWithPassword = () => {}, logoutSession = () => {}, refreshSession = () => {}, restoreSession = () => {};
    ${code}
    return { fetchHealth, fetchSystemUsers };
  `)((...args) => { calls.push(args); return Promise.resolve({}) })
  await api.fetchHealth()
  await api.fetchSystemUsers()
  assert.deepEqual(calls, [['/health', { cache: 'no-store' }], ['/system/users', { cache: 'no-store' }]])
})
