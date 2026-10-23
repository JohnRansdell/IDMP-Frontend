import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const { chromium } = createRequire(import.meta.url)('playwright')
const portal = process.env.IDMP_MEDICAL_PORTAL_URL || 'http://127.0.0.1:5180'
const base = process.env.IDMP_SSO_TEST_URL || 'http://127.0.0.1:5176'
const output = new URL('../.tmp/medical-sso-portal-live/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const passed = [], errors = []
const pass = label => { passed.push(label); console.log('PASS', label) }
const config = await (await fetch(`${portal}/test/config`)).json()
assert.equal(config.signingKeyBase64, undefined)
assert.equal(config.validationSecret, undefined)
const request = async (path, token, body) => {
  const response = await fetch(`${base}/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, payload: parse(await response.text()) }
}
async function popupFrom(page, mode) {
  const opening = page.waitForEvent('popup')
  await page.locator(`button[data-mode="${mode}"]`).click()
  const popup = await opening
  popup.on('pageerror', error => errors.push(error.message))
  return popup
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(portal)
    await page.getByText('联调服务已就绪').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: fileURLToPath(new URL(`portal-${width}.png`, output)), fullPage: true })
    for (const user of config.users) {
      await page.locator(`input[value="${user.id}"]`).check()
      const popup = await popupFrom(page, 'signed')
      await popup.waitForURL(`**/medical-dashboard?id=${config.dashboardId}`, { timeout: 45000 })
      await popup.locator('.medical-grid').waitFor({ timeout: 45000 })
      const identity = await popup.evaluate(async () => {
        const token = sessionStorage.getItem('idmp_medical_access_token')
        const response = await fetch('/api/v1/medical/session', { headers: { Authorization: `Bearer ${token}` } })
        return (await response.json()).data
      })
      assert.equal(identity.deptCode, user.deptCode)
      assert.equal(identity.doctorNo, user.doctorNo)
      const token = await popup.evaluate(() => sessionStorage.getItem('idmp_medical_access_token'))
      const query = { periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY', filters: {} }
      const result = await request(`/medical/dashboards/${config.dashboardId}/query`, token, query)
      assert.equal(result.status, 200)
      const widgets = result.payload.data.data.widgets
      assert.equal(Object.keys(widgets).length, 4)
      const expected = user.deptCode === '16' ? { value: .002331, numerator: 1, denominator: 429, display: '0.23%' } : { value: 0, numerator: 0, denominator: 679, display: '0.00%' }
      for (const widget of Object.values(widgets)) {
        assert.equal(widget.status, 'READY', widget.message)
        assert.equal(widget.rows.length, 1)
        const row = widget.rows[0]
        assert.equal(row.numeratorValue, expected.numerator)
        assert.equal(row.denominatorValue, expected.denominator)
        assert.equal(row.value, expected.value)
        assert.equal(row.displayValue, expected.display)
        assert.equal(row.drillContext.parentKeys.OUT_DEPT_CODE, user.deptCode)
        assert.equal(Math.round(row.numeratorValue / row.denominatorValue * 10000) / 100 + '%', user.deptCode === '16' ? expected.display : '0%')
      }
      await popup.locator('input[type="month"]').fill('2026-01')
      const queried = popup.waitForResponse(response => response.url().endsWith(`/medical/dashboards/${config.dashboardId}/query`) && response.request().method() === 'POST')
      await popup.getByRole('button', { name: '查询', exact: true }).click()
      assert.equal((await queried).status(), 200)
      await popup.getByTestId('binding-kpi-value').filter({ hasText: expected.display }).waitFor()
      await popup.getByTestId('binding-table').getByText(user.deptName, { exact: true }).waitFor()
      assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.equal(new URL(popup.url()).searchParams.has('token'), false)
      assert.equal(new URL(popup.url()).searchParams.has('sign'), false)
      await popup.waitForFunction(() => document.querySelectorAll('.medical-grid canvas').length >= 2)
      // Let the chart's initial animation finish before visual inspection.
      await popup.waitForTimeout(1200)
      await popup.screenshot({ path: fileURLToPath(new URL(`dashboard-${user.id}-${width}.png`, output)), fullPage: true })
      const forbidden = await request(`/medical/dashboards/${config.dashboardId}/query`, token,
        { ...query, filters: { OUT_DEPT_CODE: [user.deptCode === '16' ? '15' : '16'] } })
      assert.ok(Object.values(forbidden.payload.data.data.widgets).every(widget => widget.status === 'FORBIDDEN' && widget.rows.length === 0))
      assert.equal((await request('/system/users', token)).status, 403)
      assert.equal((await request('/analysis/dashboards/1189225114584501123', token)).status, 403)
      pass(`${width}px ${user.id}: real SSO, four scoped widgets, arithmetic, rendering and denied cross-department/management access`)
      await popup.getByRole('button', { name: '退出登录', exact: true }).click()
      await popup.waitForURL('**/login')
      assert.equal((await request('/medical/session', token)).status, 401)
      await popup.close()
    }
    const catalog = await popupFrom(page, 'catalog')
    await catalog.waitForURL('**/dashboard')
    await catalog.locator('.idmp-shell').waitFor()
    await catalog.getByRole('navigation', { name: '主导航' }).waitFor()
    assert.equal(await catalog.locator('.medical-dashboard').count(), 0)
    const platformToken = await catalog.evaluate(() => sessionStorage.getItem('idmp_medical_access_token'))
    const platformMe = await request('/auth/me', platformToken)
    assert.equal(platformMe.status, 200)
    assert.ok(!platformMe.payload.data.roles.includes('MEDICAL_VIEWER'))
    assert.ok(!platformMe.payload.data.roles.includes('SYSTEM_ADMIN'))
    if (!platformMe.payload.data.permissions.length) await catalog.getByText('账号尚未配置平台权限', { exact: true }).waitFor()
    assert.equal((await request('/system/users', platformToken)).status, 403)
    await catalog.reload()
    await catalog.locator('.idmp-shell').waitFor()
    assert.equal(new URL(catalog.url()).pathname, '/dashboard')
    await catalog.screenshot({ path: fileURLToPath(new URL(`platform-${width}.png`, output)), fullPage: true })
    if (width >= 768) await catalog.getByRole('link', { name: '指标目录', exact: true }).click()
    else await catalog.goto(`${base}/indicator`)
    await catalog.waitForURL('**/indicator')
    await catalog.locator('.idmp-shell').waitFor()
    await catalog.getByRole('button', { name: '退出登录', exact: true }).click()
    await catalog.waitForURL('**/login')
    assert.equal((await request('/auth/me', platformToken)).status, 401)
    pass(`${width}px: token-only entry reaches the full platform shell, persists on reload, navigates menus and logs out without elevated roles`)
    await catalog.close()
    for (const mode of ['invalid-token', 'invalid-sign']) {
      const rejected = await popupFrom(page, mode)
      await rejected.getByText(mode === 'invalid-token' ? '单点登录失败' : '看板访问失败', { exact: true }).waitFor({ timeout: 45000 })
      assert.equal(await rejected.locator('.medical-grid').count(), 0)
      assert.equal(new URL(rejected.url()).searchParams.has('token'), false)
      pass(`${width}px: ${mode} rejected without dashboard data`)
      await rejected.close()
    }
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(new URL('verification.json', output), JSON.stringify({ passed, errors }, null, 2))
} finally { await browser.close() }
