import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isDashboardIndicatorQueryWidget, resolveDashboardQueryState } from '../src/idmp/features/dashboard/remoteQuery.js'
import { normalizeIndicatorBindings } from '../src/idmp/features/dashboard/multiIndicator.js'
import { dashboardWidgetResultShape } from '../src/idmp/features/dashboard/periodFields.js'

const dashboard = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
const between = (start, end) => dashboard.slice(dashboard.indexOf(start), dashboard.indexOf(end, dashboard.indexOf(start)))
const selectWidgets = Function('isDashboardIndicatorQueryWidget', 'normalizeIndicatorBindings', 'dashboardWidgetResultShape',
  `${between('function dashboardWidgetQuerySignature(', 'function dashboardWidgetResult(')}; return uniqueDashboardQueryWidgets`
)(isDashboardIndicatorQueryWidget, normalizeIndicatorBindings, dashboardWidgetResultShape)

const metric = { id: 'metric', type: 'kpi', sourceCode: 'indicator-a', config: {} }
const warning = { id: 'warning', type: 'warnings', config: {} }
const staleWarning = { ...warning, id: 'stale-warning', sourceCode: 'indicator-a', config: {
  analysisIndicatorVersionId: '123', indicatorBindings: [{ sourceCode: 'indicator-a' }, { sourceCode: 'indicator-b' }]
} }

test('metric query selection excludes warning and text widgets regardless of stale indicator bindings', () => {
  const chart = { ...metric, id: 'chart', type: 'chart', chartKind: 'pie', config: { dataBinding: { dimensions: [{ field: 'dept' }] } } }
  const duplicate = { ...metric, id: 'duplicate' }
  const multi = { ...metric, id: 'multi', config: staleWarning.config }
  assert.deepEqual(selectWidgets({ widgets: [warning, staleWarning, metric, chart, duplicate, multi, { id: 'text', type: 'text' }] }).map(widget => widget.id),
    ['metric', 'chart', 'multi'])
  assert.deepEqual(selectWidgets({ widgets: [warning, staleWarning] }), [])
  assert.deepEqual(selectWidgets({}), [])
  assert.equal(isDashboardIndicatorQueryWidget({ ...metric, sourceCode: '' }), true, 'invalid metric configurations must still report their errors')
})

test('warning-only dashboards make no indicator requests and remain ready to load warnings', async () => {
  const dependencies = { uniqueDashboardQueryWidgets: selectWidgets,
    mapWithConcurrency: (items, limit, worker) => Promise.all(items.map(worker)) }
  const query = Function(...Object.keys(dependencies),
    `${between('async function queryRemoteDashboardByPeriod(', 'const remoteDashboardQueryCache =')}; return queryRemoteDashboardByPeriod`
  )(...Object.values(dependencies))
  const schema = { widgets: [warning, staleWarning] }
  const result = await query(schema, new AbortController().signal, 'dashboard')
  assert.deepEqual(result.widgets, {})
  assert.deepEqual(resolveDashboardQueryState(result, schema.widgets.filter(isDashboardIndicatorQueryWidget).length), { status: 'empty', message: '' })
  const states = dashboard.match(/resolveDashboardQueryState\(result, schema\.widgets\.filter\(isDashboardIndicatorQueryWidget\)\.length\)/g)
  assert.equal(states?.length, 2, 'initial load and period refresh must both count indicator widgets only')
})

test('warning widgets never enter dataset hydration or individual editor previews', async () => {
  const preview = Function('isDashboardIndicatorQueryWidget',
    `${between('async function previewRemoteWidget(', '\nasync function ')}; return previewRemoteWidget`
  )(isDashboardIndicatorQueryWidget)
  await preview(staleWarning)
  const dependencies = { isDashboardIndicatorQueryWidget,
    mapWithConcurrency: (items, limit, worker) => Promise.all(items.map(worker)) }
  const hydrate = Function(...Object.keys(dependencies),
    `${between('async function buildDashboardWidgetDatasets(', 'async function refreshRemoteDashboardData(')}; return buildDashboardWidgetDatasets`
  )(...Object.values(dependencies))
  assert.deepEqual(await hydrate({ widgets: [warning, staleWarning] }, { widgets: {} }), {})
})
