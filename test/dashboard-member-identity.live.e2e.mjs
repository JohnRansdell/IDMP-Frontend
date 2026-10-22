import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const widgetId = 'dashboard-widget-1791798674947-4'
const evidence = '.tmp/dashboard-member-identity'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const checks = [], requests = [], pageErrors = []
let latest
page.on('pageerror', error => pageErrors.push(error.message))
page.on('request', request => {
  if (request.url().includes('/api/v1/')) requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() })
})
page.on('response', async response => {
  if (!response.url().includes('/query') || !response.request().postDataJSON()?.widgetCodes?.includes(widgetId)) return
  const payload = parse(await response.text())
  latest = expandDashboardResponse(payload.data || payload).widgets[widgetId]
})
const widget = page.locator(`[data-widget-id="${widgetId}"]`)
async function ready() {
  await page.waitForFunction(id => document.querySelector(`[data-widget-id="${id}"] [data-testid="binding-widget"]`)?.dataset.bindingStatus === 'ready'
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), widgetId, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
}
async function selectType(name) {
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name, exact: true }).click()
}
async function fillDate(id, value) {
  const control = page.getByTestId(id)
  const input = await control.evaluate(element => element.tagName === 'INPUT') ? control : control.locator('input')
  await input.fill(`${value.slice(0, 4)} 年 ${value.slice(5)} 月`)
  await input.press('Enter')
  await input.press('Tab')
}
async function apply() {
  latest = undefined
  await page.getByTestId('dashboard-period-apply').click()
  await page.waitForTimeout(150)
  await ready()
  latest ||= await page.evaluate(id => {
    let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
    while (component && !component.setupState.remoteWidgetDatasets) component = component.parent
    return component.setupState.remoteWidgetDatasets[id]
  }, widgetId)
  assert.equal(latest.status, 'READY', latest.message)
  const keys = latest.rows.map(row => JSON.stringify([row.OUT_DEPT_NAME, row[row.dimensionIdentityFields.OUT_DEPT_NAME]]))
  assert.equal(new Set(keys).size, keys.length, 'preserve each exact published name/code tuple')
  for (const row of latest.rows) {
    assert.ok(row.dimensionIdentityFields.OUT_DEPT_NAME)
    assert.ok(!Object.keys(row.drillContext?.filters || {}).some(field => field.toUpperCase() === 'OUT_DEPT_NAME'))
  }
}
async function drill(code, phase) {
  const chart = widget.locator('.idmp-chart').first()
  await chart.scrollIntoViewIfNeeded()
  const responsePromise = page.waitForResponse(response => response.url().includes('/drill/search'), { timeout: 45000 })
  const point = await chart.evaluate((element, code) => {
    const component = element.__vueParentComponent
    const data = component.props.option.series[0].data
    let index = data.findIndex(item => String(item.dimensionValues?.out_dept_code) === code && item.value > 0)
    if (index < 0) index = data.findIndex(item => String(item.dimensionValues?.out_dept_code) === code)
    if (index < 0) throw new Error(`Missing chart member ${code}`)
    const point = data[index]
    component.emit('chart-click', { name: point.name, dataIndex: index, data: point, seriesIndex: 0 })
    return point
  }, code)
  const response = await responsePromise
  const request = response.request().postDataJSON()
  const payload = parse(await response.text())
  assert.equal(response.status(), 200, payload.message)
  assert.equal(request.parentKeys.OUT_DEPT_CODE, code)
  assert.ok(!Object.keys(request.filters).some(field => field.toUpperCase() === 'OUT_DEPT_NAME'))
  const drillView = widget.getByTestId('backend-chart-drill')
  await page.waitForFunction(id => document.querySelector(`[data-widget-id="${id}"] [data-testid="backend-chart-drill"]`)?.getAttribute('aria-busy') === 'false', widgetId, { timeout: 45000 })
  const records = (payload.data || payload).records
  assert.ok(records.length > 0)
  const zeroNumerators = records.every(row => Number(row.numeratorValue) === 0)
  if (zeroNumerators) assert.match(await drillView.innerText(), /分子均为 0/)
  else assert.ok(await drillView.locator('.idmp-chart').count(), await drillView.innerText())
  await drillView.getByRole('button', { name: '查看数据表', exact: true }).click()
  assert.equal(await drillView.locator('tbody tr').count(), records.length)
  await widget.screenshot({ path: `${evidence}/${phase}-${code}.png` })
  checks.push({ phase, code, label: point.name, request, records: records.length, zeroNumerators })
  await drillView.getByRole('button', { name: '返回原图表', exact: true }).click()
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await ready()
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    await selectType('月度')
    await fillDate('dashboard-period-month', month)
    await apply()
    checks.push({ phase: month, departments: latest.rows.length, east: latest.rows.find(row => String(row.out_dept_code) === '9012') })
    await drill('10', month)
    await drill('9012', month)
  }
  await selectType('自定义区间')
  await fillDate('dashboard-period-start', '2026-01')
  await fillDate('dashboard-period-end', '2026-03')
  await apply()
  const east = latest.rows.filter(row => String(row.out_dept_code) === '9012')
  assert.equal(east.length, 2, 'keep both existing DISTINCT branches; never replace or add their values')
  assert.deepEqual(east.map(row => [row.resultId, row.numeratorValue, row.denominatorValue, row.value]), [
    ['102027642461431997', 0, 2, 0], ['102027642461431998', 2, 161, 0.01242236]
  ])
  assert.ok(east.every(row => row.aggregationMethod === 'EXACT_RESULT'))
  checks.push({ phase: 'custom-Jan-Mar', departments: latest.rows.length, east })
  await widget.scrollIntoViewIfNeeded()
  await widget.screenshot({ path: `${evidence}/quarter-root.png` })
  await drill('10', 'quarter')
  await drill('9012', 'quarter')
  await page.setViewportSize({ width: 390, height: 844 })
  await drill('9012', 'quarter-mobile')
  assert.deepEqual(pageErrors, [])
  console.log(JSON.stringify({ checks, pageErrors }, null, 2))
} finally {
  await writeFile(`${evidence}/results.json`, JSON.stringify({ checks, requests, pageErrors, latest }, null, 2))
  await browser.close()
}
