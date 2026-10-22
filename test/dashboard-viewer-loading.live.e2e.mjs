import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const dashboardId = '1189225114584501123'
const evidence = '.tmp/dashboard-viewer-loading'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const requests = [], responses = [], bodyReads = [], errors = [], unexpectedWrites = [], checks = []
const isAnalysis = url => /\/analysis\/indicators\/[^/]+\/analysis(?:\?|$)/.test(url)
const isQuery = url => /\/analysis\/dashboards\/[^/]+\/query(?:\?|$)/.test(url)
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (!request.url().includes('/api/v1/')) return
  const url = request.url(), method = request.method()
  requests.push({ url, method, body: request.postDataJSON() })
  if (method !== 'GET' && !(method === 'POST' && /\/(query|preview|filter-options|search)(?:\?|$)/.test(url))) unexpectedWrites.push({ url, method })
})
page.on('response', response => {
  if (!response.url().includes('/api/v1/')) return
  bodyReads.push(response.body().then(body => responses.push({ url: response.url(), status: response.status(), bytes: body.length })).catch(() => {}))
})
await page.addInitScript(() => {
  window.__dashboardLongTasks = []
  new PerformanceObserver(list => window.__dashboardLongTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })))).observe({ type: 'longtask', buffered: true })
})
async function ready() {
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === 11
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), null, { timeout: 90000 })
}
async function noAnalysis() {
  await page.waitForLoadState('networkidle')
  assert.deepEqual(requests.filter(request => isAnalysis(request.url)), [], 'viewing/filtering a dashboard must not load full indicator analysis')
}
try {
  const started = Date.now()
  await page.goto(`${origin}/dashboard?id=${dashboardId}`)
  await page.getByTestId('dashboard-period-type').waitFor({ timeout: 90000 })
  const pickerVisibleMs = Date.now() - started
  const clickStarted = Date.now()
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: '季度', exact: true }).waitFor({ state: 'visible' })
  const pickerClickMs = Date.now() - clickStarted
  await page.keyboard.press('Escape')
  await ready()
  await noAnalysis()
  assert.ok(requests.some(request => /dashboard-data-sources\/[^/]+\/fields/.test(request.url)))
  assert.ok(requests.some(request => /\/meta\/departments/.test(request.url)))
  assert.equal(requests.filter(request => isQuery(request.url)).length, 11)
  const catalogRows = await page.evaluate(() => {
    let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
    while (component && !component.setupState.catalogIndicatorSources) component = component.parent
    return component.setupState.catalogIndicatorSources.reduce((count, source) => count + (source.analysisComparisonRows?.length || 0) + (source.bindingRows?.length || 0), 0)
  })
  assert.equal(catalogRows, 0)
  const longTasks = await page.evaluate(() => window.__dashboardLongTasks)
  assert.ok(Math.max(0, ...longTasks.map(task => task.duration)) < 1500, 'dashboard initialization must not block the main thread for seconds')
  await Promise.all(bodyReads)
  checks.push({ phase: 'initial', pickerVisibleMs, pickerClickMs, queryCount: 11,
    queryBytes: responses.filter(response => isQuery(response.url)).reduce((total, response) => total + response.bytes, 0), catalogRows, longTasks })
  await page.screenshot({ path: `${evidence}/initial-desktop.png`, fullPage: true })

  const filter = page.locator('.filter-control').filter({ has: page.locator('input[data-filter-option="5"]') }).first()
  await filter.locator('input[data-filter-option="5"]').waitFor({ state: 'attached', timeout: 30000 })
  const beforeSelection = requests.filter(request => isQuery(request.url)).length
  await filter.locator('summary').click()
  await filter.locator('input[data-filter-option="5"]').check()
  await filter.locator('input[data-filter-option="22"]').check()
  await page.waitForTimeout(250)
  assert.equal(requests.filter(request => isQuery(request.url)).length, beforeSelection, 'unconfirmed multi-select must not query')
  const filterRequest = page.waitForRequest(request => isQuery(request.url()), { timeout: 30000 })
  await filter.locator('.filter-apply').click()
  await filterRequest
  await page.waitForFunction(() => !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'))
  await noAnalysis()
  const filtered = requests.filter(request => isQuery(request.url)).slice(beforeSelection)
  assert.ok(filtered.length > 0)
  assert.ok(filtered.some(request => Object.values(request.body?.filters || {}).some(values => Array.isArray(values) && values.includes('5') && values.includes('22'))))
  await filter.locator('summary').click()
  assert.equal(await filter.locator('input:checked').count(), 2)
  await filter.locator('summary').press('Escape')
  checks.push({ phase: 'department-filter', queryCount: filtered.length, filters: filtered.map(request => request.body.filters) })
  await page.getByTestId('dashboard-filter-reset').click()
  await ready()

  await page.locator('a[href="/indicator"]').first().click()
  await page.waitForURL('**/indicator')
  await page.goBack()
  await ready()
  await noAnalysis()
  checks.push({ phase: 'keep-alive-return', analysisRequests: 0 })

  const analysisRequest = page.waitForRequest(request => isAnalysis(request.url()), { timeout: 45000 })
  await page.locator('[data-testid="binding-widget"].kpi-presentation.is-clickable').first().click()
  await page.waitForURL('**/analysis?**')
  const onDemand = await analysisRequest
  checks.push({ phase: 'open-analysis', onDemandRequest: onDemand.url() })

  const editor = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const editorAnalysis = [], editorPreviews = []
  editor.on('pageerror', error => errors.push(error.message))
  editor.on('request', request => {
    if (isAnalysis(request.url())) editorAnalysis.push(request.url())
    if (request.url().includes('/widgets/preview')) editorPreviews.push(request.url())
  })
  await editor.goto(`${origin}/dashboard?id=${dashboardId}&edit=1`)
  await editor.getByTestId('dashboard-preview').waitFor({ timeout: 90000 })
  await editor.getByTestId('dashboard-preview').click()
  await editor.waitForFunction(() => document.querySelectorAll('.dashboard-preview-frame [data-testid="binding-widget"][data-binding-status="ready"]').length === 11, null, { timeout: 90000 })
  await editor.waitForLoadState('networkidle')
  assert.deepEqual(editorAnalysis, [])
  checks.push({ phase: 'editor-preview', readyWidgets: 11, analysisRequests: 0, previews: editorPreviews.length })
  await editor.screenshot({ path: `${evidence}/editor-preview.png`, fullPage: true })
  await editor.close()
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedWrites, [])
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ passed: true, readOnly: true, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, readOnly: true, checks, errors }))
} catch (failure) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ error: failure.message, text: await page.locator('body').innerText(), requests, errors, checks }, null, 2))
  throw failure
} finally { await browser.close() }
