import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const directory = '.tmp/dashboard-chart-resize'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const id = 'dashboard-widget-1791798674947-4'
const widget = page.locator(`[data-widget-id="${id}"]`)
const checks = [], errors = []
page.on('pageerror', error => errors.push(error.message))
async function snapshot(phase) {
  const state = await widget.locator('.idmp-chart').evaluate(async element => {
    const url = performance.getEntriesByType('resource').find(entry => /\/echarts\.js\?v=/.test(entry.name))?.name
    if (!url) throw new Error('Missing application ECharts module')
    const echarts = await import(url)
    const instance = echarts.getInstanceByDom(element)
    const option = instance.getOption()
    return { width: element.clientWidth, height: element.clientHeight, legend: option.legend?.[0]?.show,
      labels: option.series.map(series => series.label?.show), lines: option.series.map(series => series.labelLine?.show),
      categories: option.series[0].data.map(point => point.name),
      visibleTexts: instance.getZr().storage.getDisplayList().filter(item => item.type === 'tspan' && !item.ignore && !item.invisible).map(item => item.style.text) }
  })
  checks.push({ phase, ...state })
  return state
}
async function toggle(expanded) {
  const button = widget.getByRole('button', { name: '查看数据表', exact: true })
  await button.click()
  assert.equal(await button.getAttribute('aria-expanded'), String(expanded))
  await page.waitForTimeout(300)
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await page.waitForFunction(id => document.querySelector(`[data-widget-id="${id}"] [data-testid="binding-widget"]`)?.dataset.bindingStatus === 'ready', id, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: '自定义区间', exact: true }).click()
  for (const [testId, value] of [['dashboard-period-start', '2026 年 01 月'], ['dashboard-period-end', '2026 年 03 月']]) {
    const control = page.getByTestId(testId)
    const input = await control.evaluate(el => el.tagName === 'INPUT') ? control : control.locator('input')
    await input.fill(value)
    await input.press('Enter')
    await input.press('Tab')
  }
  await page.getByTestId('dashboard-period-apply').click()
  await page.waitForFunction(id => document.querySelector(`[data-widget-id="${id}"] [data-testid="binding-widget"]`)?.dataset.bindingStatus === 'ready'
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), id, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
  await widget.scrollIntoViewIfNeeded()
  const initial = await snapshot('initial')
  assert.ok(initial.height > 220)
  assert.notEqual(initial.labels[0], false)
  for (let cycle = 0; cycle < 3; cycle++) {
    await toggle(true)
    const compact = await snapshot(`expanded-${cycle}`)
    assert.ok(compact.height <= 220, JSON.stringify(compact))
    await toggle(false)
    const restored = await snapshot(`collapsed-${cycle}`)
    await widget.screenshot({ path: `${directory}/desktop-${cycle}.png` })
    assert.deepEqual(restored.categories, initial.categories)
    assert.equal(restored.height, initial.height)
    assert.equal(restored.legend, initial.legend)
    assert.equal(restored.labels[0], initial.labels[0])
    assert.ok(restored.visibleTexts.length > 5)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const mobile = await snapshot('mobile')
  await toggle(true)
  await snapshot('mobile-expanded')
  await toggle(false)
  const mobileRestored = await snapshot('mobile-collapsed')
  assert.equal(mobileRestored.legend, mobile.legend)
  assert.equal(mobileRestored.labels[0], mobile.labels[0])
  assert.deepEqual(mobileRestored.categories, mobile.categories)
  await widget.screenshot({ path: `${directory}/mobile.png` })
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.waitForTimeout(400)
  const desktopRestored = await snapshot('desktop-restored')
  assert.equal(desktopRestored.legend, initial.legend)
  assert.equal(desktopRestored.labels[0], initial.labels[0])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, checks: checks.map(({ phase, width, height, legend, labels, visibleTexts }) =>
    ({ phase, width, height, legend, labels, visibleTextCount: visibleTexts.length })), errors }))
} finally {
  await writeFile(`${directory}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
