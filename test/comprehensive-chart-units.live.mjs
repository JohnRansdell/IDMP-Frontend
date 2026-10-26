import { createRequire } from 'node:module'
import { admin, origin, state, check, run, save, finish, folder } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = [], snapshots = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${origin}/dashboard?id=${state.boardId}`)
  for (const [month, width] of [[1, 1440], [2, 768], [3, 390]]) await run(`${month}月${width}像素真实看板百分比`, async () => {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByTestId('dashboard-canvas').evaluate((node, month) => {
      let vm = node.__vueParentComponent
      while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
      vm.setupState.applyRemotePeriodSelection({ type: 'MONTHLY', month: `2026-0${month}` })
    }, month)
    await page.waitForFunction(() => {
      let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
      while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
      return vm && vm.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
    })
    await page.waitForLoadState('networkidle')
    const snapshot = await page.locator('[data-testid="binding-widget"]').evaluateAll(nodes => nodes.map(node => {
      let vm = node.__vueParentComponent
      while (vm && vm.type.__name !== 'BindingWidget') vm = vm.parent
      if (!vm) return null
      const s = vm.setupState, model = s.model
      if (model.status !== 'ready' || !['bar', 'line', 'pie'].includes(s.kind)) return null
      const option = s.option
      const axes = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]
      return { title: vm.props.title, kind: s.kind, units: model.series.map(series => series.unit),
        axes: axes.map(axis => ({ formatted: axis?.axisLabel?.formatter?.(0.01) ?? '无百分比格式' })),
        series: option.series.map((series, index) => {
          const first = series.data.find(point => (point && typeof point === 'object' ? point.value : point) != null)
          const raw = first && typeof first === 'object' ? first.value : first
          const formatter = series.tooltip?.valueFormatter || option.tooltip?.valueFormatter
          return { raw, unit: model.series[index]?.unit, visible: formatter?.(raw), original: model.series[index]?.values.find(value => value != null) }
        }) }
    }).filter(Boolean))
    check(`${month}月实际包含柱图趋势图构成图`, ['bar', 'line', 'pie'].every(kind => snapshot.some(item => item.kind === kind)), snapshot.map(item => item.kind))
    for (const chart of snapshot) for (const series of chart.series) {
      check(`${month}月${chart.title}原始数值未被显示格式修改`, series.raw === series.original, series)
      const expected = series.unit === 'PERCENT' ? (series.raw == null ? '—' : `${(series.raw * 100).toFixed(2)}%`) : null
      if (expected) check(`${month}月${chart.title}悬浮值与百分比口径一致`, series.visible === expected, series)
    }
    const mortality = snapshot.filter(item => item.title.includes('住院死亡率'))
    check(`${month}月死亡率纵轴明确使用百分比`, mortality.length === 2 && mortality.every(item => item.axes[0].formatted === '1.00%'), mortality)
    const dual = snapshot.find(item => item.title.includes('中药') && item.kind === 'line')
    check(`${month}月双轴仅比率轴百分比费用轴不缩放`, dual?.axes[0].formatted === '1.00%' && dual?.axes[1].formatted === '无百分比格式' && !dual.series[1].visible.includes('%'), dual)
    snapshots.push({ month, width, snapshot })
    await page.screenshot({ path: `${folder}/看板百分比修复${month}月${width}.png`, fullPage: true })
  })
  check('真实看板百分比修复无运行异常', errors.length === 0, errors)
} finally {
  await save('看板百分比真实验证明细', { snapshots, errors })
  await browser.close()
  await finish('看板百分比真实验证', { persistState: false })
}
