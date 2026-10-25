import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, admin, origin, folder, save } from './comprehensive-client.mjs'
import { buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const evidence = []
try {
  for (const sample of [
    { name: '一月死亡率非零百分比', version: '102027642460761114', granularity: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-02-01', filters: { OUT_DEPT_CODE: ['16'] }, numerator: 1, denominator: 429 },
    { name: '一月死亡率真实零值', version: '102027642460761114', granularity: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-02-01', filters: { OUT_DEPT_CODE: ['15'] }, numerator: 0, denominator: 679 },
    { name: '跨季度转科比例多科室即时结果', version: '102027642461313071', granularity: 'CUSTOM', periodStart: '2026-02-01', periodEnd: '2026-05-01', filters: { OUT_DEPT_CODE: ['15', '16'] }, numerator: 13, denominator: 2490 },
    { name: '独立映射静态结果', version: '102027642465170414', granularity: 'STATIC', value: 940333.88 }
  ]) {
    const version = await api('GET', `/indicator-versions/${sample.version}`)
    const params = new URLSearchParams(buildIndicatorAnalysisRouteQuery({ indicatorId: version.indicatorId, indicatorVersionId: sample.version }, sample))
    // URLSearchParams(object) would join multi-selection arrays with commas.
    for (const [field, values] of Object.entries(sample.filters || {})) {
      params.delete(`filter.${field}`)
      for (const value of values) params.append(`filter.${field}`, value)
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/analysis?${params}`)
    await page.waitForFunction(() => {
      const state = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
      return state && !state.analysisLoading && !state.rangeSummaryLoading && !state.trendLoading && state.analysisOverview?.value != null
    }, null, { timeout: 90000 })
    const state = await page.locator('.indicator-analysis').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { metric: s.primaryMetric, overview: s.currentReportOverview, trend: s.trendPresentation.trend,
        trendRows: s.trendTableRows, series: s.trendPresentation.option.series, profile: s.currentProfile, display: s.metricDisplay,
        response: s.trendBackendAnalysis, error: s.analysisErrorMessage, summaryError: s.rangeSummaryErrorMessage }
    })
    assert.deepEqual(errors, [])
    assert.equal(state.error, '')
    assert.equal(state.summaryError, '')
    assert.equal(String(state.metric.value), String(state.overview.displayValue))
    if (sample.denominator) {
      assert.equal(Number(state.overview.numerator ?? state.overview.numeratorValue), sample.numerator)
      assert.equal(Number(state.overview.denominator ?? state.overview.denominatorValue), sample.denominator)
      assert.ok(Math.abs(Number(state.overview.value) - sample.numerator / sample.denominator) < 1e-8)
      assert.equal(state.metric.value, `${(sample.numerator / sample.denominator * 100).toFixed(2)}%`)
    } else {
      assert.equal(Number(state.overview.value), sample.value)
      assert.equal(state.metric.periodLabel, '静态结果')
    }
    const rows = sample.granularity === 'STATIC' ? [] : state.response?.trend || []
    if (sample.granularity === 'STATIC') assert.equal(await page.locator('.trend-controls').count(), 0)
    assert.equal(state.trend.actual.length, rows.length)
    for (const [index, row] of rows.entries()) {
      const expected = row.value == null ? null : Number(row.value) * Number(state.display?.multiplier ?? (state.profile.unit === '%' ? 100 : 1))
      if (expected === null) assert.equal(state.trend.actual[index], null)
      else assert.ok(Math.abs(state.trend.actual[index] - expected) < 1e-10)
      if (row.displayValue != null) assert.equal(String(state.trendRows[index].actualDisplay), String(row.displayValue))
    }
    const target = state.response?.performanceTarget
    if (target?.targetValue == null) assert.equal(state.series[0]?.markLine, undefined)
    if (rows.length) {
      await page.locator('.idmp-chart__table-toggle').first().click()
      const visible = await page.locator('.idmp-chart__table-panel').first().innerText()
      for (const row of state.trendRows) assert.ok(visible.includes(String(row.actualDisplay)))
      const chart = page.locator('.idmp-chart').first()
      await chart.scrollIntoViewIfNeeded()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.waitForFunction(async () => {
        const url = performance.getEntriesByType('resource').find(item => /\/echarts\.js\?/.test(item.name))?.name
        if (!url) return false
        const echarts = await import(url)
        const chart = echarts.getInstanceByDom(document.querySelector('.idmp-chart'))
        return chart && chart.getOption().series?.[0]?.data?.length && chart.getZr().animation.isFinished()
      })
      if (state.display?.format === 'PERCENT') assert.equal(state.profile.unit, '%')
      state.chart = await chart.evaluate(async node => {
        const url = performance.getEntriesByType('resource').find(item => /\/echarts\.js\?/.test(item.name)).name
        const echarts = await import(url)
        const chart = echarts.getInstanceByDom(node)
        const series = chart.getModel().getSeriesByIndex(0), data = series.getData()
        const symbol = data.getItemGraphicEl(0)
        const area = series.coordinateSystem.getArea()
        const target = series.option.markLine?.data?.[0]?.yAxis
        const targetY = target == null ? null : chart.convertToPixel({ yAxisIndex: 0 }, target)
        let targetPainted = false
        const colors = Array.from(node.querySelectorAll('canvas')).map(canvas => {
          const ratio = canvas.width / canvas.clientWidth
          if (targetY != null && targetY >= 0 && targetY < canvas.clientHeight) {
            const pixels = canvas.getContext('2d').getImageData(Math.round((area.x + area.width / 2) * ratio), Math.max(0, Math.floor(targetY * ratio) - 1), 24, 3).data
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 2] * 2 && pixels[i + 3] > 0) targetPainted = true
          }
          return [...canvas.getContext('2d').getImageData(Math.round(symbol?.x * ratio), Math.round(symbol?.y * ratio), 1, 1).data]
        })
        return { targetY, targetPainted, area, colors, points: Array.from({ length: data.count() }, (_, index) => ({
          point: chart.convertToPixel({ seriesIndex: 0 }, [index, data.get(data.mapDimension('y'), index)]),
          graphic: Boolean(data.getItemGraphicEl(index))
        })) }
      })
      assert.ok(state.chart.colors.some(color => color[2] > color[0] && color[3] > 0), '数据点位置必须有实际绘制的蓝色像素')
      if (target?.targetValue != null) {
        assert.ok(state.chart.targetY >= state.chart.area.y && state.chart.targetY <= state.chart.area.y + state.chart.area.height)
        assert.ok(state.chart.targetPainted, '配置的目标线必须有实际绘制的红色像素')
      }
      await page.screenshot({ path: `${folder}/${sample.name}-视口.png` })
    }
    await page.screenshot({ path: `${folder}/${sample.name}.png`, fullPage: true })
    evidence.push({ name: sample.name, state })
    console.log('通过', sample.name, state.metric.value, `趋势点数 ${rows.length}`)
    await context.close()
  }
} finally {
  await save('结果数值与展示验收', evidence)
  await browser.close()
}
