import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { babelParse as parseJs, parse as parseVue } from '@vue/compiler-sfc'
import { shallowRef } from 'vue'
import { fetchAllPages } from '../src/idmp/api/pagination.js'

const dashboard = (await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8'))
const script = parseVue(dashboard).descriptor.scriptSetup.content
const ast = parseJs(script, { sourceType: 'module' })
const sourceOf = (ast, source, name) => {
  const node = ast.program.body.flatMap(node => node.declaration || node).find(node =>
    node.type === 'FunctionDeclaration' ? node.id.name === name
      : node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name))
  assert.ok(node, `Missing implementation: ${name}`)
  return source.slice(node.start, node.end)
}
const indicatorSource = await readFile(new URL('../src/idmp/api/modules/indicators.js', import.meta.url), 'utf8')
const indicatorAst = parseJs(indicatorSource, { sourceType: 'module' })
const indicatorFunctions = ['fetchAllIndicators', 'fetchIndicators', 'withQuery'].map(name => sourceOf(indicatorAst, indicatorSource, name)).join('\n')
const catalogLoader = sourceOf(ast, script, 'loadPublishedIndicatorCatalog')

function catalog(total, { failPage, pageSize = 100 } = {}) {
  const requests = []
  const rows = Array.from({ length: total }, (_, index) => ({ id: String(102027642463173248n + BigInt(index)), code: `I_${index}`, status: 'PUBLISHED' }))
  const requestJson = async (path, options) => {
    const params = new URL(path, 'http://test').searchParams
    const page = Number(params.get('page'))
    requests.push({ page, options })
    assert.ok(requests.length < 100, 'catalog loading must terminate, not allocate indefinitely')
    if (page === failPage) throw new Error('catalog unavailable')
    const size = Math.min(Number(params.get('size')), pageSize)
    return { records: rows.slice((page - 1) * size, page * size), total: String(total), pageNum: page, pageSize: size }
  }
  const fetchAllIndicators = Function('fetchAllPages', 'requestJson', `${indicatorFunctions}; return fetchAllIndicators`)(fetchAllPages, requestJson)
  const state = {
    catalogIndicatorSources: shallowRef([]), remoteFieldCatalog: shallowRef({}), remoteSourcePeriodOptions: shallowRef({}),
    selectedDataCode: shallowRef(''), indicatorCatalogLoading: shallowRef(false), indicatorCatalogError: shallowRef('')
  }
  const dependencies = { ...state, fetchAllIndicators, fetchDashboardDataSources: async () => rows,
    currentPublishedDashboardDataSources: (sources, indicators) => { assert.deepEqual(indicators, rows); return sources },
    sortDashboardDataSourcesByIndicatorCreatedAt: sources => sources, dashboardDataSourceToFrontend: source => source }
  const load = Function(...Object.keys(dependencies), `let indicatorCatalogRequest = null; ${catalogLoader}; return loadPublishedIndicatorCatalog`)(...Object.values(dependencies))
  return { load, rows, requests, state }
}

for (const total of [0, 99, 100, 101, 205, 1000]) test(`actual dashboard catalog terminates with ${total} indicators without duplicates`, async () => {
  const view = catalog(total)
  assert.equal(await view.load(), true)
  assert.deepEqual(view.requests.map(request => request.page), Array.from({ length: Math.max(1, Math.ceil(total / 100)) }, (_, index) => index + 1))
  assert.ok(view.requests.every(request => request.options.cache === 'no-store'))
  assert.deepEqual(view.state.catalogIndicatorSources.value, view.rows)
  assert.equal(new Set(view.state.catalogIndicatorSources.value.map(row => row.id)).size, total)
})

test('server-capped pages are fully loaded and concurrent refreshes share one request', async () => {
  const view = catalog(101, { pageSize: 20 })
  assert.deepEqual(await Promise.all([view.load(), view.load()]), [true, true])
  assert.deepEqual(view.requests.map(request => request.page), [1, 2, 3, 4, 5, 6])
  assert.equal(view.state.catalogIndicatorSources.value.length, 101)
})

test('later page failure terminates with an error instead of publishing a partial catalog', async () => {
  const view = catalog(101, { failPage: 2 })
  assert.equal(await view.load(), false)
  assert.equal(view.state.indicatorCatalogLoading.value, false)
  assert.equal(view.state.indicatorCatalogError.value, 'catalog unavailable')
  assert.deepEqual(view.state.catalogIndicatorSources.value, [])
})

test('repeated catalog refresh replaces previous data rather than accumulating copies', async () => {
  const view = catalog(101)
  for (let iteration = 0; iteration < 20; iteration++) {
    assert.equal(await view.load(), true)
    assert.deepEqual(view.state.catalogIndicatorSources.value, view.rows)
  }
  assert.equal(view.requests.length, 40)
})

