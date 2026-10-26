import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, get, sql, check, run, save, finish, folder, close } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const indicator = '102027642461313070', version = '102027642461313071'
const combinations = await sql('SOURCE', "SELECT b.out_dept_code,b.in_icd10,COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-02-01' GROUP BY b.out_dept_code,b.in_icd10", ['department', 'diagnosis', 'numerator', 'denominator'])
const positive = combinations.find(row => Number(row.numerator) > 0 && row.department && row.diagnosis)
const zero = combinations.find(row => Number(row.numerator) === 0 && row.department && row.diagnosis)
const absent = combinations.find(row => row.diagnosis && !combinations.some(other => other.department === positive.department && other.diagnosis === row.diagnosis))
assert.ok(positive && zero && absent)
const cases = [['非零实际组合', positive], ['零值实际组合', zero], ['成员独立可选但组合不存在', { department: positive.department, diagnosis: absent.diagnosis, denominator: 0, numerator: 0 }]]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = [], requests = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().includes('/api/v1/analysis/')) requests.push(new URL(request.url())) })
try {
  await page.goto(`${origin}/analysis?indicator=${indicator}&indicatorVersionId=${version}&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31&trendStart=2026-01-01&trendEnd=2026-01-31`)
  await page.getByText('高级筛选', { exact: true }).click()
  for (const [name, expected] of cases) await run(`高级筛选${name}`, async () => {
    for (const [code, value] of [['OUT_DEPT_CODE', expected.department], ['IN_ICD10', expected.diagnosis]]) {
      const field = page.locator('.trend-grain-field').filter({ has: page.locator(`label[for="trend-grain-${code}"]`) })
      const input = field.locator('input')
      await field.locator('.el-select').click()
      await input.fill(value)
      const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const exactCode = options.filter({ has: page.locator('small, span').filter({ hasText: new RegExp(`^${escaped}$`) }) })
      try { await exactCode.first().click({ timeout: 15000 }) } catch (error) {
        await save(`高级筛选选项定位${code}`, { value, options: await options.allTextContents(), field: await field.innerHTML() })
        await page.screenshot({ path: `${folder}/高级筛选选项定位${code}.png`, fullPage: true })
        throw error
      }
    }
    const before = requests.length
    const response = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/analysis') && url.searchParams.get('grainSelection') === 'EXACT' && url.searchParams.get('filter.OUT_DEPT_CODE') === expected.department && url.searchParams.get('filter.IN_ICD10') === expected.diagnosis
    })
    await page.getByRole('button', { name: '应用筛选', exact: true }).click()
    const actual = await response
    check(`${name}页面实际发送完整组合而非整体请求`, actual.status() === 200 && requests.slice(before).some(url => url.searchParams.get('sections') === 'TREND' && url.searchParams.get('grainSelection') === 'EXACT'))
    await page.waitForFunction(() => {
      let c = document.querySelector('.indicator-analysis')?.__vueParentComponent
      while (c && c.type.__name !== 'IndicatorAnalysis') c = c.parent
      return c && !c.setupState.trendLoading
    })
    const snapshot = await page.locator('.indicator-analysis').evaluate(node => {
      let c = node.__vueParentComponent
      while (c && c.type.__name !== 'IndicatorAnalysis') c = c.parent
      return JSON.parse(JSON.stringify({ rows: c.setupState.trendTableRows, analysis: c.setupState.trendBackendAnalysis, option: c.setupState.trendOption, selected: c.setupState.trendGrainApplied }))
    })
    const trend = snapshot.analysis.trend || []
    const january = trend.find(row => row.periodStart?.startsWith('2026-01') || row.label === '2026-01' || row.period === '2026-01')
    check(`${name}选择值完整且独立保留`, snapshot.selected.OUT_DEPT_CODE === expected.department && snapshot.selected.IN_ICD10 === expected.diagnosis)
    if (Number(expected.denominator) === 0) check(`${name}不回退成全院数据`, snapshot.rows.length === 0, snapshot)
    else {
      const point = january || trend[0]
      check(`${name}趋势原值等于源表去重比率`, point && close(point.value, Number(expected.numerator) / Number(expected.denominator)), { point, expected, snapshot })
      check(`${name}零值与非零值都能绘图`, snapshot.rows.length === 1 && snapshot.option.series[0].data.length === 1)
    }
    await save(`高级筛选${name}`, { expected, snapshot })
    await page.screenshot({ path: `${folder}/高级筛选${name}.png`, fullPage: true })
  })
  check('高级筛选页面无运行异常', !errors.length, errors)
} finally {
  await browser.close()
  await finish('高级筛选页面', { persistState: false })
}
