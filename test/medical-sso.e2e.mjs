import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)('playwright')
const base = process.env.IDMP_SSO_TEST_URL || 'http://127.0.0.1:5176'
const output = new URL('../.tmp/signed-dashboard-e2e-20261030/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const signature = 'a'.repeat(64)
const identity = { userId: null, subject: 'visit-1', doctorNo: '1001', deptCode: '4101', expiresAt: '2099-01-01T00:00:00Z' }
const binding = dimensions => ({ dataset: 'published-source', dimensions: dimensions.map(field => ({ field })), measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] })
const widget = (code, type, position, dimensions = []) => ({ code, type, title: { kpi: '科室入院人次', chart: '医师入院人次', table: '医师入院明细' }[code], dataSourceCode: 'SOURCE', indicatorVersionId: '10', position, fieldBindings: binding(dimensions), query: {}, chart: {}, style: type === 'BAR' ? { __idmpClickAction: 'drill' } : {} })
const detail = { dashboard: { id: '2', code: 'QUALITY', name: '质量安全看板', status: 'PUBLISHED', currentPublishedVersionId: '3' }, version: { id: '3', layout: { columns: 24 }, widgets: [widget('kpi', 'KPI', { x: 0, y: 0, w: 24, h: 3 }), widget('chart', 'BAR', { x: 0, y: 3, w: 12, h: 8 }, ['DOCTOR_NAME']), widget('table', 'TABLE', { x: 12, y: 3, w: 12, h: 8 }, ['DOCTOR_NAME'])] } }
const fields = [{ code: 'DOCTOR_NAME', name: '医师', dataType: 'STRING', role: 'DIMENSION' }, { code: 'value', name: '入院人次', dataType: 'NUMBER', role: 'MEASURE', aggregation: 'DIRECT' }]
const drillContext = { resultId: '55', snapshotId: '66', currentLevel: 'DOCTOR', parentKeys: { OUT_DEPT_CODE: '4101' }, filters: { OUT_DEPT_CODE: ['4101'] } }
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('idmp_access_token', 'existing-admin'))
    const page = await context.newPage(), requests = [], errors = []
    let failQuery = false
    let stage = 'signed entry'
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
      const body = request.postDataJSON()
      requests.push({ path, body, authorization: request.headers().authorization, cookie: request.headers().cookie })
      let data
      if (path === '/medical/dashboard-access/exchange') {
        assert.equal(request.headers().authorization, undefined)
        assert.equal(request.headers().cookie, undefined)
        assert.deepEqual(body, { dashboardID: '0002', doctorNo: '1001', deptCode: '4101', sign: signature })
        data = { identity, accessToken: 'medical-session', access: { dashboardId: '2' } }
      } else {
        assert.equal(request.headers().authorization, 'Bearer medical-session', `${stage}: ${path}`)
        if (path === '/medical/session') data = identity
        else if (path === '/medical/dashboards') data = [detail.dashboard]
        else if (path === '/medical/dashboards/2/open') data = { dashboardId: '2' }
        else if (path === '/medical/dashboards/2/metadata') data = { deptCode: '4101', deptName: '测试科室', widgets: Object.fromEntries(['kpi', 'chart', 'table'].map(code => [code, { fields, periods: [{ periodType: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-02-01' }] }])) }
        else if (path === '/medical/dashboards/2') data = detail
        else if (path.endsWith('/periods')) data = [{ periodType: 'MONTHLY', periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00' }]
        else if (path === '/medical/dashboards/2/query') {
          if (failQuery) return route.fulfill({ status: 403, json: { code: 'COMMON-40300', message: '科室授权已失效' } })
          const period = { periodStart: body.periodStart, periodEnd: body.periodEnd }
          data = { drillTicket: '11111111-1111-1111-1111-111111111111', data: { widgets: Object.fromEntries(body.widgetCodes.map(code => [code, { status: 'READY', fields, rows: code === 'kpi' ? [{ value: 128, ...period }] : [{ DOCTOR_NAME: '张医生', value: 128, drillContext, ...period }], rowMode: 'PROJECTED', resultId: '55', snapshotId: '66', drillContext }])) } }
        } else if (path.endsWith('/drill-path')) data = { versionId: '77', levels: [{ levelCode: 'OUT_DEPT', levelName: '科室', dimensionFieldCode: 'OUT_DEPT_CODE' }, { levelCode: 'DOCTOR', levelName: '医师', dimensionFieldCode: 'DOCTOR_NO' }] }
        else if (path.endsWith('/drill')) { assert.equal(body.pathCode, undefined); assert.equal(body.snapshotId, '66'); data = { context: { resultId: '55', snapshotId: '66', indicatorVersionId: '10', currentLevel: 'DOCTOR', parentKeys: { OUT_DEPT_CODE: '4101' }, pathCode: 'ORGANIZATION' }, records: [{ levelCode: 'DOCTOR', dimensionKey: '1001', dimensionName: '张医生', indicatorValue: 128, displayValue: '128', numerator: 128 }], pageInfo: { total: 1, pageNum: 1, pageSize: 200 }, nextLevels: [] } }
        else if (path === '/medical/logout') data = null
        else throw new Error(`Unexpected unscoped API: ${path}`)
      }
      await route.fulfill({ json: { code: 'OK', data } })
    })
    await page.goto(`${base}/dashboard?dashboardID=0002&doctorNo=1001&deptCode=4101&sign=${signature}`)
    await page.waitForURL('**/dashboard?id=2&medical=1')
    await page.getByTestId('dashboard-canvas').waitFor()
    assert.equal(await page.locator('.medical-grid').count(), 0)
    await page.locator('[data-testid="binding-kpi-value"]').filter({ hasText: '128' }).waitFor()
    await page.locator('[data-testid="binding-table"]').getByText('张医生').waitFor()
    assert.equal(new URL(page.url()).searchParams.has('token'), false)
    assert.equal(new URL(page.url()).searchParams.has('sign'), false)
    assert.equal(await page.evaluate(() => localStorage.getItem('idmp_access_token')), 'existing-admin')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: new URL(`desktop-${width}.png`, output).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true })
    // Fire an actual ECharts click event through the mounted Vue chart instance.
    const dispatched = await page.getByTestId('dashboard-widget-chart').evaluate(element => {
      const find = node => {
        const vm = node?.__vueParentComponent
        if (vm?.type?.__name === 'IdmpChart') { vm.emit('chart-click', { data: { dimensionValues: { DOCTOR_NAME: '张医生' } } }); return true }
        return [...node.children].some(find)
      }
      return find(element)
    })
    assert.equal(dispatched, true)
    await page.getByTestId('backend-chart-drill').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-testid="backend-chart-drill"]')?.getAttribute('aria-busy') === 'false')
    assert.ok(requests.some(r => r.path.endsWith('/drill')), 'chart must use scoped drill endpoint')
    assert.equal(await page.getByText('下钻结果版本、快照或层级不一致').count(), 0)
    await page.getByRole('button', { name: '返回原图表', exact: true }).click()
    await page.reload()
    stage = 'restored visitor'
    await page.getByTestId('binding-kpi-value').filter({ hasText: '128' }).waitFor()
    failQuery = true
    stage = 'query error'
    const month = page.getByTestId('dashboard-period-month').locator('input')
    await month.fill('2026 年 02 月')
    await month.press('Enter')
    await page.getByTestId('dashboard-period-apply').click()
    await page.getByText('科室授权已失效', { exact: false }).first().waitFor()
    assert.equal(await page.getByTestId('binding-kpi-value').count(), 0, 'failed refresh clears stale values')
    stage = 'logout'
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL('**/login')
    assert.equal(requests.findLast(r => r.path === '/medical/logout').cookie, undefined)
    assert.equal(await page.evaluate(() => localStorage.getItem('idmp_access_token')), 'existing-admin')
    assert.deepEqual(errors, [])
    await page.goto(`${base}/auto-login?token=expired`)
    await page.getByText('单点登录失败', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.has('token'), false)
    await page.goto(`${base}/auto-login?token=temporary-medical-token&redirect=${encodeURIComponent('https://evil.example')}`)
    await page.getByText('单点登录失败', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).origin, base)
    await context.close()
    console.log(`medical SSO browser flow passed at width ${width}`)
  }
} finally { await browser.close() }
