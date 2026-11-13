import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { categoryOptionsWithSavedPath, indicatorCategoryOptions } from '../src/idmp/features/indicator/categoryModel.js'
import { pickLatestVersion, resolveIndicatorVersionId, extractFormula } from '../src/idmp/features/indicator/versionModel.js'
import { toOpaqueId } from '../src/idmp/utils/resourceId.js'

function pageFunction(page, name, deps) {
  const { descriptor } = parse(readFileSync(new URL(`../src/idmp/views/${page}.vue`, import.meta.url), 'utf8'))
  const { scriptSetupAst } = compileScript(descriptor, { id: 'edit-entry-test' })
  const node = scriptSetupAst.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  return Function(...Object.keys(deps), `${descriptor.scriptSetup.content.slice(node.start, node.end)}; return ${name}`)(...Object.values(deps))
}
const oldId = '102027642463173253', latestId = '102027642468223950'
function loader(requested, { versions = [{ id: oldId, versionNo: 1 }, { id: latestId, versionNo: 2 }], owner = '100' } = {}) {
  const reads = [], hydrated = []
  const run = pageFunction('IndicatorEditor', 'loadEditableIndicatorVersion', {
    route: { query: requested ? { indicatorVersionId: requested } : {} }, toOpaqueId, resolveIndicatorVersionId, pickLatestVersion, extractFormula,
    normalizeList: rows => rows,
    fetchIndicatorVersions: async id => { reads.push(['versions', id]); return versions },
    fetchIndicatorVersion: async id => { reads.push(['detail', id]); return { id, indicatorId: owner, formula: { root: { nodeType: 'CONST', value: 1 } } } },
    hydrateIndicatorVersion: version => hydrated.push(version)
  })
  return { run, reads, hydrated }
}

test('editing a selected historical version preserves its exact ID instead of loading a newer version', async () => {
  const { run, reads, hydrated } = loader(oldId)
  await run('100')
  assert.deepEqual(reads, [['versions', '100'], ['detail', oldId]])
  assert.equal(hydrated[0].id, oldId)
})

test('editor without an explicit version keeps the existing latest-version selection', async () => {
  const { run, hydrated } = loader()
  await run('100')
  assert.equal(hydrated[0].id, latestId)
})

test('missing or cross-indicator versions never silently load a different configuration', async () => {
  const missing = loader('999')
  await assert.rejects(missing.run('100'), /指定指标版本不存在/)
  assert.deepEqual(missing.reads, [['versions', '100']])
  const wrongOwner = loader(oldId, { owner: '200' })
  await assert.rejects(wrongOwner.run('100'), /不匹配/)
  assert.deepEqual(wrongOwner.hydrated, [])
})

test('historical categories are selectable without changing their values or the global category catalog', () => {
  const before = JSON.stringify(indicatorCategoryOptions)
  const options = categoryOptionsWithSavedPath(['历史分类', '原子分类'])
  assert.equal(options.find(item => item.value === '历史分类').children[0].value, '原子分类')
  assert.equal(JSON.stringify(indicatorCategoryOptions), before)
  const existing = categoryOptionsWithSavedPath(['医疗质量', '质量安全'])
  assert.equal(existing.filter(item => item.value === '医疗质量').length, 1)
})

test('detail edit entry carries the viewed version', () => {
  const navigations = []
  const router = { push: target => navigations.push(target) }
  const openEditor = pageFunction('IndicatorDetail', 'openIndicatorEditor', {
    router, detail: { id: '100' }, routeIndicatorKey: { value: '100' }, selectedVersionId: { value: oldId }, loadError: { value: '' }
  })
  openEditor()
  assert.deepEqual(navigations[0], { name: 'IndicatorEditor', params: { id: '100' }, query: { indicatorVersionId: oldId } })

})
