import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/dashboard-warning-query'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const requests = [], responses = [], bodyReads = [], errors = [], checks = []
const isQuery = url => /\/analysis\/dashboards\/[^/]+\/query(?:\?|$)/.test(url)
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (!request.url().includes('/api/v1/')) return
  requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() })
})
page.on('response', response => {
  if (!isQuery(response.url())) return
  bodyReads.push(response.text().then(body => responses.push({ url: response.url(), status: response.status(), body })).catch(() => {}))
})
async function ready(phase) {
  await page.waitForFunction(() => {
    let component = document.querySelector('.dashboard-period-picker')?.__vueParentComponent
    while (component && !component.setupState.warningWidgetRuntime) component = component.parent
    const state = component?.setupState
    const warnings = state?.dashboardSchema?.widgets?.filter(widget => widget.type === 'warnings') || []
    return state?.dashboardStatus === 'ready' && !state.remoteQueryLoading && warnings.length > 0
      && warnings.every(widget => state.warningWidgetRuntime[widget.id]?.status === 'ready')
  }, null, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
  const state = await page.evaluate(() => {
    let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
    while (component && !component.setupState.warningWidgetRuntime) component = component.parent
    const state = component.setupState
    return { widgets: state.dashboardSchema.widgets.map(({ id, type }) => ({ id, type })),
      warningRuntime: state.warningWidgetRuntime, indicatorResults: Object.keys(state.dashboardQueryResult?.widgets || {}),
      datasetIds: Object.keys(state.remoteWidgetDatasets || {}),
      readyMetrics: document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length }
  })
  const excluded = new Set(state.widgets.filter(widget => ['warnings', 'text'].includes(widget.type)).map(widget => String(widget.id)))
  const queries = requests.filter(request => isQuery(request.url))
  assert.ok(queries.length > 0)
  for (const request of queries) {
    assert.ok(request.body.widgetCodes?.length, 'requests must explicitly select indicator widgets')
    assert.ok(request.body.widgetCodes.every(id => !excluded.has(String(id))), 'non-indicator widgets must never be queried')
  }
  assert.ok(state.indicatorResults.every(id => !excluded.has(id)))
  assert.ok(state.datasetIds.every(id => !excluded.has(id)))
  assert.ok(requests.some(request => /\/analysis\/warnings\?/.test(request.url)), 'warnings must use their separate endpoint')
  assert.ok(state.readyMetrics > 0)
  for (const widget of state.widgets.filter(widget => widget.type === 'warnings')) {
    const runtime = state.warningRuntime[widget.id]
    if (runtime.records.length) {
      await page.locator(`[data-widget-id="${widget.id}"]`).getByText(runtime.records[0].name || runtime.records[0].text, { exact: true }).first().waitFor()
    }
  }
  checks.push({ phase, queryCount: queries.length, ...state })
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await ready('initial')
  const before = requests.filter(request => isQuery(request.url)).length
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: '月度', exact: true }).click()
  const input = page.getByTestId('dashboard-period-month').locator('input')
  await input.fill('2026 年 01 月')
  await input.press('Enter')
  await input.press('Tab')
  await Promise.all([
    page.waitForRequest(request => isQuery(request.url())),
    page.getByTestId('dashboard-period-apply').click()
  ])
  await ready('period-refresh')
  assert.ok(requests.filter(request => isQuery(request.url)).length > before)
  await Promise.all(bodyReads)
  assert.ok(responses.every(response => response.status === 200 && !response.body.includes('组件必须指定数据源或指标版本')))
  assert.deepEqual(errors, [])
  assert.deepEqual(requests.filter(request => request.method !== 'GET' && !isQuery(request.url)), [], 'test must not modify saved data')
  await page.screenshot({ path: `${evidence}/dashboard.png`, fullPage: true })
  console.log(JSON.stringify({ passed: true, checks: checks.map(({ phase, queryCount, readyMetrics, warningRuntime }) => ({ phase, queryCount, readyMetrics, warnings: Object.entries(warningRuntime).map(([id, state]) => ({ id, status: state.status, records: state.records.length })) })) }))
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  await writeFile(`${evidence}/failure.txt`, `${error.stack}\n${await page.locator('body').innerText()}`)
  throw error
} finally {
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ checks, requests, errors }, null, 2))
  await browser.close()
}