test('published factor catalog honors the actual server page size and terminates for full lists', async () => {
  const source = await readFile(new URL('../src/idmp/api/modules/factors.js', import.meta.url), 'utf8')
  const ast = parseJs(source, { sourceType: 'module' })
  const implementation = sourceOf(ast, source, 'fetchPublishedFactorVersions')
  let calls = 0
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: String(index), status: 'PUBLISHED' }))
  const fetchFactorVersions = async ({ page }) => {
    calls++
    return { records: rows.slice((page - 1) * 20, page * 20), total: 101, pageSize: 20, pageNum: page }
  }
  const load = Function('fetchAllPages', 'fetchFactorVersions', `${implementation}; return fetchPublishedFactorVersions`)(fetchAllPages, fetchFactorVersions)
  assert.deepEqual(await load(), rows)
  assert.equal(calls, 6)
  const legacy = Function('fetchAllPages', 'fetchFactorVersions', `${implementation}; return fetchPublishedFactorVersions`)(fetchAllPages, async () => rows)
  assert.deepEqual(await legacy(), rows)
})

test('SQL import drill catalog loads capped pages once and rejects repeated pages before loading details', async () => {
  const raw = await readFile(new URL('../src/idmp/views/SqlIndicatorImport.vue', import.meta.url), 'utf8')
  const source = parseVue(raw).descriptor.scriptSetup.content
  const implementation = sourceOf(parseJs(source, { sourceType: 'module' }), source, 'loadDrillPathCatalog')
  for (const repeated of [false, true]) {
    const state = { drillPathCatalog: shallowRef([]), drillPathLoading: shallowRef(false), drillPathError: shallowRef('') }
    const rows = Array.from({ length: 101 }, (_, index) => ({ id: String(index), pathCode: 'ORGANIZATION', currentPublishedVersionId: String(index) }))
    let pages = 0, details = 0
    const dependencies = { ...state, fetchAllPages, fetchDrillPaths: async ({ page, subjectType }) => {
      assert.equal(subjectType, 'INDICATOR_RESULT')
      assert.ok(++pages <= 6, 'drill catalog requests must terminate')
      const start = repeated ? 0 : (page - 1) * 20
      return { records: rows.slice(start, start + 20), total: 101, pageSize: 20 }
    }, fetchDrillPathVersion: async id => {
      details++
      return { version: { id, publicationStatus: 'PUBLISHED' }, levels: ['HOSPITAL'] }
    } }
    const load = Function(...Object.keys(dependencies), `${implementation}; return loadDrillPathCatalog`)(...Object.values(dependencies))
    await load()
    assert.equal(state.drillPathLoading.value, false)
    assert.equal(pages, repeated ? 2 : 6)
    assert.equal(details, repeated ? 0 : 101)
    assert.equal(state.drillPathCatalog.value.length, repeated ? 0 : 101)
    if (repeated) assert.match(state.drillPathError.value, /分页未推进/)
    else assert.equal(state.drillPathError.value, '')
  }
})

async function sourceFiles(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) result.push(...await sourceFiles(url))
    else if (/\.(js|vue)$/.test(entry.name)) result.push(url)
  }
  return result
}
function walk(node, callback) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'comments', 'tokens'].includes(key)) continue
    if (Array.isArray(value)) value.forEach(child => walk(child, callback))
    else if (value && typeof value === 'object') walk(value, callback)
  }
}

test('all frontend consumers keep fetch-all calls out of pagination loops, including import aliases', async t => {
  const violations = []
  let files = 0, consumers = 0
  for (const url of await sourceFiles(new URL('../src/', import.meta.url))) {
    const raw = await readFile(url, 'utf8')
    const descriptor = url.pathname.endsWith('.vue') ? parseVue(raw).descriptor : null
    const source = descriptor ? [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n') : raw
    const ast = parseJs(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    files++
    const allNames = new Set()
    for (const node of ast.program.body) if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) if (/^fetchAll|^fetchPublishedFactorVersions$/.test(specifier.imported?.name || '')) allNames.add(specifier.local.name)
    }
    consumers += allNames.size
    walk(ast, node => {
      if (!['ForStatement', 'WhileStatement', 'DoWhileStatement'].includes(node.type)) return
      walk(node, child => {
        if (child.type === 'CallExpression' && allNames.has(child.callee?.name)) violations.push(`${url.pathname}:${child.loc.start.line} ${child.callee.name}`)
      })
    })
  }
  assert.ok(files > 100 && consumers > 10, 'the audit must cover real application sources and import aliases')
  assert.deepEqual(violations, [])
  t.diagnostic(`Audited ${files} source files and ${consumers} fetch-all imports, including aliases`)
})
