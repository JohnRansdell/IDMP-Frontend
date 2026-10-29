import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/SourceStandardization.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ form, createRule, validate, loadPreview, saveRule, canPublish, canEditRule, hasUnsavedChanges, validationResult, previewResult })\n</script>'))
const compiled = compileScript(descriptor, { id: 'standardization-lifecycle' }).content.replace(/^import .*$/gm, '').replace('export default', 'return')

async function fixture(status = 'PUBLISHED') {
  const original = { id: '10', publicationStatus: status, resourceVersion: 1, normalizers: ['TRIM'], unmatchedPolicy: 'SET_NULL', nullPolicy: 'KEEP_NULL', mappings: [{ sourceValue: '1', targetItemCode: 'MALE', targetValue: 'M' }, { sourceValue: '2', targetItemCode: 'FEMALE', targetValue: 'F' }] }
  const current = { rule: { name: '患者性别转换', description: '现行标准' }, version: structuredClone(original) }
  const calls = [], notices = []
  const dependencies = {
    computed: vue.computed, onMounted: vue.onMounted, reactive: vue.reactive, ref: vue.ref,
    useRoute: () => ({ params: { mappingId: '3' }, query: {} }), useRouter: () => ({ push() {} }),
    ElMessageBox: {}, ElMessage: { success: value => notices.push(value), warning() {}, error: value => { throw new Error(value) } },
    PageHeader: {}, StatePanel: {}, getStatusLabel: value => value, transformOptionLabel: value => value,
    fetchSourceValueProfile: async () => ({ items: [{ value: '2' }], totalCount: 12 }),
    fetchSourceTransformRule: async () => structuredClone(current), fetchSemanticFieldValueSet: async () => ({}), fetchValueSetItems: async () => [],
    createTransformRule: async (id, body) => { calls.push({ action: 'create', id, body }); return { ...current, version: { ...original, id: '11', publicationStatus: 'DRAFT' } } },
    previewTransformRule: async () => ({ matchedCount: 7, unmatchedCount: 5, inspectedDistinctCount: 2, items: [] }),
    validateTransformRule: async () => { calls.push({ action: 'validate' }); return { valid: true, resourceVersion: 2, coverageRate: 58.33, diagnostics: [{ severity: 'WARNING', message: '存在未映射源值' }] } },
    updateTransformRuleVersion: async () => ({ ...current, version: { ...original, publicationStatus: 'DRAFT' } }),
    publishTransformRule: async () => current
  }
  const Component = Function('deps', `const { ${Object.keys(dependencies).join(',')} } = deps; ${compiled}`)(dependencies)
  const wrapper = mount({ ...Component, render: () => null })
  await flushPromises()
  return { wrapper, calls, original }
}

test('published revisions copy all mappings and policies instead of inventing a first-row mapping', async () => {
  const { wrapper, calls, original } = await fixture()
  await wrapper.vm.createRule(true)
  assert.equal(calls[0].body.name, '患者性别转换')
  assert.equal(calls[0].body.unmatchedPolicy, 'SET_NULL')
  assert.deepEqual(calls[0].body.mappings, original.mappings.map(({ sourceValue, targetItemCode }) => ({ sourceValue, targetItemCode })))
  assert.equal(wrapper.vm.canEditRule, true)
  assert.equal(wrapper.vm.hasUnsavedChanges, false)
  wrapper.unmount()
})

test('unsaved mappings cannot publish the previous validated definition', async () => {
  const { wrapper, calls } = await fixture('VALIDATED')
  assert.equal(wrapper.vm.canPublish, true)
  wrapper.vm.form.mappings[0].sourceValue = '9'
  assert.equal(wrapper.vm.hasUnsavedChanges, true)
  assert.equal(wrapper.vm.canPublish, false)
  await wrapper.vm.validate()
  assert.deepEqual(calls, [])
  wrapper.unmount()
})

test('validation retains preview counts and exposes warnings separately', async () => {
  const { wrapper } = await fixture('DRAFT')
  await wrapper.vm.loadPreview()
  await wrapper.vm.validate()
  assert.equal(wrapper.vm.previewResult.matchedCount, 7)
  assert.equal(wrapper.vm.previewResult.unmatchedCount, 5)
  assert.equal(wrapper.vm.validationResult.coverageRate, 58.33)
  assert.equal(wrapper.vm.validationResult.diagnostics[0].message, '存在未映射源值')
  assert.equal(wrapper.vm.canPublish, true)
  wrapper.unmount()
})

test('published versions do not issue editable-only validation requests', async () => {
  const { wrapper, calls } = await fixture()
  await wrapper.vm.validate()
  assert.deepEqual(calls, [])
  assert.equal(wrapper.vm.canEditRule, false)
  wrapper.unmount()
})
