import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/department-quality'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], dictionaries = [], queries = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => {
  if (response.url().includes('/meta/departments')) dictionaries.push({ url: response.url(), status: response.status() })
})
page.on('request', request => {
  if (request.url().includes('/analysis/dashboards/') && request.url().endsWith('/query')) queries.push(request.postDataJSON())
})
try {
  const response = await fetch(`${origin}/api/v1/analysis/dashboards`)
  assert.equal(response.status, 200)
  const dashboard = parse(await response.text()).data.find(item => item.name === '质量安全看板真实指标验收')
  assert.ok(dashboard)
  const detailResponse = await fetch(`${origin}/api/v1/analysis/dashboards/${dashboard.id}`)
  assert.equal(detailResponse.status, 200)
  const detail = parse(await detailResponse.text()).data
  const expectedBindings = detail.version.widgets.filter(widget => widget.dataSourceCode).length
  await page.goto(`${origin}/dashboard?id=${dashboard.id}`)
  const root = page.locator('.filter-control').filter({ has: page.locator('input[data-filter-option="22"]') }).first()
  await root.locator('input[data-filter-option="22"]').waitFor({ state: 'attached', timeout: 60000 })
  assert.equal(await root.locator('input[data-filter-option]').count(), 1045)
  assert.match(await root.locator('label').filter({ has: page.locator('input[data-filter-option="22"]') }).textContent(), /泌尿外科/)
  assert.match(await root.locator('label').filter({ has: page.locator('input[data-filter-option="0101"]') }).textContent(), /测试门诊/)
  await page.waitForFunction(expected => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === expected, expectedBindings, { timeout: 60000 })
  await page.waitForFunction(() => !document.querySelector('.el-button.is-loading, .dashboard-schema-viewer .el-loading-mask'), null, { timeout: 60000 })
  const before = queries.length
  await root.locator('summary').click()
  await root.locator('input[data-filter-option="5"]').check()
  await root.locator('input[data-filter-option="22"]').check()
  await page.waitForTimeout(350)
  assert.equal(queries.length, before, 'Draft selections must not individually refresh data')
  assert.deepEqual(await root.locator('input:checked').evaluateAll(inputs => inputs.map(input => input.dataset.filterOption).sort()), ['22', '5'])
  const [updated] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/query') && response.request().postDataJSON()?.filters
      && Object.values(response.request().postDataJSON().filters).some(value => Array.isArray(value) && value.includes('5') && value.includes('22')), { timeout: 120000 }),
    root.getByRole('button', { name: '确定', exact: true }).click()
  ])
  assert.equal(updated.status(), 200)
  await updated.finished()
  await page.waitForFunction(() => !document.querySelector('.el-button.is-loading, .dashboard-schema-viewer .el-loading-mask'), null, { timeout: 60000 })
  await page.waitForFunction(expected => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === expected, expectedBindings, { timeout: 60000 })
  const table = page.locator('[data-testid="binding-widget"]').filter({ hasText: '住院死亡率（质量安全看板）数据明细' })
  await page.waitForFunction(() => {
    const widget = [...document.querySelectorAll('[data-testid="binding-widget"]')].find(item => item.textContent.includes('住院死亡率（质量安全看板）数据明细'))
    const rows = widget?.querySelectorAll('tbody tr')
    return rows?.length === 2 && widget.textContent.includes('产科') && widget.textContent.includes('泌尿外科')
  }, null, { timeout: 60000 })
  assert.deepEqual(errors, [])
  assert.equal(dictionaries.length, 3, 'Twelve widgets and filters share three dictionary pages, not per-code result queries')
  assert.ok(dictionaries.every(item => item.status === 200))
  const checks = { passed: true, readOnly: true, dashboardId: String(dashboard.id), departments: 1045,
    dashboardWidgets: detail.version.widgets.length, readyIndicatorWidgets: expectedBindings,
    leadingZeroPreserved: true, dictionaryRequests: dictionaries, committedFilters: queries.slice(before).map(item => item.filters), filteredTable: await table.innerText(), errors }
  await page.screenshot({ path: `${evidence}/quality-selected.png`, fullPage: true })
  await writeFile(`${evidence}/checks.json`, JSON.stringify(checks, null, 2))
  console.log(JSON.stringify(checks))
} catch (failure) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ text: await page.locator('body').innerText(), errors, dictionaries, queries }, null, 2))
  throw failure
} finally { await browser.close() }
