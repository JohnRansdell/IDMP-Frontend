import { createRequire } from 'node:module'
import { admin, api, origin, folder, check, save, finish } from './comprehensive-client.mjs'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const calls = [], pending = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
  page.on('response', response => {
    if (!response.url().includes('/dashboards/5716154056296841437/query')) return
    pending.push((async () => calls.push({ request: response.request().postDataJSON(),
      response: expandDashboardResponse(parseJsonPreservingLargeIntegers(await response.text()).data) }))())
  })
  await page.goto(`${origin}/dashboard?id=5716154056296841437`)
  await page.waitForTimeout(5000)
  await save('截图看板初始页面', { text: await page.locator('body').innerText(), errors })
  await page.screenshot({ path: `${folder}/截图看板初始状态.png` })
  const control = page.locator('[data-filter-field="OUT_DEPT_CODE"]')
  await control.locator('summary').waitFor({ timeout: 90000 })
  check('原截图看板恢复科室选择器', !(await control.innerText()).includes('字段已失效'))
  await control.locator('summary').click()
  await control.locator('[data-filter-option="15"]').check()
  await control.locator('[data-filter-option="16"]').check()
  const before = calls.length
  const response = page.waitForResponse(response => response.url().includes('/dashboards/5716154056296841437/query')
    && Object.values(response.request().postDataJSON()?.filters || {}).some(value => Array.isArray(value) && value.includes('15') && value.includes('16')))
  await control.getByRole('button', { name: '确定', exact: true }).click()
  await response
  await page.waitForFunction(() => !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'))
  await Promise.all(pending)
  const selected = calls.slice(before).filter(call => Object.keys(call.request.filters || {}).length)
  check('旧版本组件使用自身的科室字段', selected.length > 0 && selected.every(call => JSON.stringify(call.request.filters.OUT_DEPT_CODE) === JSON.stringify(['15', '16'])), selected.map(call => call.request.filters))
  const results = selected.flatMap(call => Object.values(call.response.widgets || {}))
  check('筛选后所有组件无接口错误', results.length > 0 && results.every(item => item.status !== 'ERROR'), results.map(item => ({ status: item.status, message: item.message })))
  const groupedRows = results.flatMap(item => item.rows || []).filter(row => row.OUT_DEPT_CODE != null || row.out_dept_code != null)
  check('返回科室数据仅含所选成员', groupedRows.length > 0 && groupedRows.every(row => ['15', '16'].includes(String(row.OUT_DEPT_CODE ?? row.out_dept_code))))
  await page.getByTestId('dashboard-filter-bar').screenshot({ path: `${folder}/截图问题修复后科室筛选.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('dashboard-filter-bar').screenshot({ path: `${folder}/手机科室筛选.png` })
  await page.close()
  const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
  const scoped = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await scoped.addInitScript(token => localStorage.setItem('idmp_access_token', token), analyst)
  await scoped.goto(`${origin}/dashboard?id=5716154056296841437`)
  const scopedControl = scoped.locator('[data-filter-field="OUT_DEPT_CODE"]')
  await scopedControl.locator('summary').waitFor({ timeout: 90000 })
  await scopedControl.locator('summary').click()
  const codes = await scopedControl.locator('[data-filter-option]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-filter-option')))
  check('普通用户候选科室保持本科室隔离', codes.length === 1 && codes[0] === '15', codes)
  check('筛选流程没有浏览器异常', errors.length === 0, errors)
} finally {
  await Promise.allSettled(pending)
  await save('旧版科室筛选请求证据', calls)
  await browser.close()
  await finish('旧版科室筛选浏览器验收', { persistState: false })
}
