import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/dashboard-drill-indicator-value'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = [], requests = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (request.url().includes('/api/v1/')) requests.push({ url: request.url(), method: request.method() })
})
async function ready() {
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === 11
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), null, { timeout: 90000 })
  await page.waitForLoadState('networkidle')
}
async function snapshot(widget, phase, field) {
  const state = await widget.locator('[data-testid="backend-chart-drill"] .idmp-chart').evaluate(async element => {
    const url = performance.getEntriesByType('resource').find(entry => /\/echarts\.js\?v=/.test(entry.name))?.name
    const echarts = await import(url)
    const instance = echarts.getInstanceByDom(element)
    const data = instance.getOption().series[0].data
    const option = element.__vueParentComponent.props.option
    return { data: data.map(point => ({ name: point.name, value: point.value, row: point.row })),
      tooltip: option.tooltip.formatter({ data: data.find(point => point.value > 0) }) }
  })
  const rowField = { value: 'indicatorValue', numeratorValue: 'numerator', denominatorValue: 'denominator' }[field]
  assert.ok(state.data.length > 0)
  assert.ok(state.data.some(point => point.value > 0))
  for (const point of state.data) assert.equal(point.value, Number(point.row[rowField]))
  if (field === 'value') assert.ok(state.data.some(point => point.value > 0 && point.value !== Number(point.row.numerator)), 'real results must distinguish indicator values from numerators')
  assert.match(state.tooltip, /指标值：/)
  assert.match(state.tooltip, /分子：/)
  assert.match(state.tooltip, /分母：/)
  checks.push({ phase, field, ...state })
  await widget.screenshot({ path: `${evidence}/${phase}.png` })
}
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await ready()
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: '月度', exact: true }).click()
  const input = page.getByTestId('dashboard-period-month').locator('input')
  await input.fill('2026 年 01 月')
  await input.press('Enter')
  await input.press('Tab')
  await page.getByTestId('dashboard-period-apply').click()
  await ready()
  for (const [id, code, name] of [
    ['dashboard-widget-1791798674947-4', '10', 'transfer'],
    ['dashboard-widget-1791875881995-2', '9012', 'tcm']
  ]) {
    for (const [field, label, viewport, width, height] of [
      ['value', '指标值', 'desktop', 1600, 1000], ['value', '指标值', 'mobile', 390, 844],
      ['numeratorValue', '分子值', 'desktop', 1600, 1000], ['denominatorValue', '分母值', 'desktop', 1600, 1000]
    ]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(400)
      // Exercise unsaved bindings against real result rows without changing the published dashboard.
      await page.evaluate(({ id, field, label }) => {
        let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
        while (component && !component.setupState.dashboardSchema) component = component.parent
        const state = component.setupState
        state.dashboardSchema = { ...state.dashboardSchema, widgets: state.dashboardSchema.widgets.map(widget => widget.id !== id ? widget : {
          ...widget, config: { ...widget.config, dataBinding: { ...widget.config.dataBinding, measures: [{ ...widget.config.dataBinding.measures[0], field, label }] } }
        }) }
      }, { id, field, label })
      const widget = page.locator(`[data-widget-id="${id}"]`)
      await widget.scrollIntoViewIfNeeded()
      const original = await widget.locator('.idmp-chart').first().evaluate((element, code) => {
        const component = element.__vueParentComponent
        const data = component.props.option.series[0].data
        let index = data.findIndex(point => point.value > 0 && Object.values(point.dimensionValues || {}).map(String).includes(code))
        if (index < 0) index = data.findIndex(point => point.value > 0)
        if (index < 0) throw new Error('No positive department result to verify')
        const point = data[index]
        component.emit('chart-click', { name: point.name, data: point, dataIndex: index, seriesIndex: 0 })
        return data.map(({ name, value }) => ({ name, value }))
      }, code)
      await page.waitForFunction(id => document.querySelector(`[data-widget-id="${id}"] [data-testid="backend-chart-drill"]`)?.getAttribute('aria-busy') === 'false', id, { timeout: 60000 })
      await page.waitForLoadState('networkidle')
      await snapshot(widget, `${name}-${field}-${viewport}`, field)
      assert.match(await widget.locator('.backend-chart-drill__level').innerText(), new RegExp(label))
      const drill = widget.getByTestId('backend-chart-drill')
      await drill.getByRole('button', { name: '查看数据表', exact: true }).click()
      await drill.locator('tbody tr').first().waitFor()
      assert.match(await drill.locator('thead').innerText(), /分子.*分母.*指标值/)
      await drill.getByRole('button', { name: '返回原图表', exact: true }).click()
      const restored = await widget.locator('.idmp-chart').first().evaluate(element => element.__vueParentComponent.props.option.series[0].data.map(({ name, value }) => ({ name, value })))
      assert.deepEqual(restored, original)
    }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(requests.filter(request => request.method !== 'GET' && !/\/(query|search)$/.test(request.url)), [])
  console.log(JSON.stringify({ passed: true, checks: checks.map(({ phase, data }) => ({ phase, rows: data.length })), errors }))
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  throw error
} finally {
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ checks, errors, requests }, null, 2))
  await browser.close()
}
