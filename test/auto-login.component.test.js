import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { resolveSsoEntry } from '../src/idmp/auth/medicalSso.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/auto-login' })
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/views/AutoLogin.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'auto-login-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, values]) => values.split(',').map(value => {
    const [name, local = name] = value.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${name};`
  })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const State = vue.defineComponent({ props: ['title', 'description'], setup: (props, { slots }) => () => vue.h('section', [props.title, props.description, slots.actions?.()]) })
const query = { doctorNo: '300112', displayName: '杜琴', timestamp: '1793318400', nonce: '0123456789abcdef', sign: 'a'.repeat(64) }
function create(params, login) {
  window.history.replaceState({}, '', '/auto-login?' + new URLSearchParams(params))
  const navigations = []
  const component = Function('vue', 'deps', `const {StatePanel,useRoute,useRouter,loginWithSsoCredentials,resolveSsoEntry}=deps;\n${bindings}\n${body}`)(vue, {
    StatePanel: State, useRoute: () => ({ query: params }), useRouter: () => ({ replace: target => navigations.push(target) }),
    loginWithSsoCredentials: login, resolveSsoEntry
  })
  return { wrapper: mount(component, { global: { components: { ElButton: vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) }) } } }), navigations }
}

test('平台免登在请求前清除地址栏凭证并提交签名字段', async () => {
  let calls = 0
  const { wrapper, navigations } = create(query, async (payload, entry) => {
    calls++
    assert.equal(window.location.search, '')
    assert.equal(entry, 'PLATFORM')
    assert.deepEqual(payload, { ...query, timestamp: Number(query.timestamp) })
  })
  await flushPromises()
  assert.equal(calls, 1)
  assert.deepEqual(navigations, ['/dashboard'])
  wrapper.unmount()
})

test('验签错误保持真实提示并允许回到账户密码登录', async () => {
  const { wrapper, navigations } = create(query, async () => { throw new Error('登录链接已使用，请从来源系统重新进入') })
  await flushPromises()
  assert.match(wrapper.text(), /登录链接已使用/)
  assert.equal(window.location.search, '')
  assert.deepEqual(navigations, [])
  await wrapper.get('button').trigger('click')
  assert.deepEqual(navigations, ['/login'])
  wrapper.unmount()
})

test('旧平台令牌不再提交或自动降级为看板登录', async () => {
  let calls = 0
  const { wrapper, navigations } = create({ token: 'old-token' }, async () => { calls++ })
  await flushPromises()
  assert.equal(calls, 0)
  assert.match(wrapper.text(), /平台登录链接已失效/)
  assert.equal(window.location.search, '')
  assert.deepEqual(navigations, [])
  wrapper.unmount()
})
