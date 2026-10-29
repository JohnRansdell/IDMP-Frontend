import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTION_GRANTS, PAGE_ACCESS, resolveAccessGrant } from '../src/idmp/auth/accessPolicy.js'
import { toOpaqueId } from '../src/idmp/utils/resourceId.js'
import { resolveIndicatorVersionId, pickLatestVersion } from '../src/idmp/features/indicator/versionModel.js'
import { normalizeSemanticFieldBase } from '../src/idmp/utils/semanticFieldModel.js'
import { policyLabel, buildDifferenceRows } from '../src/idmp/features/mapping/presentation.js'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
async function sources(directory) {
  const files = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(files.map(file => file.isDirectory() ? sources(resolve(directory, file.name))
    : /\.(js|vue)$/.test(file.name) ? [resolve(directory, file.name)] : []))).flat()
}

test('all named button and page grants resolve and unknown grants fail closed', async () => {
  for (const file of await sources(sourceRoot)) {
    if (extname(file) !== '.vue') continue
    const content = await readFile(file, 'utf8')
    for (const [, name] of content.matchAll(/v-access="'([^']+)'"/g)) {
      assert.ok(resolveAccessGrant(name), `${relative(sourceRoot, file)}: ${name}`)
    }
  }
  for (const rule of PAGE_ACCESS) assert.ok(ACTION_GRANTS[rule.action], rule.action)
  assert.equal(resolveAccessGrant('missing.permission'), null)
  assert.equal(resolveAccessGrant('toString'), null)
  assert.equal(resolveAccessGrant(undefined), null)
  assert.deepEqual(resolveAccessGrant(['GET', '/dynamic/id']), ['GET', '/dynamic/id'])
})

test('production modules have no import cycles or dependencies on test fixtures', async () => {
  const files = await sources(sourceRoot), known = new Set(files), graph = new Map()
  for (const file of files) {
    const dependencies = []
    const content = await readFile(file, 'utf8')
    for (const [, specifier] of content.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
      const base = specifier.startsWith('@/') ? resolve(sourceRoot, specifier.slice(2)) : resolve(dirname(file), specifier)
      assert.ok(!relative(sourceRoot, base).startsWith('..'), `${relative(sourceRoot, file)} imports ${specifier}`)
      const target = [base, `${base}.js`, `${base}.vue`, resolve(base, 'index.js')].find(path => known.has(path))
      if (target) dependencies.push(target)
    }
    graph.set(file, dependencies)
  }
  const visited = new Set(), active = new Set(), stack = []
  function visit(file) {
    assert.ok(!active.has(file), `Import cycle: ${[...stack, file].map(path => relative(sourceRoot, path)).join(' -> ')}`)
    if (visited.has(file)) return
    active.add(file); stack.push(file)
    for (const dependency of graph.get(file)) visit(dependency)
    stack.pop(); active.delete(file); visited.add(file)
  }
  for (const file of files) visit(file)
})

test('shared resource contracts preserve opaque IDs, nested versions and sensitivity metadata', () => {
  assert.equal(toOpaqueId('9007199254740993123'), '9007199254740993123')
  assert.equal(toOpaqueId(null), '')
  assert.equal(resolveIndicatorVersionId({ version: { indicatorVersionId: 'nested' } }), 'nested')
  assert.equal(pickLatestVersion([{ id: 'old', versionNo: 1 }, { id: 'new', versionNo: 2 }]).id, 'new')
  const field = normalizeSemanticFieldBase({ fieldId: '9007199254740993123', semanticRole: 'department', sensitivityLevel: 'HIGH' })
  assert.equal(field.id, '9007199254740993123')
  assert.equal(field.semanticKind, 'DEPARTMENT')
  assert.equal(field.sensitive, true)
})

test('mapping pages share policy precedence and preserve their summary/detail rendering', () => {
  assert.equal(policyLabel({ policyFileName: 'legacy', policyReferences: [{ policyFileName: 'versioned' }] }), 'versioned')
  const difference = { hasDifferences: true, definition: { different: true, source: null, target: { name: 'definition' } } }
  const values = { key: 'definition', sourceValue: null, targetValue: { name: 'definition' } }
  assert.deepEqual(buildDifferenceRows(difference), [{ ...values, label: '定义', different: true, source: '-', target: '已返回结构化内容' }])
  assert.deepEqual(buildDifferenceRows(difference, { detailed: true }), [{ ...values, label: '指标定义', different: true, source: '未提供', target: 'definition' }])
})
