import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, api, origin, folder, save } from './comprehensive-client.mjs'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const evidence = []
const discrepancies = []
assert.ok(process.env.IDMP_DEPARTMENT_PASSWORD, '请配置本科室测试账号密码')
const ordinary = (await api('POST', '/auth/login', { username: '300112', password: process.env.IDMP_DEPARTMENT_PASSWORD }, { token: '' })).accessToken
const scenarios = [
  { name: '管理员一月死亡率历史排名', indicator: '102027642460761108', version: '102027642460761114', grain: 'MONTHLY', label: '2026年1月', start: '2026-01-01', end: '2026-01-31', exclusiveEnd: '2026-02-01' },
  { name: '管理员三月转科比例排名', indicator: '102027642461313070', version: '102027642461313071', grain: 'MONTHLY', label: '2026年3月', start: '2026-03-01', end: '2026-03-31', exclusiveEnd: '2026-04-01' },
  { name: '管理员一季度死亡率排名', indicator: '102027642460761108', version: '102027642460761114', grain: 'QUARTERLY', label: '2026年第1季度', start: '2026-01-01', end: '2026-03-31', exclusiveEnd: '2026-04-01' },
  { name: '本科室一月死亡率历史排名', indicator: '102027642460761108', version: '102027642460761114', grain: 'MONTHLY', label: '2026年1月', start: '2026-01-01', end: '2026-01-31', exclusiveEnd: '2026-02-01', token: ordinary }
]
try {
  for (const sample of scenarios) {
    const token = sample.token || admin
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    await context.addInitScript(value => localStorage.setItem('idmp_access_token', value), token)
    const page = await context.newPage()
    const requests = [], errors = []
    page.on('request', request => { if (request.url().includes('/drill/search')) requests.push({ url: request.url(), payload: request.postDataJSON() }) })
    page.on('pageerror', error => errors.push(error.message))
    const query = new URLSearchParams({ indicator: sample.indicator, indicatorVersionId: sample.version,
      granularity: sample.grain, summaryGranularity: sample.grain, periodStart: sample.start, periodEnd: sample.end, 'filter.OUT_DEPT_CODE': '15' })
    const expected = await api('GET', `/analysis/indicators/${sample.indicator}/range-summary?${query}`, undefined, { token })
    assert.equal(expected.status, 'READY')
    await page.goto(`${origin}/analysis?${query}`)
    await page.getByRole('tab', { name: '科室排名', exact: true }).click()
    await page.waitForFunction(() => {
      const state = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return state && !state.analysisLoading && !state.rankLoading && state.rankInitialized
    }, null, { timeout: 90000 })
    if (sample.grain === 'QUARTERLY') {
      await page.locator('.rank-period-toolbar').getByText('季度', { exact: true }).click()
      await page.waitForFunction(() => {
        const state = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
        return !state.rankLoading && state.rankGranularity === 'QUARTERLY'
      }, null, { timeout: 90000 })
    }
    await page.getByRole('combobox', { name: '排名统计周期' }).click()
    await page.getByRole('option', { name: sample.label, exact: true }).click()
    await page.waitForFunction(start => {
      const state = document.querySelector('.indicator-analysis')?.__vueParentComponent.setupState
      return !state.rankLoading && state.rankSelectedPeriod.startsWith(start)
    }, sample.start, { timeout: 90000 })
    const rank = await page.locator('.indicator-analysis').evaluate(node => {
      const state = node.__vueParentComponent.setupState
      return { rows: state.rankTableData, error: state.rankErrorMessage }
    })
    assert.equal(rank.error, '')
    assert.equal(rank.rows.length, 1)
    assert.equal(rank.rows[0].departmentCode, '15')
    for (const [field, expectedField] of [['numerator', 'numeratorValue'], ['denominator', 'denominatorValue']]) {
      const actual = Number(rank.rows[0][field].replaceAll(',', ''))
      if (actual !== Number(expected[expectedField])) discrepancies.push({ name: sample.name, field, ranking: actual, formal: expected[expectedField], entry: rank.rows[0].drillContext })
    }
    await page.getByRole('button', { name: '查看明细', exact: true }).click()
    await page.locator('.drill-explorer').waitFor()
    await page.waitForFunction(() => {
      const state = document.querySelector('.drill-explorer')?.__vueParentComponent.setupState
      return state && !state.loading && (state.result.context.currentLevel || state.errorMessage)
    }, null, { timeout: 90000 })
    const drill = await page.locator('.drill-explorer').evaluate(node => {
      const state = node.__vueParentComponent.setupState
      return { result: state.result, error: state.errorMessage, props: { indicatorVersionId: node.__vueParentComponent.props.indicatorVersionId, snapshotId: node.__vueParentComponent.props.snapshotId } }
    })
    assert.equal(drill.error, '')
    assert.equal(drill.result.context.indicatorVersionId, sample.version)
    assert.equal(drill.result.context.periodStart.slice(0, 10), sample.start)
    assert.equal(drill.result.context.periodEnd.slice(0, 10), sample.exclusiveEnd)
    assert.ok(drill.result.records.length > 0)
    assert.equal(Number(drill.result.summary.numerator), Number(expected.numeratorValue))
    assert.equal(Number(drill.result.summary.denominator), Number(expected.denominatorValue))
    assert.ok(Math.abs(Number(drill.result.summary.indicatorValue) - Number(expected.value)) < 1e-8)
    const request = requests.at(-1).payload
    assert.equal(String(request.filters.OUT_DEPT_CODE), '15')
    assert.ok(!Object.keys(request.parentKeys).some(key => /NAME/.test(key)))
    if (drill.props.snapshotId) assert.equal(request.snapshotId, drill.props.snapshotId)
    if (drill.result.pageInfo.total > drill.result.pageInfo.pageSize) {
      await page.locator('.drill-pagination .btn-next').click()
      await page.waitForFunction(() => {
        const state = document.querySelector('.drill-explorer')?.__vueParentComponent.setupState
        return !state.loading && (state.result.pageInfo.pageNum === 2 || state.errorMessage)
      }, null, { timeout: 90000 })
      const second = await page.locator('.drill-explorer').evaluate(node => ({ result: node.__vueParentComponent.setupState.result, error: node.__vueParentComponent.setupState.errorMessage }))
      assert.equal(second.error, '')
      assert.equal(Number(second.result.summary.denominator), Number(expected.denominatorValue))
      assert.equal(requests.at(-1).payload.pageNum, 2)
      assert.deepEqual(requests.at(-1).payload.parentKeys, request.parentKeys)
      assert.deepEqual(requests.at(-1).payload.filters, request.filters)
    }
    assert.deepEqual(errors, [])
    evidence.push({ name: sample.name, expected, rank, drill, requests })
    await page.screenshot({ path: `${folder}/${sample.name}.png`, fullPage: true })
    console.log(discrepancies.some(item => item.name === sample.name) ? '上下文通过，数值存在差异' : '通过', sample.name, { numerator: expected.numeratorValue, denominator: expected.denominatorValue })
    await context.close()
  }
} finally {
  await save('排名下钻上下文验收', evidence)
  await save('排名与正式汇总数值差异', discrepancies)
  await browser.close()
}
assert.deepEqual(discrepancies, [], '排名与正式结果不一致，不能视为数值验收通过')
