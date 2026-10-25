import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, api, origin, folder, check, run, save, finish } from './comprehensive-client.mjs'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const periods = [
  { label: '一月', selection: { type: 'MONTHLY', month: '2026-01' }, start: '2026-01-01', end: '2026-02-01' },
  { label: '一至三月', selection: { type: 'CUSTOM', startMonth: '2026-01', endMonth: '2026-03' }, start: '2026-01-01', end: '2026-04-01' },
  { label: '二至四月', selection: { type: 'CUSTOM', startMonth: '2026-02', endMonth: '2026-04' }, start: '2026-02-01', end: '2026-05-01' }
]
const specs = ['住院死亡率（质量安全看板）科室对比', '患者入院48小时内转科比例（组合粒度与多维下钻验收）构成', '住院中药费用占药品费用比例（SQL复合因子导入验收1791270897300）构成']
const evidence = []
try {
  const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
  for (const role of [{ name: '管理员', token: admin, dept: '16' }, { name: '本科室用户', token: analyst, dept: '15' }]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' })
    await page.addInitScript(token => localStorage.setItem('idmp_access_token', token), role.token)
    await page.goto(`${origin}/dashboard?id=1189225114584501123`)
    await page.getByTestId('dashboard-canvas').waitFor()
    for (const period of periods) {
      await page.waitForFunction(() => {
        let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
        while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
        return vm?.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
      })
      await page.getByTestId('dashboard-canvas').evaluate((node, selection) => {
        let vm = node.__vueParentComponent
        while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
        vm.setupState.applyRemotePeriodSelection(selection)
      }, period.selection)
      // Await actual returned data, not networkidle before the debounce starts.
      await page.waitForFunction(({ period, specs }) => {
        const nodes = [...document.querySelectorAll('[data-testid="binding-widget"]')].filter(node => specs.includes(node.querySelector('h2')?.textContent))
        return nodes.length === 3 && nodes.every(node => {
          let vm = node.__vueParentComponent
          while (vm && vm.type.__name !== 'BindingWidget') vm = vm.parent
          const data = vm?.setupState.dataset
          return data?.rows?.length && data.periodContext?.periodStart === period.start && data.periodContext?.periodEnd === period.end && data.rows.every(row => row.periodStart?.slice(0, 10) === period.start && row.periodEnd?.slice(0, 10) === period.end)
        })
      }, { period, specs }, { timeout: 90000 })
      for (const title of specs) await run(`${role.name}${period.label}${title}实际下钻`, async () => {
        const widget = page.getByTestId('binding-widget').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
        await widget.scrollIntoViewIfNeeded()
        await widget.locator('canvas').first().waitFor()
        const input = await widget.locator('.idmp-chart').evaluate(async (node, dept) => {
          const moduleUrl = performance.getEntriesByType('resource').find(item => /\/echarts\.js\?/.test(item.name))?.name
          const echarts = await import(moduleUrl)
          const chart = echarts.getInstanceByDom(node)
          const series = chart.getModel().getSeriesByIndex(0), data = series.getData()
          let index = -1
          for (let i = 0; i < data.count(); i++) {
            const point = data.getRawDataItem(i), values = point.dimensionValues || {}
            if (String(values.out_dept_code ?? values.OUT_DEPT_CODE ?? values['科室']) === dept) { index = i; break }
          }
          if (index < 0) throw new Error('图表缺少目标科室')
          const point = data.getRawDataItem(index), layout = data.getItemLayout(index), rect = node.getBoundingClientRect()
          if (Number(point.value) === 0) {
            // Zero-height bars have no hit area. Exercise the same chart event without claiming a mouse hit.
            chart.trigger('click', { componentType: 'series', seriesType: series.subType, seriesIndex: 0, dataIndex: index, name: data.getName(index), data: point })
            return { mode: '零值图形事件', point }
          }
          const angle = (layout.startAngle + layout.endAngle) / 2, radius = (layout.r + layout.r0) / 2
          return { mode: '真实鼠标点击', point, x: rect.x + (series.subType === 'pie' ? layout.cx + Math.cos(angle) * radius : layout.x + layout.width / 2), y: rect.y + (series.subType === 'pie' ? layout.cy + Math.sin(angle) * radius : layout.y + layout.height / 2) }
        }, role.dept)
        const requests = []
        const listener = request => { if (request.url().includes('/drill/search')) requests.push(request.postDataJSON()) }
        page.on('request', listener)
        if (input.mode === '真实鼠标点击') await page.mouse.click(input.x, input.y)
        await widget.getByTestId('backend-chart-drill').waitFor()
        await page.waitForFunction(title => {
          const node = [...document.querySelectorAll('[data-testid="binding-widget"]')].find(node => node.querySelector('h2')?.textContent === title)?.querySelector('[data-testid="backend-chart-drill"]')
          let vm = node?.__vueParentComponent
          while (vm && vm.type.__name !== 'BackendChartDrill') vm = vm.parent
          return vm && !vm.setupState.loading && (vm.setupState.currentEntry || vm.setupState.error)
        }, title, { timeout: 90000 })
        page.off('request', listener)
        const actual = await widget.getByTestId('backend-chart-drill').evaluate(node => {
          let vm = node.__vueParentComponent
          while (vm && vm.type.__name !== 'BackendChartDrill') vm = vm.parent
          return { kind: vm.props.kind, unit: vm.props.unit, error: vm.setupState.error, issue: vm.setupState.chartIssue, result: vm.setupState.currentEntry?.result, root: vm.setupState.root, chart: vm.setupState.chartOption }
        })
        const label = `${role.name}${period.label}${title}`
        check(`${label}下钻成功并保留完整周期`, !actual.error && actual.result?.records.length > 0 && actual.result.context.periodStart.slice(0, 10) === period.start && actual.result.context.periodEnd.slice(0, 10) === period.end, { error: actual.error, context: actual.result?.context })
        check(`${label}图形仍使用指标值`, actual.chart?.series?.[0]?.data?.every(item => {
          const expected = actual.kind === 'pie' ? Number(item.row.indicatorValue) : String(item.row.displayValue).endsWith('%') ? Number(item.row.displayValue.slice(0, -1)) : Number(item.row.indicatorValue) * (actual.unit === '%' ? 100 : 1)
          return Math.abs(item.value - expected) < 1e-8
        }), actual.chart?.series?.[0]?.data?.slice(0, 1))
        if (period.selection.type === 'CUSTOM') check(`${label}请求携带区间`, actual.root?.periodRange?.periodStart === period.start && actual.root?.periodRange?.periodEnd === period.end, requests)
        evidence.push({ role: role.name, period, title, input, requests, actual })
        await widget.screenshot({ path: `${folder}/${role.name}${period.label}${specs.indexOf(title)}下钻.png` })
        await widget.getByRole('button', { name: '返回原图表', exact: true }).click()
        assert.equal(await widget.getByTestId('backend-chart-drill').count(), 0)
      })
    }
    await page.close()
  }
} finally {
  await save('区间下钻实际点击证据', evidence)
  await browser.close()
  await finish('区间下钻浏览器验收', { persistState: false })
}
