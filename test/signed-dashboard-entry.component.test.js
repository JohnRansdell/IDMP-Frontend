import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { signedDashboardParameters, scalarParameter } from '../src/idmp/auth/medicalSso.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/MedicalDashboard.vue', import.meta.url), 'utf8')
const compiled = compileScript(parse(source).descriptor, { id: 'signed-entry-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => { const [original, local = original] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${original};` })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const signed = { dashboardID: '0002', doctorNo: '1001', deptCode: '4101', sign: 'a'.repeat(64) }
function create(query, overrides = {}) {
  window.history.replaceState({}, '', '/medical-dashboard?' + new URLSearchParams(query))
  const navigations = []
  const deps = { StatePanel: vue.defineComponent({ props: ['title', 'description'], setup: props => () => vue.h('section', props.title + props.description) }),
    useRoute: () => ({ query }), useRouter: () => ({ replace: target => navigations.push(target) }),
    signedDashboardParameters, scalarParameter, isMedicalSession: () => false, getAccessToken: () => '',
    fetchMedicalSession: async () => { throw Error('unexpected platform dependency') },
    openMedicalDashboard: async () => { throw Error('unexpected unsigned entry') },
    enterSignedDashboard: async params => {
      assert.deepEqual(params, signed)
      assert.equal(window.location.search.includes('sign='), false)
      assert.equal(window.location.search.includes('doctorNo='), false)
      return { dashboardId: '2' }
    }, ...overrides }
  const component = Function('vue', 'deps', `const {${Object.keys(deps).join(',')}}=deps;\n${bindings}\n${body}`)(vue,deps)
  return { wrapper: mount(component, { global: { stubs: { 'el-button': true } } }), navigations }
}
test('无登录会话的签名链接直接进入授权看板并先清除地址栏凭据', async () => {
  const { wrapper, navigations } = create(signed)
  await flushPromises()
  assert.deepEqual(navigations, [{ path: '/dashboard', query: { id: '2', medical: '1' } }])
  wrapper.unmount()
})
test('验签失败展示后端原因，不回退普通看板', async () => {
  const { wrapper, navigations } = create(signed, { enterSignedDashboard: async () => { throw Error('看板链接签名无效') } })
  await flushPromises()
  assert.match(wrapper.text(), /看板链接签名无效/)
  assert.deepEqual(navigations, [])
  wrapper.unmount()
})
test('只有看板编号不能换取匿名访问', async () => {
  const { wrapper, navigations } = create({ id: '2' })
  await flushPromises()
  assert.match(wrapper.text(), /签名看板链接/)
  assert.deepEqual(navigations, [])
  wrapper.unmount()
})
