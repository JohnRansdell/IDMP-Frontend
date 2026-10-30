import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { boundDashboardSource, canNavigateDashboardSource } from '../src/idmp/features/dashboard/boundSource.js'
import { buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

const widget = version => ({ sourceCode: '住院死亡率', sourceName: '住院死亡率', config: { analysisIndicatorVersionId: version } })

test('目录不可用仍可按组件编码、固定版本、周期和科室跳转', () => {
  const source = boundDashboardSource(widget('旧版'))
  assert.equal(canNavigateDashboardSource(source, 'ready'), true)
  const query = buildIndicatorAnalysisRouteQuery(source, { periodStart: '2026-04-01', periodEnd: '2026-04-30',
    periodEndInclusive: true, granularity: 'MONTHLY', filters: { 科室: ['0829'] } })
  assert.equal(query.indicator, '住院死亡率')
  assert.equal(query.indicatorVersionId, '旧版')
  assert.equal(query.periodEnd, '2026-04-30')
  assert.deepEqual(query['filter.科室'], ['0829'])
})

test('同指标不同组件保留各自版本，版本元数据提供真实指标身份', () => {
  for (const version of ['第一版', '第二版']) {
    const source = boundDashboardSource(widget(version), { indicatorId: '123', versionNo: version })
    assert.equal(buildIndicatorAnalysisRouteQuery(source).indicator, '123')
    assert.equal(buildIndicatorAnalysisRouteQuery(source).indicatorVersionId, version)
  }
})

test('未绑定组件和禁用分析的数据源不能导航', () => {
  assert.equal(boundDashboardSource({}), null)
  assert.equal(canNavigateDashboardSource(null, 'ready'), false)
  assert.equal(canNavigateDashboardSource({ ...boundDashboardSource(widget('一')), analysisEnabled: false }, 'ready'), false)
  assert.equal(canNavigateDashboardSource({ ...boundDashboardSource(widget('一')), origin: 'backend' }, 'loading'), false)
})

test('查看和重新激活看板不依赖全量指标目录，编辑仍提供目录', () => {
  const source = readFileSync(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  const load = source.slice(source.indexOf('async function loadRemoteDashboard('), source.indexOf('async function loadRemoteWidgetMetadata('))
  assert.doesNotMatch(load, /loadPublishedIndicatorCatalog/)
  const mounted = source.slice(source.indexOf('onMounted(async () =>'))
  assert.doesNotMatch(mounted, /loadPublishedIndicatorCatalog/)
  assert.match(source, /if \(isEditing.value\) void loadPublishedIndicatorCatalog\(\)/)
})

test('组件跳转解析优先使用固定版本，不被全量目录的新版本覆盖', () => {
  const code = readFileSync(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  const implementation = code.slice(code.indexOf('function getWidgetSource('), code.indexOf('function goWidgetAnalysis('))
  const boundIndicatorSources = ref({ '住院死亡率@旧版': boundDashboardSource(widget('旧版'), { indicatorId: '123' }) })
  const viewerRuntime = { capabilities: { analysisNavigation: true } }
  const { getWidgetSource, canOpenWidgetAnalysis } = Function('boundIndicatorSources', 'boundDashboardSource',
    'getDashboardIndicatorSource', 'visibleDashboardIndicatorSources', 'viewerRuntime', 'canNavigateDashboardSource', 'dashboardStatus',
    `${implementation}; return { getWidgetSource, canOpenWidgetAnalysis }`)(boundIndicatorSources, boundDashboardSource,
    () => { throw new Error('查看组件不得查询全量目录') }, ref([]), viewerRuntime, canNavigateDashboardSource, ref('ready'))
  assert.equal(getWidgetSource(widget('旧版')).analysisIndicatorId, '123')
  assert.equal(getWidgetSource(widget('其他固定版本')).analysisIndicatorVersionId, '其他固定版本')
  assert.equal(canOpenWidgetAnalysis(widget('旧版')), true)
  viewerRuntime.capabilities.analysisNavigation = false
  assert.equal(canOpenWidgetAnalysis(widget('旧版')), false)
})
