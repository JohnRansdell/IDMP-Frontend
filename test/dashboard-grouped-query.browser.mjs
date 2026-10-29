import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, folder, check, finish, save } from './comprehensive-client.mjs'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
try {
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  const widget = page.locator('[data-widget-id="dashboard-widget-1791798674947-4"]')
  await widget.getByTestId('binding-widget').waitFor({ timeout: 90000 })
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: '自定义区间', exact: true }).click()
  for (const [id, month] of [['dashboard-period-start', '2026 年 01 月'], ['dashboard-period-end', '2026 年 03 月']]) {
    const element = page.getByTestId(id)
    const input = await element.evaluate(node => node.tagName === 'INPUT') ? element : element.locator('input')
    await input.fill(month); await input.press('Enter'); await input.press('Tab')
  }
  const query = page.waitForResponse(response => response.url().includes('/query') && response.request().method() === 'POST' && response.request().postDataJSON()?.granularity === 'CUSTOM')
  await page.getByTestId('dashboard-period-apply').click()
  await query
  await page.waitForFunction(() => !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'))
  await widget.scrollIntoViewIfNeeded()
  await widget.locator('canvas').first().waitFor()
  const request = page.waitForRequest(request => request.url().includes('/query-drill'))
  await widget.locator('.idmp-chart').evaluate(async node => {
    const url = performance.getEntriesByType('resource').find(entry => /\/echarts\.js\?/.test(entry.name))?.name
    const charts = await import(url)
    const chart = charts.getInstanceByDom(node)
    const data = chart.getModel().getSeriesByIndex(0).getData()
    const index = Array.from({ length: data.count() }, (_, index) => index).find(index => Number(data.getRawDataItem(index).value) > 0)
    if (index == null) throw new Error('没有可用于下钻验收的非零科室')
    chart.trigger('click', { componentType: 'series', seriesType: 'pie', seriesIndex: 0, dataIndex: index, name: data.getName(index), data: data.getRawDataItem(index) })
  })
  const posted = (await request).postDataJSON()
  await widget.getByTestId('backend-chart-drill').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-testid="backend-chart-drill"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 90000 })
  const text = await widget.innerText()
  check('浏览器自定义区间下钻使用新接口并保留周期', posted.context.periodStart === '2026-01-01' && posted.context.periodEnd === '2026-04-01')
  check('真实下钻图表没有加载失败', !text.includes('图表加载失败') && await widget.locator('canvas').count() > 0)
  await widget.screenshot({ path: `${folder}/自定义区间医生下钻.png` })
  await page.goto(`${origin}/dashboard?id=1189225114584501123&edit=1`)
  const editorWidget = page.locator('[data-widget-id="dashboard-widget-1790681712300-4"]')
  await editorWidget.waitFor({ timeout: 90000 })
  await editorWidget.click({ position: { x: 30, y: 20 } })
  await page.getByRole('tab', { name: '数据', exact: true }).click()
  const grouping = page.getByTestId('component-grouping-target')
  await grouping.waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="component-grouping-target"] option')].some(option => option.value === 'BASE'))
  const groupedPreview = page.waitForResponse(response => response.url().includes('/dashboard-query/preview')
    && response.request().postDataJSON()?.widget?.fieldBindings?.dimensions?.length === 3, { timeout: 60000 })
  await grouping.selectOption('BASE')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="binding-chip-dimensions-"]').length === 3)
  check('编辑器一次选中完整三维且不能单独移除', await page.locator('[data-testid^="binding-chip-dimensions-"] button').count() === 0)
  const groupedPayload = await (await groupedPreview).json()
  await save('浏览器完整分组响应', groupedPayload)
  const groupedResult = groupedPayload.data?.responseFormat === 'COLUMNAR' ? expandDashboardResponse(groupedPayload.data).widgets.preview : groupedPayload.data
  check('完整分组预览实际查询三个维度', groupedResult?.status === 'READY' && groupedResult.rows.every(row => Object.hasOwn(row, '主诊断') && Object.hasOwn(row, '主治医生')),
    { status: groupedResult?.status, message: groupedResult?.message })
  const previewStatus = await editorWidget.getByTestId('binding-widget').getAttribute('data-binding-status')
  check('完整分组预览可绘制', previewStatus === 'ready', await editorWidget.innerText())
  await editorWidget.screenshot({ path: `${folder}/完整组合分组图表.png` })
  await page.locator('.binding-inspector').screenshot({ path: `${folder}/完整组合分组配置.png` })
  // Editing is intentionally not saved or published.
  check('浏览器没有未处理异常', errors.length === 0, errors)
} finally {
  await page.screenshot({ path: `${folder}/浏览器最终状态.png` }).catch(() => {})
  await browser.close()
  await finish('完整分组浏览器验收', { persistState: false })
}
