import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, api, origin, folder, check, run, save, finish } from './comprehensive-client.mjs'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE)('playwright')
assert.ok(process.env.IDMP_DEPARTMENT_PASSWORD, '请设置真实科室测试账号密码 IDMP_DEPARTMENT_PASSWORD')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const indicator = '102027642460332607', version = '102027642460514841'
const title = '患者入院48小时内转科的比例'
const cases = [
  { name: '一月', type: '月度', start: '2026-01', end: '2026-01', exclusiveEnd: '2026-02-01', display: '0.41%' },
  { name: '一至二月', type: '自定义区间', start: '2026-01', end: '2026-02', exclusiveEnd: '2026-03-01', display: '0.49%' },
  { name: '一至三月', type: '自定义区间', start: '2026-01', end: '2026-03', exclusiveEnd: '2026-04-01', display: '0.49%' },
  { name: '二至四月', type: '自定义区间', start: '2026-02', end: '2026-04', exclusiveEnd: '2026-05-01', display: '0.54%' },
  { name: '一季度', type: '季度', start: '2026-01', end: '2026-03', exclusiveEnd: '2026-04-01' }
]
async function choosePeriod(page, sample) {
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name: sample.type, exact: true }).click()
  async function fill(id, value) {
    const input = page.getByTestId(id).locator('input')
    await input.fill(value); await input.press('Enter'); await input.press('Tab')
  }
  const monthText = value => `${value.slice(0, 4)} 年 ${value.slice(5, 7)} 月`
  if (sample.type === '月度') await fill('dashboard-period-month', monthText(sample.start))
  else if (sample.type === '季度') {
    await fill('dashboard-period-year', '2026 年')
    await page.getByTestId('dashboard-period-quarter').click()
    await page.getByRole('option', { name: '第 1 季度', exact: true }).click()
  } else {
    await fill('dashboard-period-start', monthText(sample.start)); await fill('dashboard-period-end', monthText(sample.end))
  }
  if (await page.getByTestId('dashboard-period-apply').isEnabled()) await page.getByTestId('dashboard-period-apply').click()
  await page.waitForFunction(({ title, sample }) => {
    const node = [...document.querySelectorAll('[data-testid="binding-widget"]')].find(node => node.textContent.includes(title))
    let vm = node?.__vueParentComponent
    while (vm && vm.type.__name !== 'BindingWidget') vm = vm.parent
    const row = vm?.setupState.dataset?.rows?.[0]
    return row?.periodStart?.slice(0, 10) === `${sample.start}-01` && row?.periodEnd?.slice(0, 10) === sample.exclusiveEnd
  }, { title, sample }, { timeout: 90000 })
}
async function analysisState(page) {
  await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
    return s && !s.analysisLoading && !s.rangeSummaryLoading && (s.rangeSummary || s.rangeSummaryErrorMessage)
  }, null, { timeout: 90000 })
  return page.locator('.indicator-analysis').evaluate(node => {
    const s = node.__vueParentComponent.setupState
    return { range: s.reportPeriodRange, mode: s.reportQueryMode, primary: s.primaryMetric, result: s.rangeSummary,
      error: s.analysisErrorMessage, rangeError: s.rangeSummaryErrorMessage }
  })
}
const evidence = []
try {
  const analyst = (await api('POST', '/auth/login', { username: process.env.IDMP_DEPARTMENT_USERNAME || '300112', password: process.env.IDMP_DEPARTMENT_PASSWORD }, { token: '' })).accessToken
  for (const [name, id, versionId, widget] of [
    ['死亡率', '102027642460761108', '102027642460761114', 'dashboard-widget-1790681712300-4'],
    ['转科比例', '102027642461313070', '102027642461313071', 'dashboard-widget-1791798674947-4'],
    ['中药费用比例', '102027642462358147', '102027642462358159', 'dashboard-widget-1791875881995-2']
  ]) await run(`${name}新正式区间接口科室隔离`, async () => {
    const board = (await api('POST', '/analysis/dashboards/1189225114584501123/query', {
      periodStart: '2026-01-01', periodEnd: '2026-04-01', granularity: 'CUSTOM', responseFormat: 'FULL', widgetCodes: [widget]
    }, { token: analyst })).widgets[widget]
    const result = await api('GET', `/analysis/indicators/${id}/range-summary?indicatorVersionId=${versionId}&periodStart=2026-01-01&periodEnd=2026-03-31&granularity=CUSTOM`, undefined, { token: analyst })
    const row = board.rows[0]
    check(`${name}区间接口只使用本科室结果`, board.rows.length === 1 && result.value === row.value && result.numeratorValue === row.numeratorValue && result.denominatorValue === row.denominatorValue, { result, row })
    if (name === '转科比例') check('转科比例使用已核对的三个月科室正式结果', result.numeratorValue === 8 + 2 + 4 && result.denominatorValue === 753 + 550 + 891 && result.displayValue === '0.64%', { numerator: result.numeratorValue, denominator: result.denominatorValue, display: result.displayValue })
    const unscoped = await api('GET', `/analysis/indicators/${id}/range-summary?indicatorVersionId=${versionId}&periodStart=2026-01-01&periodEnd=2026-03-31`, undefined, { token: analyst, allowError: true })
    check(`${name}旧无隔离区间入口仍被拒绝`, unscoped.http === 403, unscoped.message)
  })
  for (const role of [{ name: '管理员', token: admin }, { name: '科室用户', token: analyst }]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    await page.addInitScript(token => localStorage.setItem('idmp_access_token', token), role.token)
    for (const sample of cases) await run(`${role.name}${sample.name}看板跳转分析`, async () => {
      await page.goto(`${origin}/dashboard?id=1189225114584501123`)
      await page.getByTestId('dashboard-canvas').waitFor()
      await page.waitForFunction(() => {
        let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
        while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
        return vm?.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
      })
      await choosePeriod(page, sample)
      const widget = page.getByTestId('binding-widget').filter({ has: page.getByText(title, { exact: true }) })
      const before = await widget.evaluate(node => {
        let vm = node.__vueParentComponent
        while (vm && vm.type.__name !== 'BindingWidget') vm = vm.parent
        return vm.setupState.dataset.rows[0]
      })
      const requests = []
      const onRequest = r => { if (r.url().includes('/api/v1/') && /\/analysis\?|\/range-summary\?|\/query$/.test(r.url())) requests.push({ url: r.url(), body: r.postData() }) }
      page.on('request', onRequest)
      await widget.click()
      await page.waitForURL('**/analysis?**')
      const after = await analysisState(page)
      page.off('request', onRequest)
      const label = `${role.name}${sample.name}`
      check(`${label}实际点击进入分析且没有粒度报错`, !after.error && !after.rangeError && after.mode === 'FORMAL', after)
      check(`${label}分子分母及指标值与看板完全一致`, after.result?.numeratorValue === before.numeratorValue && after.result?.denominatorValue === before.denominatorValue && after.result?.value === before.value && after.primary.value === before.displayValue, { before, after })
      check(`${label}结束日期没有多算一天`, new Date(`${after.range[1]}T00:00:00Z`).getTime() + 86400000 === new Date(`${sample.exclusiveEnd}T00:00:00Z`).getTime(), after.range)
      check(`${label}没有向正式分析传CUSTOM或偷偷即时查源`, requests.every(request => !request.url.includes('/analysis?') || new URL(request.url).searchParams.get('granularity') !== 'CUSTOM') && !requests.some(request => /\/indicator-versions\/.*\/query$/.test(request.url)), requests)
      if (sample.display) check(`${label}显示值符合已核对正式结果`, after.primary.value === sample.display, after.primary)
      await page.screenshot({ path: `${folder}/${role.name}${sample.name}看板分析跳转.png`, fullPage: true })
      evidence.push({ role: role.name, sample, before, after, route: page.url(), requests })
    })
    if (role.name === '管理员') {
      await run('旧自定义链接恢复及显式即时查询', async () => {
        await page.goto(`${origin}/analysis?indicator=${indicator}&periodStart=2026-01-01&periodEnd=2026-04-01&granularity=CUSTOM`)
        const legacy = await analysisState(page)
        check('旧CUSTOM链接不报错且不多算四月一日', !legacy.error && legacy.primary.value === '0.49%' && legacy.range[1] === '2026-03-31', legacy)
        await page.locator('[aria-label="报告期查询方式"] .el-radio-button').filter({ hasText: '即时计算' }).click()
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState.rangeSummary?.executionMode === 'AD_HOC_SOURCE')
        const instant = await analysisState(page)
        check('只有显式切换即时计算才使用整段源数据去重', instant.result.numeratorValue === 208 && instant.result.denominatorValue === 39990 && instant.primary.value === '0.52%' && instant.range[1] === '2026-03-31', instant)
        await page.reload()
        check('刷新保持显式选择的即时查询模式及日期', (await analysisState(page)).primary.value === '0.52%')
        await page.locator('[aria-label="报告期查询方式"] .el-radio-button').filter({ hasText: '正式结果' }).click()
        const inputs = page.locator('[aria-label="报告期范围"] input')
        await inputs.nth(0).fill('2026-02-01')
        await inputs.nth(1).fill('2026-04-30')
        await inputs.nth(1).press('Enter')
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState.rangeSummary?.periodEnd === '2026-04-30')
        const changed = await analysisState(page)
        check('分析页重新选择区间仍按正式口径并更新数值', changed.mode === 'FORMAL' && changed.primary.value === '0.54%' && changed.result.numeratorValue === 162 && changed.result.denominatorValue === 30008, changed)
      })
      await run('没有正式结果不借用最新月', async () => {
        await page.goto(`${origin}/analysis?indicator=${indicator}&periodStart=2027-01-01&periodEnd=2027-03-31&granularity=MONTHLY&summaryMode=FORMAL&summaryGranularity=CUSTOM`)
        const missing = await analysisState(page)
        check('缺少正式区间时显示不可用而非其他月份数值', missing.primary.value === '-' && Boolean(missing.rangeError || missing.result?.status !== 'READY'), missing)
      })
      await run('移动端查询条件', async () => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(`${origin}/analysis?indicator=${indicator}&periodStart=2026-01-01&periodEnd=2026-03-31&granularity=MONTHLY&summaryMode=FORMAL&summaryGranularity=CUSTOM`)
        const mobile = await analysisState(page)
        check('移动端正式区间结果可用且无横向溢出', mobile.primary.value === '0.49%' && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), mobile)
        await page.screenshot({ path: `${folder}/移动端正式区间分析.png`, fullPage: true })
        await page.setViewportSize({ width: 1600, height: 1000 })
      })
    }
    await page.close()
  }
} finally {
  await save('看板分析跳转真实链路证据', evidence)
  await browser.close()
  await finish('看板分析跳转真实链路验收', { persistState: false })
}
