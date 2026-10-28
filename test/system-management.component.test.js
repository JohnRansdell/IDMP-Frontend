import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment', 'Event']) globalThis[name] = dom.window[name]
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
const State = vue.defineComponent({ props: ['title', 'description'], setup: (props, { slots }) => () => vue.h('div', [`${props.title || ''} ${props.description || ''}`, slots.actions?.()]) })
const Badge = vue.defineComponent({ props: ['label'], setup: props => () => vue.h('span', props.label) })
const Table = vue.defineComponent({ props: ['data'], setup: props => () => vue.h('div', props.data.map(row => vue.h('span', row.displayName))) })
const Select = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue', 'change'], setup: (props, { slots, emit, attrs }) => () => vue.h('select', { ...attrs, disabled: props.disabled, value: props.modelValue, onChange: event => { emit('update:modelValue', event.target.value); emit('change', event.target.value) } }, [vue.h('option', { value: '' }, '选择用户'), slots.default?.()]) })
const Option = vue.defineComponent({ props: ['value', 'label'], setup: props => () => vue.h('option', { value: props.value }, props.label) })
const CheckboxGroup = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup(props, { slots, emit }) {
  vue.provide('checkbox-group', { values: () => props.modelValue, disabled: () => props.disabled, update: value => emit('update:modelValue', value) })
  return () => vue.h('div', slots.default?.())
} })
const Checkbox = vue.defineComponent({ props: ['value', 'disabled'], setup(props, { slots }) {
  const group = vue.inject('checkbox-group')
  return () => vue.h('label', [vue.h('input', { type: 'checkbox', value: props.value, checked: group.values().includes(props.value), disabled: props.disabled || group.disabled(), onChange: event => group.update(event.target.checked ? [...group.values(), props.value] : group.values().filter(value => value !== props.value)) }), slots.default?.()])
} })
const roles = [
  { roleId: '1', role: { roleKey: 'SYSTEM_ADMIN', roleName: '系统管理员', status: '0' } },
  { roleId: '6', role: { roleKey: 'DEPARTMENT_ANALYST', roleName: '科室分析员', status: '0' } },
  { roleId: '7', role: { roleKey: 'AUDITOR', roleName: '审计员', status: '0' } }
]

function create(authenticated = true, overrides = {}) {
  const calls = { health: 0, users: 0 }, messages = [], roleCalls = { list: 0, details: [], assignments: [] }
  const deps = {
    PageHeader: Pass, StatePanel: State, StatusBadge: Badge, SystemUserCreateDialog: Pass, Refresh: {}, Check: {}, Plus: {}, UserFilled: {},
    ElMessageBox: { confirm: overrides.confirm || (async () => {}) },
    ElMessage: Object.fromEntries(['success', 'error', 'warning'].map(type => [type, message => messages.push({ type, message })])),
    getStatusLabel: value => value, isAuthenticated: vue.ref(authenticated),
    sessionState: { user: authenticated ? { id: '1', username: 'T', displayName: '管理员', roles: overrides.sessionRoles || ['SYSTEM_ADMIN'] } : null },
    fetchSystemRoles: async () => { roleCalls.list++; return overrides.fetchSystemRoles ? overrides.fetchSystemRoles() : roles },
    fetchSystemUser: async id => {
      roleCalls.details.push(id)
      return overrides.fetchSystemUser ? overrides.fetchSystemUser(id) : { userId: id, user: { userName: '300112', nickName: '测试医生', roleIds: ['6'] } }
    },
    assignSystemUserRoles: async (id, ids) => { roleCalls.assignments.push([id, ids]); return overrides.assignSystemUserRoles?.(id, ids) },
    invalidateSession: overrides.invalidateSession || (() => {}),
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
    ElTable: Table, ElTableColumn: Pass, ElSelect: Select, ElOption: Option, ElCheckboxGroup: CheckboxGroup, ElCheckbox: Checkbox
  } } })
  wrapper.testCalls = calls
  wrapper.testMessages = messages
  wrapper.roleCalls = roleCalls
  return wrapper
}

