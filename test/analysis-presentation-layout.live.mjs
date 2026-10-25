import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, folder, save } from './comprehensive-client.mjs'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const evidence = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/analysis?indicator=102027642460761108&indicatorVersionId=102027642460761114&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31&trendStart=2026-01-01&trendEnd=2026-01-31&filter.OUT_DEPT_CODE=16`)
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
    return s && !s.analysisLoading && !s.trendLoading && !s.rangeSummaryLoading && s.primaryMetric.value === '0.23%'
  }, null, { timeout: 90000 })
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByRole('tab', { name: '趋势分析', exact: true }).click()
    await page.locator('.metric-overview').scrollIntoViewIfNeeded()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.screenshot({ path: `${folder}/展示布局-${width}-概览.png` })
    await page.locator('.analysis-panel').evaluate(node => node.scrollIntoView({ block: 'start' }))
    const bounds = await page.evaluate(() => {
      const bounds = selector => {
        const element = document.querySelector(selector)
        const rect = element.getBoundingClientRect()
        return { x: rect.x, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
      }
      return { viewport: innerWidth, overview: bounds('.metric-overview'), controls: bounds('.trend-controls'), picker: bounds('.trend-period-picker'), panel: bounds('.analysis-panel') }
    })
    for (const [name, box] of Object.entries(bounds)) {
      if (typeof box !== 'object') continue
      assert.ok(box.right <= bounds.viewport + 1 && box.x >= -1, `${width} ${name} must remain inside viewport: ${JSON.stringify(box)}`)
      assert.ok(box.scrollWidth <= box.clientWidth + 1, `${width} ${name} must not overflow`)
    }
    await page.screenshot({ path: `${folder}/展示布局-${width}-趋势.png` })
    await page.getByRole('tab', { name: '科室排名', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis').__vueParentComponent.setupState
      return s.rankInitialized && !s.rankLoading && !s.rankErrorMessage && s.rankTableData.length
    }, null, { timeout: 90000 })
    await page.locator('.rank-period-toolbar').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${folder}/展示布局-${width}-排名.png` })
    evidence.push({ width, bounds })
    console.log('通过', `${width}px 概览、趋势和排名布局`)
  }
  assert.deepEqual(errors, [])
} finally {
  await save('分析展示布局验收', evidence)
  await browser.close()
}
