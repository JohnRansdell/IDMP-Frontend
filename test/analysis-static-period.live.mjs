import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, admin, origin, folder, save } from './comprehensive-client.mjs'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const evidence = []
try {
  for (const sample of [
    { name: '独立映射目标三静态结果', version: '102027642465170414', static: true },
    { name: '真实费用静态指标', version: '102027642465168998', static: true },
    { name: '转科比例月度指标', version: '102027642461313071', static: false }
  ]) {
    const version = await api('GET', `/indicator-versions/${sample.version}`)
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
    const page = await context.newPage()
    await page.goto(`${origin}/analysis?indicator=${version.indicatorId}&indicatorVersionId=${sample.version}`)
    await page.waitForFunction(() => {
      const state = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
      return state && !state.analysisLoading && state.backendAnalysis
    }, null, { timeout: 90000 })
    const state = await page.locator('.indicator-analysis').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { period: s.reportPeriodLabel, range: s.reportPeriodRange, metric: s.primaryMetric, overview: s.analysisOverview,
        updated: s.analysisUpdatedAt, error: s.analysisErrorMessage }
    })
    assert.equal(state.error, '')
    if (sample.static) {
      assert.equal(state.period, '静态结果')
      assert.equal(state.metric.periodLabel, '静态结果')
      assert.deepEqual(state.range, [])
      assert.equal(await page.locator('.trend-controls').count(), 0)
      assert.doesNotMatch(state.updated, /9999|1000-01-01/)
      assert.ok(state.overview?.value != null, '静态正式结果不能因格式化被清空')
      for (const tab of ['趋势分析', '科室排名', '下钻分析']) {
        await page.getByRole('tab', { name: tab }).click()
        assert.doesNotMatch(await page.locator('body').innerText(), /1000-01-01|9999-12-31/)
      }
    } else {
      assert.notEqual(state.period, '静态结果')
      assert.equal(await page.locator('.trend-controls').count(), 1)
      assert.match(state.period, /2026/)
    }
    await page.screenshot({ path: `${folder}/${sample.name}.png`, fullPage: true })
    evidence.push({ name: sample.name, state })
    console.log('通过', sample.name, state.period, state.metric.value)
    await context.close()
  }
} finally { await save('静态周期展示验收', evidence); await browser.close() }
