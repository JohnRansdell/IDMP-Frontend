import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, api, origin, folder, check, run, save, finish } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const indicator = '102027642460761108', version = '102027642460761114'
const title = '住院死亡率（质量安全看板）'
const evidence = []
async function state(page, ready = true) {
  if (ready) await page.waitForFunction(() => {
    const s = document.querySelector('.indicator-analysis')?.__vueParentComponent?.setupState
    return s && !s.analysisLoading && !s.rangeSummaryLoading && !s.trendLoading && (s.rangeSummary || s.rangeSummaryErrorMessage)
  }, null, { timeout: 90000 })
  return page.locator('.indicator-analysis').evaluate(node => {
    const s = node.__vueParentComponent.setupState
    return { range: s.reportPeriodRange, mode: s.reportQueryMode, dirty: s.reportDirty,
      result: s.rangeSummary, primary: s.primaryMetric, explanation: s.indicatorDataExplanation,
      filters: s.reportFilters, overview: s.currentReportOverview, formalOverview: s.backendAnalysis?.overview,
      error: s.rangeSummaryErrorMessage || s.analysisErrorMessage, exportable: s.canExportPdf }
  })
}
async function boardReady(page) {
  await page.waitForFunction(() => {
    let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
    while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
    return vm?.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
  }, null, { timeout: 90000 })
}
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
  for (const codes of [['15'], ['5'], ['16'], ['15', '16']]) await run(`真实科室筛选${codes.join('、')}`, async () => {
    await page.goto(`${origin}/dashboard?id=1189225114584501123`)
    await boardReady(page)
    await page.getByTestId('dashboard-period-type').click()
    await page.getByRole('option', { name: '月度', exact: true }).click()
    const input = page.getByTestId('dashboard-period-month').locator('input')
    await input.fill('2026 年 01 月'); await input.press('Enter'); await input.press('Tab')
    if (await page.getByTestId('dashboard-period-apply').isEnabled()) await page.getByTestId('dashboard-period-apply').click()
    await boardReady(page)
    const filter = page.locator('[data-testid="dashboard-filter-bar"] [data-filter-field="OUT_DEPT_CODE"]')
    await filter.locator('summary').click()
    await filter.getByRole('button', { name: '清空', exact: true }).click()
    for (const code of codes) await filter.locator(`input[data-filter-option="${code}"]`).check()
    const queryResponse = page.waitForResponse(r => r.url().includes('/analysis/dashboards/') && r.url().endsWith('/query') && r.request().method() === 'POST')
    await filter.getByRole('button', { name: '确定', exact: true }).click()
    await queryResponse; await boardReady(page)
    const widget = page.getByTestId('binding-widget').filter({ has: page.getByText(title, { exact: true }) })
    const before = await widget.evaluate(node => {
      let vm = node.__vueParentComponent
      while (vm && vm.type.__name !== 'BindingWidget') vm = vm.parent
      return vm.setupState.dataset.rows[0]
    })
    assert.equal(before.periodStart.slice(0, 10), '2026-01-01')
    await widget.click(); await page.waitForURL('**/analysis?**')
    const after = await state(page)
    check(`科室${codes}跳转保留全部编码`, JSON.stringify(new URL(page.url()).searchParams.getAll('filter.OUT_DEPT_CODE').sort()) === JSON.stringify([...codes].sort()), page.url())
    check(`科室${codes}分子分母及原始指标值完全一致`, !after.error && before.value === after.result?.value && before.numeratorValue === after.result?.numeratorValue && before.denominatorValue === after.result?.denominatorValue, { before, after })
    check(`科室${codes}说明使用当前汇总而非月度回退`, after.overview.numerator === after.result?.numeratorValue && after.overview.denominator === after.result?.denominatorValue, after)
    if (codes.length === 1 && codes[0] === '16') check('呼吸科一月死亡率仍为一除以四百二十九', after.result?.numeratorValue === 1 && after.result?.denominatorValue === 429 && after.primary.value === '0.23%', after)
    evidence.push({ codes, before, after })
    await page.screenshot({ path: `${folder}/科室${codes.join('-')}筛选分析.png`, fullPage: true })
  })
  await run('多月说明与真实PDF追溯', async () => {
    await page.goto(`${origin}/analysis?indicator=${indicator}&indicatorVersionId=${version}&periodStart=2026-01-01&periodEnd=2026-03-31&granularity=MONTHLY&summaryMode=FORMAL&summaryGranularity=CUSTOM&filter.OUT_DEPT_CODE=5`)
    const current = await state(page)
    check('多月说明分子分母等于当前区间', current.overview.numerator === current.result.numeratorValue && current.overview.denominator === current.result.denominatorValue, current)
    await page.getByRole('button', { name: '计算诊断', exact: true }).click()
    const explanation = await page.locator('.diagnostics-explanation').innerText()
    check('诊断界面展示真实除法公式', /[÷/]/.test(explanation), explanation)
    await page.locator('.el-drawer__close-btn').click()
    const request = page.waitForRequest(r => r.url().includes('/export/pdf'), { timeout: 60000 })
    const download = page.waitForEvent('download', { timeout: 60000 })
    await page.getByRole('button', { name: '导出PDF', exact: true }).click()
    const body = (await request).postDataJSON()
    const file = await download
    await file.saveAs(`${folder}/科室多月正式结果分析.pdf`)
    const rows = body.sections.find(s => s.title === '计算口径与结果追溯').rows
    const ids = rows.find(r => r[0] === '正式结果来源 ID')?.[1]
    check('PDF来源精确引用当前区间的全部正式结果', ids === current.result.sourceResultIds.join('、') && current.result.sourceResultIds.length > 1, { ids, sourceResultIds: current.result.sourceResultIds })
    check('PDF概览值与页面完全相同', body.sections[0].rows[0][1] === current.primary.value, body.sections[0])
    check('PDF明确保留科室筛选范围且不借用单月批次', body.metadata.some(item => item.label === '报告筛选范围' && item.value.includes('OUT_DEPT_CODE') && item.value.includes('5')) && rows.find(r => r[0] === '计算批次')?.[1] === '-', body.metadata)
    evidence.push({ pdf: body, current })
  })
  await run('编辑报告期不得回退旧值', async () => {
    const inputs = page.locator('[aria-label="报告期范围"] input')
    await inputs.nth(0).fill('2026-02-01'); await inputs.nth(1).fill('2026-04-30'); await inputs.nth(1).press('Enter'); await inputs.nth(1).press('Tab')
    const pending = await state(page, false)
    check('修改后概览和说明清空并禁止导出', pending.dirty && pending.primary.value === '-' && Object.keys(pending.overview).length === 0 && !pending.exportable, pending)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState.rangeSummary?.periodStart === '2026-02-01')
    const refreshed = await state(page)
    check('重新查询使用新日期且保留科室', !refreshed.dirty && !refreshed.error && refreshed.result.periodEnd === '2026-04-30' && refreshed.filters.OUT_DEPT_CODE === '5', refreshed)
  })
  await run('同指标路由与浏览器历史同步', async () => {
    const before = page.url()
    const next = new URL(before)
    next.searchParams.set('periodStart', '2026-01-01'); next.searchParams.set('periodEnd', '2026-01-31')
    next.searchParams.set('filter.OUT_DEPT_CODE', '15')
    await page.locator('.indicator-analysis').evaluate((node, path) => node.__vueParentComponent.appContext.config.globalProperties.$router.push(path), next.pathname + next.search)
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return s?.rangeSummary?.periodEnd === '2026-01-31' && s.reportFilters.OUT_DEPT_CODE === '15'
    })
    check('同指标只改日期与筛选也重新加载', !(await state(page)).error)
    await page.goBack()
    await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState.rangeSummary?.periodEnd === '2026-04-30')
    check('后退恢复日期和科室', (await state(page)).filters.OUT_DEPT_CODE === '5')
    await page.goForward()
    await page.waitForFunction(() => document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState.rangeSummary?.periodEnd === '2026-01-31')
    check('前进恢复新科室', (await state(page)).filters.OUT_DEPT_CODE === '15')
  })
  await run('科室筛选贯穿历史排名及医生下钻', async () => {
    const requests = []
    page.on('request', request => {
      if (request.url().includes('/api/v1/analysis/') && /analysis\?|drill/.test(request.url())) requests.push(request.url())
    })
    await page.getByRole('tab', { name: '科室排名', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return s && !s.rankLoading && (s.rankInitialized || s.rankErrorMessage)
    })
    assert.equal(await page.locator('.indicator-analysis').evaluate(node => node.__vueParentComponent.setupState.rankErrorMessage), '')
    await page.getByRole('combobox', { name: '排名统计周期' }).click()
    await page.getByRole('option', { name: '2026年1月', exact: true }).click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return !s.rankLoading && s.rankSelectedPeriod?.startsWith('2026-01-01')
    })
    const rank = await page.locator('.indicator-analysis').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { rows: s.rankTableData, error: s.rankErrorMessage }
    })
    check('一月科室排名只含所选骨科', !rank.error && rank.rows.length === 1 && rank.rows[0].departmentCode === '15', rank)
    check('旧月份排名请求不多算二月一日并保留筛选', requests.some(url => {
      const params = new URL(url).searchParams
      return params.get('periodStart')?.startsWith('2026-01-01') && params.get('periodEnd') === '2026-01-31' && params.get('filter.OUT_DEPT_CODE') === '15'
    }), requests)
    await page.getByRole('button', { name: '查看明细', exact: true }).click()
    await page.locator('.drill-explorer').waitFor()
    await page.waitForFunction(() => {
      const s = document.querySelector('.drill-explorer')?.__vueParentComponent.setupState
      return s && !s.loading
    })
    const drill = await page.locator('.drill-explorer').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { error: s.errorMessage, result: s.result, filters: node.__vueParentComponent.props.startFilters }
    })
    check('排名进入医生下钻不报错且保留本科室范围', !drill.error && String(drill.filters.OUT_DEPT_CODE) === '15' && drill.result.records?.length > 0, drill)
    const original = evidence.find(item => item.codes?.length === 1 && item.codes[0] === '15').before
    check('排名与医生层汇总的分子分母逐项等于原看板', Number(rank.rows[0].numerator.replaceAll(',', '')) === original.numeratorValue
      && Number(rank.rows[0].denominator.replaceAll(',', '')) === original.denominatorValue
      && drill.result.summary.numeratorValue === original.numeratorValue && drill.result.summary.denominatorValue === original.denominatorValue, { original, rank, summary: drill.result.summary })
    assert.equal(drill.result.pageInfo.total, 22)
    await page.locator('.drill-pagination .btn-next').click()
    await page.waitForFunction(() => {
      const s = document.querySelector('.drill-explorer')?.__vueParentComponent.setupState
      return !s.loading && s.result.pageInfo.pageNum === 2
    })
    const nextPage = await page.locator('.drill-explorer').evaluate(node => {
      const s = node.__vueParentComponent.setupState
      return { result: s.result, error: s.errorMessage, filters: node.__vueParentComponent.props.startFilters }
    })
    check('医生第二页仍限骨科且整体汇总不变', !nextPage.error && nextPage.result.records.length === 2
      && String(nextPage.filters.OUT_DEPT_CODE) === '15' && nextPage.result.summary.denominatorValue === original.denominatorValue, nextPage)
    evidence.push({ rank, drill, requests })
  })
  await page.close()
  await run('科室用户直接进入分析及越权拒绝', async () => {
    assert.ok(process.env.IDMP_DEPARTMENT_PASSWORD)
    const token = (await api('POST', '/auth/login', { username: '300112', password: process.env.IDMP_DEPARTMENT_PASSWORD }, { token: '' })).accessToken
    const scoped = await browser.newPage()
    await scoped.addInitScript(t => localStorage.setItem('idmp_access_token', t), token)
    await scoped.goto(`${origin}/analysis?indicator=102027642460332607`)
    await scoped.waitForFunction(() => {
      const s = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return s && !s.analysisLoading && s.reportPeriodRange?.length === 2
    })
    const initial = await state(scoped, false)
    check('普通入口默认正式查询且回填包含式结束日', initial.mode === 'FORMAL' && new Date(`${initial.range[1]}T00:00:00Z`).getTime() + 86400000 === new Date(`${initial.formalOverview.periodEnd.slice(0, 10)}T00:00:00Z`).getTime(), initial)
    await scoped.getByRole('button', { name: '查询', exact: true }).click()
    check('科室用户默认模式可正常查询', !(await state(scoped)).error)
    const path = `/analysis/indicators/${indicator}/range-summary?indicatorVersionId=${version}&periodStart=2026-01-01&periodEnd=2026-01-31&granularity=MONTHLY&filter.OUT_DEPT_CODE=`
    const own = await api('GET', path + '15', undefined, { token })
    const other = await api('GET', path + '5', undefined, { token, allowError: true })
    check('本科室结果可见而伪造其他科室被拒绝', own.status === 'READY' && other.http === 403, { own, other })
    await scoped.close()
  })
} finally {
  await save('筛选报告口径真实浏览器证据', evidence)
  await browser.close()
  await finish('筛选报告口径真实浏览器验收', { persistState: false })
}
