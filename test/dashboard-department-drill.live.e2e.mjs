import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/department-drill'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = [], drillCalls = []
let echartsUrl
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (/\/echarts\.js\?/.test(request.url())) echartsUrl = request.url()
  if (request.url().includes('/drill/search')) drillCalls.push(request.postDataJSON())
})
try {
  const checks = []
  for (const viewport of [{ width: 1600, height: 1000, label: 'desktop' }, { width: 390, height: 844, label: 'mobile' }]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  drillCalls.length = 0
  await page.goto(`${origin}/dashboard?id=1189225114584501123`)
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length === 11
    && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), null, { timeout: 90000 })
  const widget = page.locator('[data-testid="binding-widget"]').filter({ hasText: '住院中药费用占药品费用比例（SQL复合因子导入验收1791270897300）构成' })
  const chart = widget.locator('.idmp-chart').first()
  await chart.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  assert.ok(echartsUrl)
  const point = await chart.evaluate(async (element, moduleUrl) => {
    const echarts = await import(moduleUrl)
    const instance = echarts.getInstanceByDom(element)
    if (!instance) throw new Error('Real ECharts instance missing')
    const series = instance.getModel().getSeriesByIndex(0)
    const data = series.getData()
    let index = -1
    for (let i = 0; i < data.count(); i++) {
      if (String(data.getRawDataItem(i)?.dimensionValues?.科室) === '9012') index = i
    }
    if (index < 0) throw new Error('骨科（东院） absent from real chart data')
    const sector = data.getItemGraphicEl(index)
    const layout = sector.shape
    const angle = (layout.startAngle + layout.endAngle) / 2
    const radius = (layout.r0 + layout.r) / 2
    const [x, y] = sector.transformCoordToGlobal(layout.cx + Math.cos(angle) * radius, layout.cy + Math.sin(angle) * radius)
    return { x: x / instance.getWidth(), y: y / instance.getHeight(), name: data.getName(index) }
  }, echartsUrl)
  assert.equal(point.name, '骨科（东院）')
  const bounds = await chart.boundingBox()
  await page.mouse.click(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height)
  const drill = widget.getByTestId('backend-chart-drill')
  await drill.waitFor({ timeout: 30000 })
  await page.waitForFunction(() => {
    const drill = document.querySelector('[data-testid="backend-chart-drill"]')
    return drill?.getAttribute('aria-busy') === 'false' && drill.querySelectorAll('tbody tr').length > 0
  }, null, { timeout: 60000 })
  assert.equal(await drill.locator('.backend-chart-drill__level').innerText(), '主治医生')
  assert.ok((await drill.locator('tbody').innerText()).includes('刘湘'))
  assert.equal(await drill.getByText('暂无图表数据', { exact: true }).count(), 0)
  const query = drillCalls.find(call => call.currentLevel === 'DOCTOR')
  assert.deepEqual(query?.parentKeys, { 科室: '9012' })
  assert.deepEqual(query?.filters, {})
  assert.ok(query.snapshotId)
  const rows = await drill.locator('tbody tr').allTextContents()
  await widget.screenshot({ path: `${evidence}/doctors-${viewport.label}.png` })
  assert.deepEqual(errors, [])
  checks.push({ viewport: viewport.label, passed: true, readOnly: true, clickedCode: '9012', clickedName: point.name, doctorRows: rows, query, errors })
  }
  await writeFile(`${evidence}/checks.json`, JSON.stringify(checks, null, 2))
  console.log(JSON.stringify(checks))
} catch (failure) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ error: failure.message, text: await page.locator('body').innerText(), drillCalls, errors }, null, 2))
  throw failure
} finally { await browser.close() }
