import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/dashboard-single-point'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
async function ready() {
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === 11
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), null, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
}
async function period(type) {
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: type === 'MONTHLY' ? '月度' : '自定义区间', exact: true }).click()
  const inputs = type === 'MONTHLY' ? [['dashboard-period-month', '2026 年 01 月']]
    : [['dashboard-period-start', '2026 年 01 月'], ['dashboard-period-end', '2026 年 03 月']]
  for (const [testId, value] of inputs) {
    const input = page.getByTestId(testId).locator('input')
    await input.fill(value)
    await input.press('Enter')
    await input.press('Tab')
  }
  await page.getByTestId('dashboard-period-apply').click()
  await ready()
}
async function snapshot(phase, single) {
  const charts = await page.locator('[data-widget-id] .idmp-chart').evaluateAll(async elements => {
    const url = performance.getEntriesByType('resource').find(entry => /\/echarts\.js\?v=/.test(entry.name))?.name
    const echarts = await import(url)
    return elements.flatMap(element => {
      const instance = echarts.getInstanceByDom(element)
      const option = instance?.getOption()
      if (!option?.series?.some(series => series.type === 'line')) return []
      return [{ id: element.closest('[data-widget-id]').dataset.widgetId, series: option.series.map((series, seriesIndex) => {
        const data = instance.getModel().getSeriesByIndex(seriesIndex).getData()
        return { showSymbol: series.showSymbol, values: series.data, symbols: series.data.map((_, index) => {
          const graphic = data.getItemGraphicEl(index)
          let visiblePaths = 0
          graphic?.traverse(item => { if (item.type === 'path' && !item.ignore && !item.invisible && item.style?.opacity !== 0) visiblePaths++ })
          return { exists: Boolean(graphic), hidden: graphic?.ignore, visiblePaths }
        }) }
      }) }]
    })
  })
  checks.push({ phase, charts })
  assert.equal(charts.length, 3)
  for (const chart of charts) {
    assert.ok(chart.series.some(series => series.values.filter(value => typeof value === 'number' && Number.isFinite(value)).length >= (single ? 1 : 2)))
    for (const series of chart.series) {
      const validIndices = series.values.flatMap((value, index) => typeof value === 'number' && Number.isFinite(value) ? [index] : [])
      assert.equal(series.showSymbol, validIndices.length === 1, JSON.stringify(chart))
      if (single) assert.equal(series.values.length, 1)
      if (validIndices.length === 1) {
        const symbol = series.symbols[validIndices[0]]
        assert.ok(symbol.exists && !symbol.hidden && symbol.visiblePaths > 0,
          `single point must be rendered: ${JSON.stringify(chart)}`)
      }
    }
    await page.locator(`[data-widget-id="${chart.id}"]`).screenshot({ path: `${evidence}/${phase}-${chart.id}.png` })
  }
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await ready()
  await period('MONTHLY')
  await snapshot('single-month', true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await snapshot('mobile-single-month', true)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await period('CUSTOM')
  await snapshot('multi-month', false)
  await period('MONTHLY')
  await snapshot('restored-single-month', true)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, checks: checks.map(({ phase, charts }) => ({ phase, charts: charts.length })), errors }))
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  throw error
} finally {
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
