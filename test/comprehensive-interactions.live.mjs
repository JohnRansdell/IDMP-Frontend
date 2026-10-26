import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, state, rows, check, run, save, finish, folder, get, close } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = [], requests = [], heapSamples = []
page.setDefaultTimeout(20000)
page.on('pageerror', error => errors.push(error.message))
page.on('crash', () => errors.push('浏览器页面崩溃'))
page.on('request', request => { if (request.url().includes('/api/v1/')) requests.push({ path: new URL(request.url()).pathname, method: request.method() }) })
const client = await context.newCDPSession(page)
await client.send('Performance.enable')
const dashboardReady = async () => {
  await page.getByTestId('dashboard-canvas').waitFor()
  await page.waitForFunction(() => {
    let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
    while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
    return vm && vm.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
  })
  await page.waitForLoadState('networkidle')
}
const route = path => page.locator('main').evaluate((node, path) => node.__vueParentComponent.proxy.$router.push(path), path)
try {
  for (let scenario = 0; scenario < 3; scenario++) await run(`看板交互压力场景${scenario + 1}`, async () => {
    const start = requests.length
    await page.goto(`${origin}/dashboard?id=${state.boardId}`)
    await page.getByTestId('dashboard-period-type').waitFor()
    const cold = performance.now()
    await page.getByTestId('dashboard-period-type').click()
    await page.getByRole('option', { name: '季度', exact: true }).waitFor()
    const coldInteractionMs = performance.now() - cold
    await page.keyboard.press('Escape')
    check(`场景${scenario + 1}首屏时间选择器可交互`, coldInteractionMs < 3000, { coldInteractionMs })
    await dashboardReady()
    for (let cycle = 0; cycle < 8; cycle++) {
      if (scenario === 0) {
        await page.getByTestId('dashboard-canvas').evaluate((node, cycle) => {
          let vm = node.__vueParentComponent
          while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
          vm.setupState.applyRemotePeriodSelection({ type: 'MONTHLY', month: `2026-0${cycle % 3 + 1}` })
        }, cycle)
        await dashboardReady()
      } else if (scenario === 1) {
        await route('/indicator'); await page.waitForLoadState('networkidle')
        await route(`/dashboard?id=${state.boardId}`); await dashboardReady()
      } else {
        for (const distance of [1000, 1000, -1000, -1000]) await page.mouse.wheel(0, distance)
        const toggle = page.getByRole('button', { name: /查看数据表|收起数据表/ }).first()
        if (await toggle.count()) { await toggle.click(); await toggle.click() }
      }
      await client.send('HeapProfiler.collectGarbage')
      const heap = await client.send('Runtime.getHeapUsage'), dom = await client.send('Memory.getDOMCounters')
      heapSamples.push({ scenario, cycle, bytes: heap.usedSize, nodes: dom.nodes })
    }
    const samples = heapSamples.filter(item => item.scenario === scenario).slice(-5)
    check(`场景${scenario + 1}回收后内存不持续累积`, Math.max(...samples.map(s => s.bytes)) - Math.min(...samples.map(s => s.bytes)) < 20 * 1024 * 1024, samples)
    check(`场景${scenario + 1}没有重复全量指标分析请求`, !requests.slice(start).some(r => /\/analysis\/indicators\/[^/]+\/analysis$/.test(r.path)), requests.slice(start).filter(r => /\/analysis\/indicators/.test(r.path)))
    const canvases = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => ({ width: node.width, height: node.height, data: node.getContext('2d')?.getImageData(0, 0, Math.min(300, node.width), Math.min(200, node.height)).data.some(value => value !== 0) })))
    check(`场景${scenario + 1}图表画布非空`, canvases.length >= 3 && canvases.some(item => item.data), canvases)
    await page.screenshot({ path: `${folder}/看板交互场景${scenario + 1}.png`, fullPage: true })
  })
  for (const [index, indicator] of state.indicators.entries()) await run(`嵌套指标编辑试算${index + 1}`, async () => {
    await page.goto(`${origin}/indicator/edit/${indicator.id}`)
    await page.getByRole('tab', { name: '2 公式与试算', exact: true }).click()
    await page.waitForLoadState('networkidle')
    check(`公式${index + 1}真实公式不显示空分子分母`, await page.getByLabel('实时公式预览').innerText().then(text => text.length > 12 && !text.includes('未配置')), await page.getByLabel('实时公式预览').innerText())
    await page.getByRole('button', { name: '公式校验', exact: true }).click()
    await page.getByRole('button', { name: /试算并查看结果|重新试算并查看结果/, exact: true }).click()
    await page.getByLabel('指标试算多粒度结果').waitFor({ timeout: 90000 })
    const snapshot = await page.locator('.editor-page').evaluate(node => {
      let vm = node.__vueParentComponent
      while (vm && vm.type.__name !== 'IndicatorEditor') vm = vm.parent
      return { results: vm.setupState.indicatorTrialRows, formula: vm.setupState.indicatorWorkflow }
    })
    check(`公式${index + 1}页面试算不丢失结果`, snapshot.results.length === 1, snapshot.results)
    check(`公式${index + 1}页面试算与已独立核验数值一致`, close(snapshot.results[0]?.resultValue ?? snapshot.results[0]?.value, indicator.expected), { results: snapshot.results, expected: indicator.expected })
    await save(`公式页面试算${index + 1}`, snapshot)
  })
} finally {
  check('交互压力和公式试算无运行异常', errors.length === 0, errors)
  await save('浏览器交互明细', { heapSamples, errors, requests })
  await browser.close()
  await finish('浏览器交互', { persistState: false })
}
