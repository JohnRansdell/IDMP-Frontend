import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapter from '../src/idmp/api/adapters/warning.js'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/AlertCenter.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ eventPage, rulePage, eventSize, ruleSize, eventFilters, ruleFilters, events, rules, eventError, ruleError, eventLoading, ruleLoading, searchEvents, searchRules })\n</script>'))
descriptor.template = parse('<template><div /></template>').descriptor.template
const compiled = compileScript(descriptor, { id: 'warning-pages', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
async function create(read) {
  const calls = []
  const list = async params => { calls.push({ ...params }); return read(params) }
  const deps = { ...adapter, canRequest: () => true, useRouter: () => ({}), useRoute: () => ({ query: {}, name: 'AlertCenter' }),
    fetchWarnings: list, fetchWarningRules: list, fetchAllIndicatorVersions: async () => [], fetchWarningRecipients: async () => [],
    warningEventDimensions: () => [], ElMessage: { warning() {} }
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps; ${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(Component)
  await flushPromises()
  return { wrapper, calls }
}

for (const [kind,search,rows] of [['event','searchEvents','events'],['rule','searchRules','rules']]) {
  test(`${kind} search and page-size change request page one`, async () => {
    const { wrapper, calls } = await create(() => ({ records: [], total: 80 }))
    wrapper.vm[`${kind}Page`] = 4
    await wrapper.vm[search]()
    assert.equal(calls.at(-1).page, 1)
    wrapper.vm[`${kind}Page`] = 3; wrapper.vm[`${kind}Size`] = 50
    await wrapper.vm[search]()
    assert.equal(calls.at(-1).page, 1); assert.equal(calls.at(-1).size, 50)
    wrapper.unmount()
  })
  for (const failure of [false, true]) test(`${kind} ignores stale ${failure ? 'failure' : 'success'} after a newer query`, async () => {
    let finish
    const { wrapper } = await create(p => p.severity === 'HIGH' || p.name === '旧条件'
      ? new Promise((resolve,reject) => { finish = failure ? reject : resolve }) : { records: [{ id: '1' }], total: 1 })
    const field = kind === 'event' ? 'severity' : 'name'
    wrapper.vm[`${kind}Filters`][field] = kind === 'event' ? 'HIGH' : '旧条件'
    const old = wrapper.vm[search]()
    wrapper.vm[`${kind}Filters`][field] = ''
    await wrapper.vm[search]()
    finish(failure ? new Error('旧查询失败') : { records: [{ id: '2' }], total: 99 }); await old
    assert.equal(wrapper.vm[rows][0].id, '1'); assert.equal(wrapper.vm[`${kind}Error`], ''); assert.equal(wrapper.vm[`${kind}Loading`], false)
    wrapper.unmount()
  })
}

test('both warning forms and page-size controls use search handlers', () => {
  for (const action of ['searchEvents','searchRules']) {
    assert.ok(source.includes(`@submit.prevent="${action}"`))
    assert.ok(source.includes(`@size-change="${action}"`))
  }
})
