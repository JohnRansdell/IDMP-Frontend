import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, sql, admin, origin, folder, save } from './comprehensive-client.mjs'
import { buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

const indicatorId = '102027642461313070', versionId = '102027642461313071'
const endpoint = `/analysis/indicator-versions/${versionId}/instant-summary`
const checks = []
const samples = [
  { name: '自定义一季度全院', start: '2026-01-01', end: '2026-04-01', filters: {} },
  { name: '跨季度本科室', start: '2026-02-01', end: '2026-05-01', filters: { OUT_DEPT_CODE: ['15'] } },
  { name: '跨季度科室多选', start: '2026-02-01', end: '2026-05-01', filters: { OUT_DEPT_CODE: ['15', '16'] } },
  { name: '科室及病种共同筛选', start: '2026-01-01', end: '2026-04-01', filters: { OUT_DEPT_CODE: ['15', '16'], IN_ICD10: ['J18.900'] } }
]
for (const sample of samples) {
  const predicates = [`b.in_date >= '${sample.start}'`, `b.in_date < '${sample.end}'`]
  for (const [field, values] of Object.entries(sample.filters)) predicates.push(`b.${field} IN (${values.map(value => `'${value}'`).join(',')})`)
  const where = predicates.join(' AND ')
  const expected = (await sql('SOURCE', `SELECT (SELECT COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.In_Hospital_ID=t.In_Hospital_ID WHERE ${where} AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48) numerator, (SELECT COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b WHERE ${where}) denominator`, ['numerator', 'denominator']))[0]
  const result = await api('POST', endpoint, { periodStart: sample.start + 'T00:00:00', periodEnd: sample.end + 'T00:00:00', filters: sample.filters })
  assert.equal(result.executionMode, 'AD_HOC_SOURCE')
  assert.deepEqual(result.grainFieldCodes, [])
  assert.equal(result.rows.length, 1)
  const row = result.rows[0]
  assert.equal(Number(row.numeratorValue), Number(expected.numerator))
  assert.equal(Number(row.denominatorValue), Number(expected.denominator))
  if (Number(expected.denominator)) assert.ok(Math.abs(Number(row.value) - Number(expected.numerator) / Number(expected.denominator)) < 1e-8)
  else assert.equal(row.value, null)
  checks.push({ name: sample.name, expected, row })
  console.log('通过', sample.name, expected)
}
assert.ok(process.env.IDMP_DEPARTMENT_PASSWORD, '请设置科室验收账号密码 IDMP_DEPARTMENT_PASSWORD')
const ordinary = await api('POST', '/auth/login', { username: process.env.IDMP_DEPARTMENT_USERNAME || '300112', password: process.env.IDMP_DEPARTMENT_PASSWORD }, { token: '' })
const scopedPayload = { periodStart: '2026-02-01T00:00:00', periodEnd: '2026-05-01T00:00:00' }
const own = await api('POST', endpoint, scopedPayload, { token: ordinary.accessToken })
assert.equal(Number(own.rows[0].numeratorValue), Number(checks[1].expected.numerator))
assert.equal(Number(own.rows[0].denominatorValue), Number(checks[1].expected.denominator))
for (const filters of [{ OUT_DEPT_CODE: ['16'] }, { out_dept_code: ['15', '16'] }]) {
  const denied = await api('POST', endpoint, { ...scopedPayload, filters }, { token: ordinary.accessToken, allowError: true })
  assert.equal(denied.http, 403)
}
checks.push({ name: '普通工号自动限制本科室且拒绝跨科室' })
console.log('通过 普通工号自动限制本科室且拒绝跨科室')
const invalid = await api('POST', endpoint, { ...scopedPayload, filters: { UNKNOWN: ['15'] } }, { allowError: true })
assert.equal(invalid.http, 400)
checks.push({ name: '未知筛选不降级为全院' })

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  for (const sample of [
    { name: '月度正式查询', start: '2026-03-01', end: '2026-04-01', grain: 'MONTHLY' },
    { name: '季度正式查询', start: '2026-01-01', end: '2026-04-01', grain: 'QUARTERLY' },
    { name: '年度正式查询', start: '2026-01-01', end: '2027-01-01', grain: 'YEARLY' },
    { name: '恰好一季度的自定义仍即时查询', start: '2026-01-01', end: '2026-04-01', grain: 'CUSTOM' },
    { name: '自定义科室多选即时查询', start: '2026-02-01', end: '2026-05-01', grain: 'CUSTOM', filters: { OUT_DEPT_CODE: ['15', '16'] } },
    { name: '普通工号自定义即时查询', start: '2026-02-01', end: '2026-05-01', grain: 'CUSTOM', token: ordinary.accessToken }
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), sample.token || admin)
    const page = await context.newPage()
    const requests = [], errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('request', req => { if (/instant-summary|range-summary/.test(req.url())) requests.push({ url: req.url(), body: req.postDataJSON() }) })
    const query = buildIndicatorAnalysisRouteQuery({ indicatorId, indicatorVersionId: versionId }, { periodStart: sample.start, periodEnd: sample.end, granularity: sample.grain, filters: sample.filters })
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : [value]) params.append(key, item)
    const responsePromise = page.waitForResponse(r => r.url().includes(sample.grain === 'CUSTOM' ? 'instant-summary' : 'range-summary'), { timeout: 90000 })
    await page.goto(`${origin}/analysis?${params}`)
    const response = await responsePromise
    assert.equal(response.status(), 200)
    const result = await response.json()
    assert.equal(result.code, 'OK')
    await page.locator('.instant-query-panel').waitFor()
    assert.equal(await page.getByRole('radiogroup', { name: '报告期查询方式' }).count(), 0)
    assert.ok(requests.every(req => req.url.includes(sample.grain === 'CUSTOM' ? 'instant-summary' : 'range-summary')))
    if (sample.filters) assert.deepEqual(requests[0].body.filters, sample.filters)
    if (sample.grain === 'CUSTOM') {
      assert.equal(result.data.executionMode, 'AD_HOC_SOURCE')
      await page.getByText('即时计算', { exact: true }).first().waitFor()
      if (sample.filters) assert.equal(Number(result.data.rows[0].denominatorValue), Number(checks[2].expected.denominator))
    }
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `${folder}/${sample.name}.png`, fullPage: true })
    checks.push({ name: sample.name, requests, result: result.data })
    console.log('通过', sample.name)
    await context.close()
  }
  for (const custom of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
    const page = await context.newPage()
    await page.goto(`${origin}/dashboard?id=1189225114584501123`)
    await page.getByTestId('dashboard-canvas').waitFor()
    await page.getByTestId('dashboard-period-type').click()
    await page.getByRole('option', { name: custom ? '自定义区间' : '月度', exact: true }).click()
    for (const [id, value] of custom ? [['dashboard-period-start', '2026 年 02 月'], ['dashboard-period-end', '2026 年 04 月']] : [['dashboard-period-month', '2026 年 03 月']]) {
      const input = page.getByTestId(id).locator('input')
      await input.fill(value); await input.press('Enter'); await input.press('Tab')
    }
    if (await page.getByTestId('dashboard-period-apply').isEnabled()) await page.getByTestId('dashboard-period-apply').click()
    await page.waitForFunction(() => {
      let vm = document.querySelector('[data-testid="dashboard-canvas"]')?.__vueParentComponent
      while (vm && vm.type.__name !== 'Dashboard') vm = vm.parent
      return vm?.setupState.dashboardStatus === 'ready' && !vm.setupState.remoteQueryLoading
    }, null, { timeout: 90000 })
    const widget = page.getByTestId('binding-widget').filter({ has: page.getByText('患者入院48小时内转科的比例', { exact: true }) }).first()
    const responsePromise = page.waitForResponse(r => r.url().includes(custom ? '/instant-summary' : '/range-summary'), { timeout: 90000 })
    await widget.click()
    await page.waitForURL('**/analysis?**')
    const response = await responsePromise
    assert.equal(response.status(), 200)
    assert.equal(new URL(page.url()).searchParams.get('summaryMode'), custom ? 'INSTANT' : 'FORMAL')
    const name = custom ? '看板实际点击自定义区间跳转' : '看板实际点击月度跳转'
    checks.push({ name, url: page.url() })
    console.log('通过', name)
    await context.close()
  }
} finally { await browser.close(); await save('即时汇总真实验收', checks) }
