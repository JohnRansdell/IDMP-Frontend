import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
const directory = '.tmp/analysis-trend-axis'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ reducedMotion: 'reduce' })
const checks = [], errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  // Exercise the production component and renderer without changing business definitions.
  await page.route('**/__trend_axis_test', route => route.fulfill({ contentType: 'text/html', body: '<html><head><meta charset="utf-8"></head><body style="margin:16px"><div id="app"></div></body></html>' }))
  await page.goto(`${origin}/__trend_axis_test`)
  await page.evaluate(async () => {
    const { default: Chart } = await import('/src/idmp/components/IdmpChart.vue')
    const { createAnalysisTrendPresentation } = await import('/src/idmp/features/analysis/trendPresentation.js')
    const { analysisChartExportOption } = await import('/src/idmp/features/analysis/pdfReport.js')
    const moduleUrl = name => performance.getEntriesByType('resource').find(entry => entry.name.includes(`/.vite/deps/${name}.js?v=`)).name
    const { createApp, h, shallowRef } = await import(moduleUrl('vue'))
    const echarts = await import(moduleUrl('echarts'))
    const option = shallowRef({})
    window.setTrend = ({ unit, values, target, pdf }) => {
      const presentation = createAnalysisTrendPresentation({
        analysis: { dataAvailable: true, granularity: 'MONTHLY',
          trend: values.map((value, index) => ({ value, periodStart: `2026-0${index + 1}-01` })) },
        profile: { unit, markLineValue: target, targetLabel: '目标值' }, granularity: 'MONTHLY'
      })
      option.value = pdf ? analysisChartExportOption(presentation.option) : presentation.option
    }
    window.readTrend = () => {
      const element = document.querySelector('.idmp-chart')
      const chart = echarts.getInstanceByDom(element)
      if (!chart) return null
      const model = chart.getModel()
      const axis = model.getComponent('yAxis')
      const texts = []
      chart.getViewOfComponentModel(axis).group.traverse(node => {
        if (node.type !== 'text' || node.ignore || node.invisible) return
        const rect = node.getBoundingRect().clone()
        rect.applyTransform(node.getComputedTransform())
        texts.push({ text: node.style.text, x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height })
      })
      const plot = model.getComponent('grid').coordinateSystem.getRect()
      const legend = chart.getViewOfComponentModel(model.getComponent('legend')).group
      const legendRect = legend.getBoundingRect().clone()
      legendRect.applyTransform(legend.getComputedTransform())
      const axisName = texts.find(label => label.text === axis.get('name'))
      if (axisName && axisName.y < legendRect.y + legendRect.height) throw new Error('Axis title overlaps the legend row')
      return { texts, width: element.clientWidth, height: element.clientHeight, plot: { x: plot.x, width: plot.width } }
    }
    createApp({ render: () => h(Chart, { option: option.value, height: '338px' }, { table: () => h('p', '趋势数据表') }) }).mount('#app')
  })
  const cases = [
    { name: '大金额', unit: '元', values: [123456789.12, 987654321.09] },
    { name: '负值', unit: '人次', values: [-123456789, 234567890] },
    { name: '小百分比', unit: '%', values: [0.0000234, 0.0000456], target: 0.01 },
    { name: '全零', unit: '', values: [0, 0] },
    { name: '长单位单点', unit: '毫克/千克/分钟', values: [123456.78] },
    { name: '导出图', unit: '元', values: [123456789.12, 987654321.09], pdf: true }
  ]
  for (const sample of cases) {
    await page.evaluate(sample => window.setTrend(sample), sample)
    for (const width of [1440, 768, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 640 })
      await page.waitForTimeout(150)
      const state = await page.evaluate(() => window.readTrend())
      assert.ok(state.texts.length >= 3, 'axis must contain a name and ticks')
      for (const label of state.texts) {
        assert.ok(label.x >= -0.5 && label.right <= state.width + 0.5 && label.y >= -0.5 && label.bottom <= state.height + 0.5,
          `${sample.name} ${width}px clipped: ${JSON.stringify(label)}`)
      }
      assert.ok(state.plot.width > 60, `${sample.name}: plot must remain usable`)
      checks.push({ sample: sample.name, viewport: width, ...state })
      if (width === 390 || width === 1440) await page.screenshot({ path: `${directory}/${sample.name}-${width}.png` })
    }
    await page.getByRole('button', { name: '查看数据表', exact: true }).click()
    await page.getByRole('button', { name: '查看数据表', exact: true }).click()
    await page.waitForTimeout(100)
    const { sample: sampleName, viewport, ...beforeToggle } = checks.at(-1)
    assert.deepEqual(await page.evaluate(() => window.readTrend()), beforeToggle)
  }
  assert.deepEqual(errors, [])
  console.log(`Passed ${checks.length} rendered axis checks, including resize, table toggles and export options.`)
} finally {
  await writeFile(`${directory}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
