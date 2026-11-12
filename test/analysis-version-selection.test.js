import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { publishedAnalysisVersions, analysisVersionQuery } from '../src/idmp/features/analysis/indicatorVersions.js'
import { analysisModuleRouteKey } from '../src/idmp/features/analysis/reportPeriod.js'

const versions = [
  { id: 'old', indicatorId: 'surgery', versionNo: 1, publicationStatus: 'PUBLISHED' },
  { id: 'draft', indicatorId: 'surgery', versionNo: 11, publicationStatus: 'DRAFT' },
  { id: 'new', indicatorId: 'surgery', versionNo: 10, status: 'PUBLISHED' },
  { id: 'archived', indicatorId: 'surgery', versionNo: 12, publicationStatus: 'PUBLISHED', status: 'ARCHIVED' },
  { id: 'other', indicatorId: 'mortality', versionNo: 2, publicationStatus: 'PUBLISHED' }
]
const { descriptor } = parse(await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8'))
const { scriptSetupAst } = compileScript(descriptor, { id: 'analysis-version-selection' })
function functions(names) {
  return scriptSetupAst.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
    .map(node => descriptor.scriptSetup.content.slice(node.start, node.end)).join('\n')
}

test('version options contain only this indicator’s available published versions in descending numeric order', () => {
  assert.deepEqual(publishedAnalysisVersions([...versions, versions[0]], 'surgery').map(v => v.id), ['new', 'old'])
  assert.deepEqual(publishedAnalysisVersions(versions, '').map(v => v.id), [])
})

test('version navigation preserves periods but discards previous version filters and result anchors', () => {
  const query = { indicator: 'surgery', indicatorName: '手术死亡率', indicatorVersionId: 'old',
    periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY', summaryGranularity: 'MONTHLY',
    trendStart: '2025-01-01', trendEnd: '2026-01-31', summaryMode: 'INSTANT',
    'filter.OLD_DEPT': ['001'], drillResultId: 'old-result', drillParentKeys: '{"OLD_DEPT":"001"}', drillStartLevel: 'DOCTOR' }
  const next = analysisVersionQuery(query, 'new')
  assert.deepEqual(next, { indicator: 'surgery', indicatorName: '手术死亡率', indicatorVersionId: 'new',
    periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY', summaryGranularity: 'MONTHLY',
    trendStart: '2025-01-01', trendEnd: '2026-01-31' })
  assert.notEqual(analysisModuleRouteKey(next), analysisModuleRouteKey(query))
  assert.equal(query.drillResultId, 'old-result')
})

test('an explicitly bound dashboard version stays selected until the user switches; invalid and duplicate switches do nothing', async () => {
  const calls = []
  const route = { query: { indicator: 'surgery', indicatorVersionId: 'old', 'filter.DEPT': '001' } }
  const run = Function('route', 'router', 'currentIndicatorVersionId', 'analysisVersionOptions', 'analysisVersionQuery',
    `${functions(['switchIndicatorVersion'])}; return switchIndicatorVersion`)(route,
    { push: target => calls.push(target) }, { value: 'old' }, { value: publishedAnalysisVersions(versions, 'surgery') }, analysisVersionQuery)
  assert.equal(calls.length, 0)
  await run('old')
  await run('draft')
  await run('other')
  assert.equal(calls.length, 0)
  await run('new')
  assert.deepEqual(calls, [{ path: '/analysis', query: { indicator: 'surgery', indicatorVersionId: 'new' } }])
})

test('a static version’s mode does not force a different version to remain static', () => {
  assert.deepEqual(analysisVersionQuery({ indicator: 'surgery', granularity: 'STATIC', summaryGranularity: 'STATIC' }, 'new'),
    { indicator: 'surgery', indicatorVersionId: 'new' })
})

test('analysis directory defaults to the latest available published version regardless of response order', () => {
  const merge = Function(`${functions(['mergePublishedAnalysisIndicators', 'getIndicatorDirectoryKey', 'getIndicatorCreatedAt'])}; return mergePublishedAnalysisIndicators`)()
  const result = merge([{ id: 'surgery', name: '手术死亡率', code: 'surgery' }], versions)
  assert.equal(result.length, 1)
  assert.equal(result[0].currentPublishedVersionId, 'new')
})