test('system management shows user-facing sections without endpoint documentation', () => {
  const wrapper = create()
  assert.match(wrapper.text(), /当前会话/)
  assert.match(wrapper.text(), /服务健康状态/)
  assert.match(wrapper.text(), /用户列表/)
  assert.match(wrapper.text(), /分配用户角色/)
  assert.doesNotMatch(wrapper.text(), /创建角色|角色编码/)
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
    return { fetchHealth, fetchSystemUsers, fetchSystemRoles, fetchSystemUser };
  `)((...args) => { calls.push(args); return Promise.resolve({}) })
  await api.fetchHealth()
  await api.fetchSystemUsers()
  await api.fetchSystemRoles()
  await api.fetchSystemUser('102027642463211133')
  assert.deepEqual(calls, [['/health', { cache: 'no-store' }], ['/system/users', { cache: 'no-store' }], ['/system/roles', { cache: 'no-store' }], ['/system/users/102027642463211133', { cache: 'no-store' }]])
})

async function selectUser(wrapper, id = '102027642463211133') {
  await flushPromises()
  await wrapper.find('select').setValue(id)
  await flushPromises()
}
const userList = async () => [{ id: '102027642463211133', username: '300112', displayName: '测试医生' }, { id: '2', username: '300113', displayName: '其他医生' }]
function saveButton(wrapper) { return wrapper.findAll('button').find(button => button.text() === '保存角色分配') }

test('role assignment loads server roles, selects existing roles and saves multiple role IDs', async () => {
  const wrapper = create(true, { fetchSystemUsers: userList })
  await selectUser(wrapper)
  assert.equal(wrapper.roleCalls.list, 1)
  assert.deepEqual(wrapper.roleCalls.details, ['102027642463211133'])
  assert.equal(wrapper.find('input[value="6"]').element.checked, true)
  assert.equal(saveButton(wrapper).element.disabled, true)
  await wrapper.find('input[value="7"]').setValue(true)
  await saveButton(wrapper).trigger('click')
  await flushPromises()
  assert.deepEqual(wrapper.roleCalls.assignments, [['102027642463211133', ['6', '7']]])
  assert.match(wrapper.text(), /角色已更新/)
  assert.equal(wrapper.testCalls.users, 2)
  assert.equal(saveButton(wrapper).element.disabled, true)
  wrapper.unmount()
})

test('cancel confirmation and cancel edits do not save roles', async () => {
  const wrapper = create(true, { fetchSystemUsers: userList, confirm: async () => { throw new Error('cancel') } })
  await selectUser(wrapper)
  await wrapper.find('input[value="7"]').setValue(true)
  await saveButton(wrapper).trigger('click')
  await flushPromises()
  assert.deepEqual(wrapper.roleCalls.assignments, [])
  await wrapper.findAll('button').find(button => button.text() === '取消修改').trigger('click')
  assert.equal(wrapper.find('input[value="7"]').element.checked, false)
  await wrapper.find('input[value="6"]').setValue(false)
  assert.equal(saveButton(wrapper).element.disabled, true)
  wrapper.unmount()
})

test('non-administrators cannot load or assign user roles', async () => {
  const wrapper = create(true, { sessionRoles: ['DEPARTMENT_ANALYST'] })
  await flushPromises()
  assert.equal(wrapper.testCalls.users, 0)
  assert.equal(wrapper.roleCalls.list, 0)
  assert.equal(wrapper.find('select').exists(), false)
  assert.doesNotMatch(wrapper.text(), /创建用户/)
  assert.match(wrapper.text(), /仅系统管理员可以分配用户角色/)
  wrapper.unmount()
})

test('role load failures show retry and prevent saving', async () => {
  let fail = true
  const wrapper = create(true, { fetchSystemUsers: userList, fetchSystemRoles: async () => { if (fail) throw new Error('角色加载超时'); return roles } })
  await selectUser(wrapper)
  assert.match(wrapper.text(), /角色列表读取失败/)
  assert.equal(saveButton(wrapper), undefined)
  fail = false
  await wrapper.findAll('button').find(button => button.text() === '重试读取').trigger('click')
  await flushPromises()
  assert.match(wrapper.text(), /科室分析员/)
  wrapper.unmount()
})

test('late user detail responses cannot overwrite the latest selected user', async () => {
  let firstResolve
  const wrapper = create(true, { fetchSystemUsers: userList, fetchSystemUser: id => id === '2' ? Promise.resolve({ userId: '2', user: { userName: '300113', nickName: '其他医生', roleIds: ['7'] } }) : new Promise(resolve => { firstResolve = resolve }) })
  await selectUser(wrapper)
  await wrapper.find('select').setValue('2')
  await flushPromises()
  firstResolve({ userId: '102027642463211133', user: { userName: '300112', nickName: '测试医生', roleIds: ['6'] } })
  await flushPromises()
  assert.equal(wrapper.find('input[value="7"]').element.checked, true)
  assert.equal(wrapper.find('input[value="6"]').element.checked, false)
  wrapper.unmount()
})

test('save failures keep pending edits and show the actual backend error', async () => {
  const wrapper = create(true, { fetchSystemUsers: userList, assignSystemUserRoles: async () => { throw new Error('不能移除最后一个有效管理员') } })
  await selectUser(wrapper)
  await wrapper.find('input[value="7"]').setValue(true)
  await saveButton(wrapper).trigger('click')
  await flushPromises()
  assert.match(wrapper.text(), /不能移除最后一个有效管理员/)
  assert.equal(wrapper.find('input[value="7"]').element.checked, true)
  assert.equal(saveButton(wrapper).element.disabled, false)
  wrapper.unmount()
})

test('confirmation locks edits and prevents duplicate role assignments', async () => {
  let confirm
  const wrapper = create(true, { fetchSystemUsers: userList, confirm: () => new Promise(resolve => { confirm = resolve }) })
  await selectUser(wrapper)
  await wrapper.find('input[value="7"]').setValue(true)
  await saveButton(wrapper).trigger('click')
  assert.equal(wrapper.find('select').element.disabled, true)
  assert.equal(wrapper.find('input[value="7"]').element.disabled, true)
  await saveButton(wrapper).trigger('click')
  assert.equal(wrapper.roleCalls.assignments.length, 0)
  confirm()
  await flushPromises()
  assert.equal(wrapper.roleCalls.assignments.length, 1)
  wrapper.unmount()
})

test('editing own roles invalidates the local session and requests login', async () => {
  let invalidations = 0, logouts = 0
  const listener = () => logouts++
  window.addEventListener('idmp:logout', listener)
  const wrapper = create(true, {
    fetchSystemUsers: async () => [{ id: '1', username: 'T', displayName: '管理员' }],
    fetchSystemUser: async () => ({ userId: '1', user: { userName: 'T', nickName: '管理员', roleIds: ['1'] } }),
    invalidateSession: () => invalidations++
  })
  try {
    await selectUser(wrapper, '1')
    await wrapper.find('input[value="7"]').setValue(true)
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    assert.equal(invalidations, 1)
    assert.equal(logouts, 1)
    assert.equal(wrapper.testCalls.users, 1)
  } finally {
    window.removeEventListener('idmp:logout', listener)
    wrapper.unmount()
  }
})

test('unavailable existing roles can be removed but cannot be saved again', async () => {
  const wrapper = create(true, {
    fetchSystemUsers: userList,
    fetchSystemUser: async id => ({ userId: id, user: { userName: '300112', nickName: '测试医生', roleIds: ['6', '99'] } })
  })
  await selectUser(wrapper)
  assert.match(wrapper.text(), /已失效角色（不可用）/)
  await wrapper.find('input[value="7"]').setValue(true)
  await saveButton(wrapper).trigger('click')
  await flushPromises()
  assert.deepEqual(wrapper.roleCalls.assignments, [])
  assert.ok(wrapper.testMessages.some(item => item.message === '请移除不可用角色后保存'))
  await wrapper.find('input[value="99"]').setValue(false)
  await saveButton(wrapper).trigger('click')
  await flushPromises()
  assert.deepEqual(wrapper.roleCalls.assignments, [['102027642463211133', ['6', '7']]])
  wrapper.unmount()
})

test('role-only API updates preserve fresh user fields and never create roles', async () => {
  const source = await readFile(new URL('../src/idmp/api/modules/system.js', import.meta.url), 'utf8')
  const code = source.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '').replaceAll('export ', '')
  const calls = [], user = { userName: '300112', nickName: '最新姓名', deptId: '15', status: '0', sex: '0', remark: '保留说明', email: 'staff@example.org', roleIds: ['6'] }
  const assign = Function('requestJson', `const hydrateCurrentUser=()=>{},loginWithPassword=()=>{},logoutSession=()=>{},refreshSession=()=>{},restoreSession=()=>{}; ${code}; return assignSystemUserRoles`)(async (...args) => { calls.push(args); return { userId: '102027642463211133', user } })
  await assign('102027642463211133', ['6', '7'])
  assert.equal(calls[0][0], '/system/users/102027642463211133')
  assert.equal(calls[0][1].cache, 'no-store')
  assert.equal(calls[1][1].method, 'PUT')
  assert.deepEqual(JSON.parse(calls[1][1].body), { ...user, roleIds: ['6', '7'] })
  assert.ok(calls.every(([path]) => !path.includes('/roles')))
})
