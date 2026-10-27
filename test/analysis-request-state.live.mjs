import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, folder, save } from './comprehensive-client.mjs'

const playwrightPackage = process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'
const { chromium } = createRequire(playwrightPackage)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const evidence = [], requests = [], errors = [], gates = [], cancelled = []
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
page.on('requestfailed', request => { if (request.failure()?.errorText?.includes('ABORTED')) cancelled.push(request.url()) })
page.on('request', request => { if (request.url().includes('/api/v1/')) requests.push(new URL(request.url()).pathname + new URL(request.url()).search) })
const isTrend = url => url.pathname.endsWith('/analysis') && url.searchParams.getAll('sections').join(',') === 'TREND'
const state = () => page.locator('.indicator-analysis').evaluate(node => {
  const s = node.__vueParentComponent.setupState
  return { metric: s.primaryMetric, report: s.currentReportOverview, trend: s.trendBackendAnalysis,
    period: s.analysisPeriodRange, trendError: s.trendErrorMessage, rankPeriod: s.rankSelectedPeriod,
    rankRows: s.rankTableData, rankError: s.rankErrorMessage, version: s.currentIndicatorVersionId }
})
const ready = () => page.waitForFunction(() => {
  const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
  return s && !s.analysisLoading && !s.rangeSummaryLoading && !s.trendLoading && !s.indicatorOptionsLoading
    && Object.keys(s.departmentNamesByCode || {}).length > 0
}, null, { timeout: 90000 })
async function applyMonth(month) {
  await page.locator('.indicator-analysis').evaluate((node, value) => { node.__vueParentComponent.setupState.trendMonthRange = [value, value] }, month)
  await page.locator('.trend-controls').getByRole('button', { name: '应用', exact: true }).click()
}
function delayTrend(month) {
  let release, intercepted
  const gate = new Promise(resolve => { release = resolve })
  const entered = new Promise(resolve => { intercepted = resolve })
  const hold = { month, gate, release, entered, intercepted, used: false }
  gates.push(hold)
  return hold
}
let failMonth = ''
await page.route('**/api/v1/analysis/indicators/*/analysis?*', async route => {
  const url = new URL(route.request().url())
  if (isTrend(url)) {
    const month = String(url.searchParams.get('periodStart') || '').slice(0, 7)
    if (failMonth && month === failMonth) {
      failMonth = ''
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: '服务暂时无法返回数据，请稍后重试。' }) })
      return
    }
    const hold = gates.find(item => !item.used && item.month === month)
    if (hold) {
      hold.used = true
      const response = await route.fetch()
      hold.intercepted()
      await hold.gate
      await route.fulfill({ response }).catch(() => {})
      return
    }
  }
  await route.continue()
})
try {
  const initial = delayTrend('2026-01')
  await page.goto(`${origin}/analysis?indicator=102027642460761108&indicatorVersionId=102027642460761114&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31&trendStart=2026-01-01&trendEnd=2026-01-31&filter.OUT_DEPT_CODE=16`)
  await initial.entered
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
    return s && !s.analysisLoading && !s.rangeSummaryLoading && s.trendLoading && s.primaryMetric.value === '0.23%'
  }, null, { timeout: 90000 })
  let snapshot = await state()
  assert.equal(Number(snapshot.report.numerator), 1)
  assert.equal(Number(snapshot.report.denominator), 429)
  assert.equal(requests.filter(url => /\/drill\/search/.test(url)).length, 0)
  assert.equal(requests.filter(url => /\/analysis\?/.test(url) && !url.includes('sections=')).length, 0)
  evidence.push({ name: '趋势未返回时主结果独立展示且排名下钻未加载', snapshot })
  initial.release()
  await ready()
  const original = await state()
  const start = requests.length
  const old = delayTrend('2026-03')
  await applyMonth('2026-03')
  await old.entered
  await applyMonth('2026-02')
  await ready()
  old.release()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  snapshot = await state()
  assert.ok(snapshot.trend.trend.length > 0)
  assert.ok(snapshot.trend.trend.every(row => row.periodStart.startsWith('2026-02')))
  assert.deepEqual(snapshot.report, original.report)
  assert.equal(snapshot.metric.value, '0.23%')
  assert.ok(cancelled.some(url => url.includes('periodStart=2026-03-01')), 'superseded trend transport must be aborted')
  assert.equal(requests.slice(start).length, 2, 'changing trend dates must issue only two trend requests')
  assert.ok(requests.slice(start).every(url => isTrend(new URL(origin + url))))
  evidence.push({ name: '连续切换月份后仅保留最新趋势且未重载主结果', snapshot })

  failMonth = '2026-04'
  await applyMonth('2026-04')
  await ready()
  snapshot = await state()
  assert.ok(snapshot.trendError)
  assert.equal(snapshot.trend, null)
  assert.deepEqual(snapshot.report, original.report)
  await page.getByRole('tabpanel', { name: '趋势分析' }).getByRole('button', { name: '重试', exact: true }).click()
  await ready()
  snapshot = await state()
  assert.equal(snapshot.trendError, '')
  assert.ok(snapshot.trend.trend.every(row => row.periodStart.startsWith('2026-04')))
  evidence.push({ name: '趋势失败不污染主结果且原条件重试成功', snapshot })

  const emptyStart = requests.length
  await applyMonth('2027-01')
  await ready()
  snapshot = await state()
  assert.equal(snapshot.trend.trend.length, 0)
  assert.deepEqual(snapshot.period, ['2027-01-01', '2027-01-31'])
  assert.deepEqual(snapshot.report, original.report)
  assert.equal(requests.length - emptyStart, 1, 'empty periods must not silently fetch a different period')
  evidence.push({ name: '无数据周期保持为空不偷偷改查全部时间', snapshot })

  await page.getByRole('tab', { name: '科室排名', exact: true }).click()
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
    return s.rankInitialized && !s.rankLoading
  }, null, { timeout: 90000 })
  const rank = await state()
  assert.equal(rank.rankError, '')
  assert.ok(rank.rankRows.length)
  await page.getByRole('tab', { name: '趋势分析', exact: true }).click()
  await applyMonth('2026-05')
  await ready()
  snapshot = await state()
  assert.equal(snapshot.rankPeriod, rank.rankPeriod)
  assert.deepEqual(snapshot.rankRows, rank.rankRows)
  await page.getByRole('tab', { name: '下钻分析', exact: true }).click()
  await page.waitForFunction(() => {
    const s = document.querySelector('.drill-explorer')?.__vueParentComponent?.setupState
    return s && !s.loading && !s.errorMessage && s.result.records.length > 0
  }, null, { timeout: 90000 })
  const afterDrill = requests.length
  await page.getByRole('tab', { name: '趋势分析', exact: true }).click()
  await page.getByRole('tab', { name: '下钻分析', exact: true }).click()
  assert.equal(requests.length, afterDrill, 'completed drill data must survive tab switches')
  evidence.push({ name: '排名下钻按需加载且已完成结果不重复请求', snapshot: await state() })
  await page.screenshot({ path: `${folder}/请求状态-下钻.png`, fullPage: true })

  await page.getByRole('tab', { name: '科室排名', exact: true }).click()
  const expectedRow = (await state()).rankRows[0]
  assert.ok(expectedRow.drillContext?.resultId)
  const drilled = page.waitForRequest(request => /\/drill\/search/.test(request.url()))
  await page.locator('.rank-table .action-link').first().click()
  const drillRequest = await drilled
  const payload = drillRequest.postDataJSON()
  assert.ok(drillRequest.url().includes(expectedRow.drillContext.resultId))
  assert.equal(payload.currentLevel, expectedRow.drillContext.currentLevel)
  assert.equal(payload.pathCode, expectedRow.drillContext.pathCode)
  for (const [key, value] of Object.entries(expectedRow.drillContext.parentKeys)) assert.equal(payload.parentKeys[key], value)
  await page.waitForFunction(() => {
    const s = document.querySelector('.drill-explorer')?.__vueParentComponent?.setupState
    return s && !s.loading && !s.errorMessage && s.result.records.length > 0
  }, null, { timeout: 90000 })
  const detail = await page.locator('.drill-explorer').evaluate(node => {
    const s = node.__vueParentComponent.setupState
    return { context: s.result.context, records: s.result.records }
  })
  assert.equal(String(detail.context.resultId), expectedRow.drillContext.resultId)
  assert.equal(detail.context.periodStart, expectedRow.drillContext.period.periodStart)
  assert.equal(detail.context.periodEnd, expectedRow.drillContext.period.periodEnd)
  evidence.push({ name: '排名查看明细保留结果周期科室路径并读取真实医生结果', row: expectedRow, payload, detail })

  await page.getByRole('tab', { name: '趋势分析', exact: true }).click()
  const previousIndicator = delayTrend('2026-06')
  await applyMonth('2026-06')
  await previousIndicator.entered
  await page.locator('.indicator-analysis').evaluate(node => { node.__vueParentComponent.setupState.selectedIndicatorCode = '102027642461313070' })
  await page.getByRole('button', { name: '查看分析', exact: true }).click()
  await ready()
  previousIndicator.release()
  snapshot = await state()
  assert.equal(snapshot.version, '102027642461313071')
  assert.equal(snapshot.trendError, '')
  assert.equal(String(snapshot.trend.indicatorVersionId), snapshot.version)
  const returnUrl = page.url()
  await page.locator('.indicator-analysis').evaluate(node => node.__vueParentComponent.setupState.router.push('/indicator'))
  await page.waitForURL('**/indicator')
  await page.goBack()
  await page.waitForURL(returnUrl)
  await ready()
  snapshot = await state()
  assert.equal(snapshot.version, '102027642461313071')
  assert.equal(String(snapshot.trend.indicatorVersionId), snapshot.version)
  assert.deepEqual(errors, [])
  evidence.push({ name: '切换指标与离开返回均不接收旧请求数据', snapshot })
  await page.screenshot({ path: `${folder}/请求状态-返回分析.png`, fullPage: true })

  await page.goto(`${origin}/analysis?indicator=102027642460761108&indicatorVersionId=102027642460761114&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31&trendStart=2026-01-01&trendEnd=2026-01-31&filter.OUT_DEPT_CODE=16`)
  await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState.canExportPdf, null, { timeout: 90000 })
  assert.equal(await page.locator('.indicator-analysis').evaluate(node => node.__vueParentComponent.setupState.rankInitialized), false)
  const exported = page.waitForRequest(request => request.url().endsWith('/export/pdf'))
  const downloaded = page.waitForEvent('download', { timeout: 90000 })
  await page.getByRole('button', { name: '导出PDF', exact: true }).click()
  const report = (await exported).postDataJSON()
  const download = await downloaded
  assert.equal(await download.failure(), null)
  assert.ok(report.sections.find(section => section.title === '科室指标排名').rows.length > 0)
  assert.equal((await state()).metric.value, '0.23%')
  await download.saveAs(`${folder}/请求状态-按需排名导出.pdf`)
  evidence.push({ name: '未打开排名页签也能按需读取排名并导出完整报告', report })
  for (const item of evidence) console.log('通过', item.name)
} finally {
  for (const gate of gates) gate.release()
  await save('分析请求状态验收', { evidence, requests, cancelled, errors })
  await browser.close()
}
