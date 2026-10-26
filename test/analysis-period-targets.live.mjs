import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, folder, save } from './comprehensive-client.mjs'

const packagePath = process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json'
const { chromium } = createRequire(packagePath)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage()
const errors = [], requests = [], evidence = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/v1/') && url.pathname.endsWith('/analysis')) requests.push(Object.fromEntries(url.searchParams))
})
const ready = () => page.waitForFunction(() => {
  const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
  return s && !s.analysisLoading && !s.rangeSummaryLoading && !s.trendLoading && !s.indicatorOptionsLoading
}, null, { timeout: 90000 })
const read = () => page.locator('.indicator-analysis').evaluate(node => {
  const s = node.__vueParentComponent.setupState
  return { overview: s.backendAnalysis?.overview, error: s.analysisErrorMessage, trendError: s.trendErrorMessage,
    rankError: s.rankErrorMessage, rankRows: s.rankTableData, rankPeriod: s.rankSelectedPeriod }
})
function ratio(row) {
  if (row?.numeratorValue != null && Number(row.denominatorValue) > 0 && row.value != null)
    assert.ok(Math.abs(Number(row.value) - Number(row.numeratorValue) / Number(row.denominatorValue)) < 1e-7)
}
try {
  for (const [name, indicator, version, numerator, denominator] of [
    ['转科比例', '102027642461313070', '102027642461313071', 65, 15505],
    ['住院死亡率', '102027642460761108', '102027642460761114', 55, 14187],
    ['中药费用比例', '102027642462358147', '102027642462358159', 1324534.51, 35934177.62]
  ]) {
    const before = requests.length
    await page.goto(`${origin}/analysis?indicator=${indicator}&indicatorVersionId=${version}`)
    await ready()
    const overview = await read()
    assert.equal(overview.error, '', name)
    assert.equal(overview.trendError, '', name)
    assert.ok(overview.overview, name)
    ratio(overview.overview)
    assert.ok(!(await page.locator('.metric-overview').innerText()).includes('本期暂无结果'))
    await page.getByRole('tab', { name: '科室排名', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
      return s.rankInitialized && !s.rankLoading
    }, null, { timeout: 90000 })
    const rank = await read()
    assert.equal(rank.rankError, '', name)
    assert.ok(rank.rankRows.length > 0, `${name}: ranking must not be silently empty`)
    await page.getByRole('tab', { name: '下钻分析', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-drill-analysis')?.__vueParentComponent?.setupState
      const drill = document.querySelector('.drill-explorer')?.__vueParentComponent?.setupState
      return s && !s.loading && (s.errorMessage || (drill && !drill.loading))
    }, null, { timeout: 90000 })
    const drill = await page.locator('.indicator-drill-analysis').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      const child = node.querySelector('.drill-explorer')?.__vueParentComponent?.setupState
      return { error: s.errorMessage, period: s.selectedPeriod, childError: child?.errorMessage,
        context: child?.result.context, summary: child?.result.summary, rows: child?.result.records }
    })
    assert.equal(drill.error, '', name)
    assert.equal(drill.childError, '', name)
    assert.ok(drill.rows.length > 0, name)
    assert.equal(`${drill.context.periodStart.slice(0, 10)}/${drill.context.periodEnd.slice(0, 10)}`, drill.period)
    drill.rows.forEach(row => ratio({ ...row, value: row.indicatorValue }))
    await page.locator('.drill-period-select').click()
    await page.getByRole('option', { name: '2026年1月', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-drill-analysis')?.__vueParentComponent?.setupState
      const child = document.querySelector('.drill-explorer')?.__vueParentComponent?.setupState
      return s && !s.loading && child && !child.loading && child.result.context.periodStart?.startsWith('2026-01-01')
    }, null, { timeout: 90000 })
    const january = await page.locator('.drill-explorer').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { error: s.errorMessage, context: s.result.context, summary: s.result.summary }
    })
    assert.equal(january.error, '')
    assert.ok(Math.abs(Number(january.summary.numerator) - numerator) < 1e-6, `${name}: January numerator`)
    assert.ok(Math.abs(Number(january.summary.denominator) - denominator) < 1e-6, `${name}: January denominator`)
    assert.ok(Math.abs(Number(january.summary.indicatorValue) - numerator / denominator) < 1e-7, `${name}: January ratio`)
    const queries = requests.slice(before)
    assert.ok(queries.every(query => query.sections), 'Every module must explicitly select its sections')
    assert.ok(queries.every(query => !query.sections.includes('DIMENSION_COMPARISON')), 'No implicit combination member download')
    assert.ok(queries.filter(query => query.sections.includes('DEPARTMENT_COMPARISON')).every(query => query.periodStart && query.periodEnd), 'Ranking must select one period')
    evidence.push({ name, overview, rank, drill, january, queries })
    await page.screenshot({ path: `${folder}/${name}-周期下钻.png`, fullPage: true })
    console.log(`${name}: overview, ranking and drill passed`)
  }
  assert.deepEqual(errors, [])
} finally {
  await save('analysis-period-targets-browser', { evidence, errors, requests })
  await browser.close()
}
