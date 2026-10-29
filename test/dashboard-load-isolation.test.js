import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { readDashboardPart, failedDashboardWidget } from '../src/idmp/features/dashboard/loadIsolation.js'
import { createPlatformDashboardRuntime } from '../src/idmp/features/dashboard/viewerRuntime.js'
import { normalizeIndicatorBindings } from '../src/idmp/features/dashboard/multiIndicator.js'
import { isDashboardIndicatorQueryWidget, resolveDashboardQueryState } from '../src/idmp/features/dashboard/remoteQuery.js'
import { widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'

const source = readFileSync(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
const compile = (start, end, name, deps) => Function(...Object.keys(deps), `${between(start, end)}; return ${name}`)(...Object.values(deps))
const widget = (id, version = '一') => ({ id, type: 'chart', sourceCode: '住院死亡率', config: { analysisIndicatorVersionId: version } })
const fields = [{ code: 'value', role: 'MEASURE', name: '指标值', dataType: 'NUMBER' }]
const reason = '下钻层级缺少字段编码，请完善路径配置'

function metadataHarness(metadata, extra = {}) {
  const state = {
    remoteWidgetMetadataErrors: ref({}), remoteFieldCatalog: ref({}), remoteVersionFieldCatalog: ref({}),
    viewerRuntime: { restricted: false, metadata }, dashboardIndicatorVersion: async () => null,
    annotateDepartmentFilterFields: value => value, metricGroupSourceCodes: () => [],
    normalizeIndicatorBindings, isDashboardIndicatorQueryWidget, readDashboardPart, ...extra
  }
  return { state, load: compile('async function loadRemoteWidgetMetadata(', 'function remoteWidgetFields(', 'loadRemoteWidgetMetadata', state) }
}

test('同指标坏版本不影响好版本，重复绑定共用请求，重试清除旧错误', async () => {
  let broken = true
  const calls = []
  const { state, load } = metadataHarness(async (code, item) => {
    calls.push(item.config.analysisIndicatorVersionId)
    if (broken && item.config.analysisIndicatorVersionId === '一') throw Object.assign(new Error(reason), { status: 409 })
    return { fields, periods: [{ periodStart: '2026-01-01' }] }
  })
  const schema = { widgets: [widget('科室对比'), widget('科室构成'), widget('新版趋势', '二')] }
  const result = await load(schema)
  assert.deepEqual(calls.sort(), ['一', '二'].sort())
  assert.deepEqual(state.remoteWidgetMetadataErrors.value, { 科室对比: reason, 科室构成: reason })
  assert.ok(result.length)
  assert.deepEqual(state.remoteVersionFieldCatalog.value['住院死亡率@二'], fields)
  assert.equal(state.remoteVersionFieldCatalog.value['住院死亡率@一'], undefined)
  broken = false
  await load(schema)
  assert.deepEqual(state.remoteWidgetMetadataErrors.value, {})
  assert.deepEqual(state.remoteVersionFieldCatalog.value['住院死亡率@一'], fields)
})

test('多指标及指标组的元数据失败只归属对应组件，文本和预警不受影响', async () => {
  const { state, load } = metadataHarness(async code => {
    if (code === '手术死亡率') throw new Error(reason)
    return { fields, periods: [] }
  }, { metricGroupSourceCodes: item => item.id === '指标组' ? ['手术死亡率'] : [] })
  await load({ widgets: [widget('正常组件'), { ...widget('多指标'), config: { indicatorBindings: [{ sourceCode: '手术死亡率' }] } },
    { id: '指标组', type: 'metric-group', config: {} }, { id: '说明', type: 'text' }, { id: '预警', type: 'warnings' }] })
  assert.deepEqual(state.remoteWidgetMetadataErrors.value, { 多指标: reason, 指标组: reason })
})

test('受限看板按组件隔离元数据，不混用相同数据源的权限上下文', async () => {
  const calls = []
  const { state, load } = metadataHarness(null, { viewerRuntime: { restricted: true, metadata: async (_, item) => {
    calls.push(item.id)
    if (item.id === '无权限') throw Object.assign(new Error('当前账号没有权限执行此操作。'), { status: 403 })
    return { fields, periods: [] }
  } } })
  await load({ widgets: [widget('无权限'), widget('有权限')] })
  assert.equal(calls.length, 2)
  assert.deepEqual(Object.keys(state.remoteWidgetMetadataErrors.value), ['无权限'])
})

test('切换看板后旧元数据不写回；取消请求不伪装成组件错误', async () => {
  const { state, load } = metadataHarness(async () => ({ fields, periods: [] }))
  await load({ widgets: [widget('旧组件')] }, undefined, () => false)
  assert.deepEqual(state.remoteFieldCatalog.value, {})
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(load({ widgets: [widget('旧组件')] }, controller.signal), { name: 'AbortError' })
  await assert.rejects(readDashboardPart(async () => { throw new DOMException('取消', 'AbortError') }), { name: 'AbortError' })
})

test('平台字段请求使用组件固定指标版本，不误读当前版本', async () => {
  const calls = []
  const runtime = createPlatformDashboardRuntime({ fetchFields: async (code, options) => { calls.push(options); return fields }, fetchPeriods: async () => [] })
  const controller = new AbortController()
  await runtime.metadata('住院死亡率', widget('图表', '二'), { signal: controller.signal })
  assert.equal(calls[0].indicatorVersionId, '二')
  assert.equal(calls[0].signal, controller.signal)
})

function queryHarness(extra = {}) {
  const deps = {
    uniqueDashboardQueryWidgets: schema => schema.widgets, mapWithConcurrency: (items, _, run) => Promise.all(items.map(run)),
    readDashboardPart, failedDashboardWidget, remoteWidgetMetadataErrors: ref({}),
    dashboardWidgetResultShape: item => item.id === '趋势' ? 'TREND' : 'OVERVIEW',
    remoteSelectedPeriod: () => ({}), viewerRuntime: { capabilities: {} },
    buildRemoteWidgetQuery: item => ({ query: { granularity: 'MONTHLY', widgetCodes: [item.id], filters: {}, periodStart: '2026-01-01', periodEnd: '2026-03-01' } }),
    remoteWidgetQueryContext: () => ({}), monthsBetween: () => ['2026-01', '2026-02'],
    queryDashboardTrendMonths: async () => { throw new Error('趋势查询超时，请稍后重试。') },
    queryRemoteDashboardCached: async (_, query) => {
      if (query.widgetCodes[0] === '失败') throw new Error(reason)
      return { widgets: { [query.widgetCodes[0]]: { status: 'READY', rows: [{ value: 0.25 }] } } }
    }, ...extra
  }
  return compile('async function queryRemoteDashboardByPeriod(', 'const remoteDashboardQueryCache =', 'queryRemoteDashboardByPeriod', deps)
}

test('单组件HTTP异常、趋势异常及元数据错误不会阻断其他图表', async () => {
  const query = queryHarness({ remoteWidgetMetadataErrors: ref({ 配置失败: reason }) })
  const result = await query({ widgets: ['失败', '正常', '趋势', '配置失败'].map(id => widget(id)) })
  assert.equal(result.widgets.正常.status, 'READY')
  assert.equal(result.widgets.正常.rows[0].value, 0.25)
  assert.equal(result.widgets.失败.message, reason)
  assert.equal(result.widgets.配置失败.message, reason)
  assert.equal(result.widgets.趋势.status, 'ERROR')
  assert.equal(resolveDashboardQueryState(result, 4).status, 'ready')
})

test('所有组件失败仍保留看板布局和逐组件错误，而非整页错误或暂无数据', async () => {
  const result = await queryHarness()({ widgets: [widget('失败'), widget('趋势')] })
  assert.ok(Object.values(result.widgets).every(item => item.status === 'ERROR' && item.message && !item.rows.length))
  assert.equal(resolveDashboardQueryState(result, 2).status, 'ready')
})

test('数据归一化异常不影响其他组件，失败原因不会被后续名称解析覆盖', async () => {
  const deps = { isDashboardIndicatorQueryWidget, mapWithConcurrency: (items, _, run) => Promise.all(items.map(run)), readDashboardPart, failedDashboardWidget,
    widgetResultToDataset, dashboardWidgetResult: (result, _, item) => result.widgets[item.id], remoteWidgetFields: () => fields,
    remoteSelectedPeriod: () => ({}), buildRemoteWidgetQuery: () => ({ query: {} }), remoteWidgetQueryContext: () => ({}),
    normalizeDashboardWidgetDataset: async (item, dataset) => {
      assert.notEqual(item.id, '配置失败')
      if (item.id === '转换失败') throw new Error('图表数据格式不正确')
      return dataset
    } }
  const hydrate = compile('async function buildDashboardWidgetDatasets(', 'async function refreshRemoteDashboardData(', 'buildDashboardWidgetDatasets', deps)
  const schema = { widgets: ['正常', '配置失败', '转换失败'].map(id => widget(id)) }
  const result = await hydrate(schema, { widgets: { 正常: { status: 'READY', rows: [{ value: 0.25 }] }, 配置失败: failedDashboardWidget(reason), 转换失败: { status: 'READY', rows: [] } } })
  assert.equal(result.正常.rows[0].value, 0.25)
  assert.equal(result.配置失败.message, reason)
  assert.equal(result.转换失败.status, 'ERROR')
})
