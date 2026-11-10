import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { runtimeParameterLabel } from '../src/idmp/utils/runtimeParameterLabel.js'
import { normalizeSqlRuntimeParameter, collectSqlRuntimeParameters, buildSqlImportMetadataPayload } from '../src/idmp/api/adapters/sqlImport.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
async function compile(path, exposed = '') {
  const source = await readFile(new URL(`../src/idmp/${path}`, import.meta.url), 'utf8')
  const { descriptor } = parse(source.replace('</script>', `${exposed}\n</script>`))
  const script = compileScript(descriptor, { id: path, inlineTemplate: true }).content
  const bindings = [...script.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
    .flatMap(([, names]) => names.split(',').map(name => {
      const [original, local = original] = name.trim().split(/\s+as\s+/)
      return `const ${local} = vue.${original};`
    })).join('\n')
  return deps => Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps; ${bindings}\n${script.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, deps)
}
const Fields = (await compile('components/RuntimeParameterFields.vue'))({ runtimeParameterLabel })
const TemplatePage = await compile('views/FactorTemplateManagement.vue', 'defineExpose({ rows, filters, canManageTemplates, load, open })')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Input = vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (props, { emit }) => () => vue.h('input', { value: props.modelValue, onInput: event => emit('update:modelValue', event.target.value) }) })
const Table = vue.defineComponent({ props: ['data'], setup: () => () => vue.h('div') })

test('runtime parameter labels honor business names and known Chinese fallbacks', () => {
  assert.equal(runtimeParameterLabel({ code: 'deptCode' }), '科室编码')
  assert.equal(runtimeParameterLabel({ code: 'DEPT_CODE', label: 'DEPT_CODE' }), '科室编码')
  assert.equal(runtimeParameterLabel({ code: 'deptCode', displayName: '出院科室', label: '科室' }), '出院科室')
  assert.equal(runtimeParameterLabel({ code: 'customLimit', name: '业务阈值' }), '业务阈值')
  assert.equal(runtimeParameterLabel({ code: 'unknownCode' }), 'unknownCode')
})

test('rendered query fields show Chinese while updates retain the original request key', async () => {
  const wrapper = mount(Fields, {
    props: { declarations: [{ code: 'deptCode', type: 'STRING', required: true }, { code: 'limit', type: 'STRING', displayName: '年龄下限' }], modelValue: {}, showMetadata: false },
    global: { components: { ElInput: Input, ElOption: Pass, ElSelect: Pass, ElInputNumber: Input, ElDatePicker: Input } }
  })
  assert.equal(wrapper.findAll('label')[0].text(), '科室编码*')
  assert.equal(wrapper.findAll('label')[1].text(), '年龄下限')
  await wrapper.findAll('input')[0].setValue('D001')
  assert.deepEqual(wrapper.emitted('update:modelValue')[0], [{ deptCode: 'D001' }])
  wrapper.unmount()
})

test('SQL preview retains parameter names without adding unsupported write fields', () => {
  const parameter = { code: 'deptCode', type: 'STRING', required: false, parameterMode: 'TEMPORARY', displayName: '出院科室' }
  assert.equal(normalizeSqlRuntimeParameter(parameter).displayName, '出院科室')
  assert.equal(collectSqlRuntimeParameters([{ parameters: [parameter] }])[0].displayName, '出院科室')
  const result = buildSqlImportMetadataPayload({ scope: 'FACTORS_ONLY', factors: [{ key: 'count', name: '人数', calculationMode: 'STATIC', parameters: [parameter] }] })
  assert.deepEqual(result.factors[0].parameters, [{ code: 'deptCode', type: 'STRING', required: false, parameterMode: 'TEMPORARY' }])
})

function templates(manage, overrides = {}) {
  const requests = [], routes = []
  const deps = {
    useRouter: () => ({ push: value => routes.push(value) }),
    canRequest: (method, path) => manage && method === 'PATCH' && path === '/factor-template-versions/1',
    fetchFactorTemplates: async params => {
      requests.push(params)
      return [{ id: 'draft', name: '合法草稿', publicationStatus: 'DRAFT' }, { id: 'published', name: '正式模板', currentPublishedVersionId: 'v2', publicationStatus: 'PUBLISHED' }]
    },
    fetchFactorTemplateVersions: async () => [{ id: 'archived', publicationStatus: 'ARCHIVED' }, { id: 'v2', publicationStatus: 'PUBLISHED' }],
    ElMessage: { error: assert.fail, info: () => {} }, PageHeader: Pass, StatusBadge: Pass, ...overrides
  }
  const wrapper = mount(TemplatePage(deps), { global: {
    components: { ElForm: Pass, ElFormItem: Pass, ElInput: Input, ElButton: Pass, ElTable: Table, ElTableColumn: Pass, ElSelect: Pass, ElOption: Pass },
    directives: { access: {}, loading: {}, 'query-enter': {} }
  } })
  return { wrapper, requests, routes }
}

test('template users only receive usable published entries and cannot enter management', async () => {
  const state = templates(false)
  await flushPromises()
  assert.equal(state.requests[0].publicationStatus, 'PUBLISHED')
  assert.deepEqual(state.wrapper.vm.rows.map(row => row.id), ['published'])
  assert.equal(state.wrapper.vm.canManageTemplates, false)
  await state.wrapper.vm.open({ id: 'draft' })
  assert.deepEqual(state.routes, [])
  state.wrapper.unmount()
})

test('template managers retain legitimate drafts and never default to an archived version', async () => {
  const state = templates(true)
  await flushPromises()
  assert.equal(state.requests[0].publicationStatus, '')
  assert.equal(state.wrapper.vm.rows.length, 2)
  await state.wrapper.vm.open({ id: 'published', currentPublishedVersionId: 'v2' })
  assert.deepEqual(state.routes, ['/factor/templates/published/versions/v2'])
  state.wrapper.unmount()
})

test('template managers open a draft ahead of the current published version', async () => {
  const state = templates(true, { fetchFactorTemplateVersions: async () => [{ id: 'v2', publicationStatus: 'PUBLISHED' }, { id: 'draft', publicationStatus: 'DRAFT' }] })
  await flushPromises()
  await state.wrapper.vm.open({ id: 'published', currentPublishedVersionId: 'v2' })
  assert.equal(state.routes[0], '/factor/templates/published/versions/draft')
  state.wrapper.unmount()
})
