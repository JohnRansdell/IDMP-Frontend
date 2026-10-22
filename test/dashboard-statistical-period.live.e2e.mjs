import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5178'
const evidence = '.tmp/dashboard-period'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = [], calls = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (/\/analysis\/dashboards\/[^/]+\/query/.test(request.url())) calls.push(request.postDataJSON())
})

async function waitForDashboard() {
  await page.getByTestId('dashboard-period-type').waitFor({ timeout: 90000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="dashboard-period-apply"].is-loading') && document.querySelectorAll('[data-testid="binding-widget"]').length > 0, null, { timeout: 90000 })
}
async function chooseType(label) {
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: label, exact: true }).click()
}
async function dateInput(testId, value) {
  const target = page.getByTestId(testId)
  const input = await target.evaluate(element => element.tagName === 'INPUT') ? target : target.locator('input')
  const displayed = /^\d{4}-\d{2}$/.test(value) ? `${value.slice(0, 4)} 年 ${value.slice(5)} 月` : value
  await input.fill(displayed)
  await input.press('Enter')
  await input.press('Tab')
  if (/^\d{4}-\d{2}$/.test(value)) assert.equal(await input.inputValue(), displayed)
}
async function apply() {
  calls.length = 0
  await page.getByTestId('dashboard-period-apply').click()
  await waitForDashboard()
  assert.deepEqual(errors, [])
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await waitForDashboard()
  assert.ok(calls.length > 0)
  assert.ok(calls.every(call => call.granularity === 'MONTHLY'))
  checks.push({ selection: 'default', requests: [...calls], ready: await page.locator('[data-binding-status="ready"]').count(), label: await page.getByTestId('dashboard-period-current').innerText() })
  console.log('Default monthly dashboard loaded')
  await page.screenshot({ path: `${evidence}/monthly-desktop.png` })

  await chooseType('季度')
  await dateInput('dashboard-period-year', '2026')
  await page.getByTestId('dashboard-period-quarter').click()
  await page.getByRole('option', { name: '第 2 季度', exact: true }).click()
  await apply()
  const quarterly = calls.filter(call => call.granularity === 'QUARTERLY')
  assert.ok(quarterly.length > 0)
  assert.ok(quarterly.every(call => call.periodStart === '2026-04-01' && call.periodEnd === '2026-07-01'))
  assert.match(await page.getByTestId('dashboard-period-current').innerText(), /2026年第2季度/)
  for (const text of await page.locator('.kpi-presentation__period').allTextContents()) assert.equal(text, '2026年第2季度')
  checks.push({ selection: 'quarterly', requests: [...calls], ready: await page.locator('[data-binding-status="ready"]').count(), missingExactPeriod: await page.getByText('该统计周期暂无完整结果', { exact: true }).count() })
  console.log('Quarterly period verified')
  await page.screenshot({ path: `${evidence}/quarterly-desktop.png` })

  await chooseType('年度')
  await dateInput('dashboard-period-year', '2026')
  await apply()
  assert.ok(calls.some(call => call.granularity === 'YEARLY' && call.periodStart === '2026-01-01' && call.periodEnd === '2027-01-01'))
  for (const text of await page.locator('.kpi-presentation__comparisons').allTextContents()) assert.ok(!text.includes('环比'))
  checks.push({ selection: 'yearly', requests: [...calls], ready: await page.locator('[data-binding-status="ready"]').count() })
  console.log('Yearly period verified')

  await chooseType('自定义区间')
  await page.getByTestId('dashboard-period-start').locator('input').click()
  await page.locator('.el-month-table:visible').waitFor()
  assert.equal(await page.locator('.el-date-table:visible').count(), 0)
  await dateInput('dashboard-period-start', '2026-03')
  await dateInput('dashboard-period-end', '2026-05')
  await apply()
  assert.match(await page.getByTestId('dashboard-period-current').innerText(), /2026-03 ~ 2026-05/)
  assert.ok(calls.length > 0)
  assert.ok(calls.every(call => call.periodStart >= '2026-03-01' && call.periodEnd <= '2026-06-01'))
  assert.ok(calls.some(call => call.periodStart === '2026-03-01'))
  assert.ok(calls.some(call => call.periodEnd === '2026-06-01'))
  assert.equal(await page.locator('.kpi-presentation__period').count(), 0)
  assert.ok(await page.getByText('该区间暂不支持整体结果查询', { exact: true }).count() > 0)
  checks.push({ selection: 'custom', requests: [...calls], missingExactPeriod: await page.getByText('该区间暂不支持整体结果查询', { exact: true }).count() })
  console.log('Custom period verified')
  await page.screenshot({ path: `${evidence}/custom-desktop.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${evidence}/custom-mobile.png` })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)
  assert.equal(overflow, false)
  assert.ok(await page.getByTestId('dashboard-period-type').isVisible())

  await chooseType('月度')
  await dateInput('dashboard-period-month', '2026-03')
  await apply()
  assert.ok(calls.every(call => call.granularity === 'MONTHLY' && call.periodStart === '2026-03-01' && call.periodEnd === '2026-04-01'))
  assert.ok(await page.locator('[data-binding-status="ready"]').count() > 0)
  checks.push({ selection: 'monthly-mobile', requests: [...calls], ready: await page.locator('[data-binding-status="ready"]').count(), readOnly: true })
  await page.screenshot({ path: `${evidence}/monthly-mobile.png` })
  assert.deepEqual(errors, [])
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  console.log(JSON.stringify({ checks, errors }))
} catch (failure) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ error: failure.message, text: await page.locator('body').innerText(), calls, errors }, null, 2))
  throw failure
} finally { await browser.close() }
