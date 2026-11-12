import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, folder, save } from './comprehensive-client.mjs'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const indicator = '102027642460761108'
const v1 = '102027642460761114'
const v2 = '102027642467600364'
const evidence = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const url = version => `${origin}/analysis?indicator=${indicator}${version ? `&indicatorVersionId=${version}` : ''}&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31&trendStart=2026-01-01&trendEnd=2026-01-31`
  const ready = async version => {
    await page.waitForFunction(version => {
      const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
      return s && s.currentIndicatorVersionId === version && String(s.backendIndicatorVersion?.id) === version
        && !s.indicatorOptionsLoading && !s.analysisLoading && !s.trendLoading && !s.rangeSummaryLoading && !s.formulaMetadataLoading
    }, version, { timeout: 120000 }).catch(async error => {
      console.log(JSON.stringify(await page.evaluate(() => {
        const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
        return { url: location.pathname, state: s && { current: s.currentIndicatorVersionId,
          version: s.backendIndicatorVersion?.id, loading: s.analysisLoading, trend: s.trendLoading,
          summary: s.rangeSummaryLoading, directory: s.indicatorOptionsLoading, error: s.analysisErrorMessage,
          options: s.analysisVersionOptions.length } }
      })))
      await page.screenshot({ path: `${folder}/失败现场.png` })
      throw error
    })
    const state = await page.evaluate(() => {
      const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
      return { selected: s.currentIndicatorVersionId, versionNo: s.backendIndicatorVersion.versionNo,
        overview: s.backendAnalysis?.indicatorVersionId, trend: s.trendBackendAnalysis?.indicatorVersionId,
        error: s.analysisErrorMessage || s.trendErrorMessage || s.rangeSummaryErrorMessage,
        filters: s.reportFilterDraft, formula: s.backendIndicatorVersion.formula,
        options: s.analysisVersionOptions.map(v => ({ id: v.id, versionNo: v.versionNo })) }
    })
    assert.equal(state.error, '')
    assert.equal(String(state.overview), version)
    assert.equal(String(state.trend), version)
    assert.ok(state.formula)
    evidence.push(state)
    console.log(`通过：V${state.versionNo} 总览及趋势版本一致`)
    return state
  }
  const selectVersion = async label => {
    await page.locator('.analysis-version-select').evaluate(node => node.scrollIntoView({ block: 'center' }))
    await page.locator('.analysis-version-select .el-select__wrapper').click()
    await page.getByRole('option', { name: label, exact: true }).click()
  }
  await page.goto(`${url(v1)}&filter.OUT_DEPT_CODE=16`)
  assert.equal((await ready(v1)).versionNo, 1)
  assert.match(await page.locator('.analysis-version-control').innerText(), /V1/)
  await selectVersion('V2')
  const switched = await ready(v2)
  assert.deepEqual(switched.filters, {})
  assert.ok(!new URL(page.url()).searchParams.has('filter.OUT_DEPT_CODE'))
  assert.equal(new URL(page.url()).searchParams.get('periodStart'), '2026-01-01')
  await page.getByRole('tab', { name: '科室排名', exact: true }).click()
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
    return s.rankInitialized && !s.rankLoading
  }, null, { timeout: 120000 })
  const january = await page.evaluate(() => document.querySelector('.indicator-analysis').__vueParentComponent.setupState
    .rankPeriodOptions.find(p => String(p.periodStart).startsWith('2026-01-01')))
  assert.ok(january, '真实验收应包含2026年1月正式周期')
  await page.locator('.rank-period-select .el-select__wrapper').click()
  await page.getByRole('option', { name: january.label, exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.indicator-analysis').__vueParentComponent.setupState.rankLoading,
    null, { timeout: 120000 })
  const rank = await page.evaluate(() => {
    const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
    return { version: s.rankAnalysis?.indicatorVersionId, error: s.rankErrorMessage, rows: s.rankTableData.length }
  })
  assert.equal(rank.error, '')
  assert.equal(String(rank.version), v2)
  assert.ok(rank.rows > 0)
  evidence.push({ rank })
  await page.getByRole('tab', { name: '下钻分析', exact: true }).click()
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-drill-analysis')?.__vueParentComponent?.setupState
    return s?.initialized && !s.loading
  }, null, { timeout: 120000 })
  await page.locator('.drill-period-select .el-select__wrapper').click()
  await page.getByRole('option', { name: january.label, exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.indicator-drill-analysis').__vueParentComponent.setupState.loading,
    null, { timeout: 120000 })
  const drill = await page.evaluate(() => {
    const s = document.querySelector('.indicator-drill-analysis').__vueParentComponent.setupState
    return { version: s.analysis?.indicatorVersionId, error: s.errorMessage, anchor: s.anchor.resultId }
  })
  assert.equal(drill.error, '')
  assert.equal(String(drill.version), v2)
  assert.ok(drill.anchor)
  evidence.push({ drill })
  await page.getByRole('tab', { name: '趋势分析', exact: true }).click()
  await selectVersion('V1')
  await ready(v1)
  await page.goBack()
  await ready(v2)
  await page.route(`**/indicator-versions/${v1}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 800))
    await route.continue().catch(() => {})
  })
  await selectVersion('V1')
  await selectVersion('V2')
  await ready(v2)
  await page.waitForTimeout(1000)
  await ready(v2)
  await page.unroute(`**/indicator-versions/${v1}`)
  await page.goto(url(''))
  await ready(v2)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.locator('.analysis-version-control').scrollIntoViewIfNeeded()
    const bounds = await page.locator('.analysis-version-control').boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    await page.screenshot({ path: `${folder}/版本切换-${width}.png` })
    evidence.push({ width, bounds })
  }
  await selectVersion('V1')
  await ready(v1)
  assert.deepEqual(errors, [])
  console.log('通过：指定版本进入、版本切换、总览/趋势/排名/下钻一致性、过滤重置、返回、快速切换、默认最新及桌面/手机布局')
} finally {
  await save('版本切换验收', evidence)
  await browser.close()
}
