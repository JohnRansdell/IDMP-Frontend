import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
const indicatorId = process.env.IDMP_TEST_INDICATOR_ID || '102027642461902857'
const parameterCode = process.env.IDMP_TEST_PARAMETER_CODE || 'patientName'
const values = process.env.IDMP_TEST_PARAMETER_VALUES?.split(',') || ['张', '李', '不存在的患者验收']
const expectedStatus = Number(process.env.IDMP_EXPECT_QUERY_STATUS || 200)
const credentials = JSON.parse(await readFile(process.env.IDMP_ADMIN_CREDENTIAL_FILE || '.tmp/forced-login-admin-20261024.json', 'utf8'))
const folder = '.tmp/runtime-parameters-20261028'
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const checks = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/login`)
  await page.getByPlaceholder('请输入工号').fill(credentials.username)
  await page.locator('input[type=password]').fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/dashboard')
  let releaseOverview
  const overviewGate = new Promise(resolve => { releaseOverview = resolve })
  await page.route(`**/analysis/indicators/${indicatorId}/analysis?*`, async route => {
    await overviewGate
    await route.continue()
  })
  await page.goto(`${origin}/analysis?indicator=${indicatorId}`)
  const panel = page.getByRole('region', { name: '查询条件' })
  const parameter = panel.locator('.runtime-parameter-field').filter({ hasText: parameterCode }).locator('input')
  await parameter.waitFor({ state: 'visible' })
  const dates = panel.locator('.report-period-picker input')
  assert.equal(await dates.nth(0).inputValue(), '')
  assert.equal(await dates.nth(1).inputValue(), '')
  await parameter.fill(values[0])
  checks.push({ name: '未选择报告期即可填写参数', passed: true })
  releaseOverview()
  for (const [start, end, code, exclusiveEnd] of [
    ['2026-01-01', '2026-01-31', values[0], '2026-02-01'],
    ['2026-02-03', '2026-03-07', values[1], '2026-03-08'],
    ['2026-01-01', '2026-03-31', values[2], '2026-04-01']
  ]) {
    await panel.locator('.report-period-picker').hover()
    const clear = panel.locator('.el-range__close-icon')
    if (await dates.nth(0).inputValue()) await clear.click()
    await dates.nth(0).fill(start)
    await dates.nth(1).fill(end)
    await dates.nth(1).press('Enter')
    await dates.nth(1).press('Tab')
    await parameter.fill(code)
    assert.ok(await parameter.isVisible())
    const pending = page.waitForResponse(response => response.url().includes('/instant-summary') && response.request().method() === 'POST', { timeout: 120000 })
    await panel.getByRole('button', { name: '查询', exact: true }).click()
    const response = await pending
    const payload = response.request().postDataJSON()
    assert.deepEqual(payload.parameters, { [parameterCode]: code })
    assert.equal(payload.periodStart, `${start}T00:00:00`)
    assert.equal(payload.periodEnd, `${exclusiveEnd}T00:00:00`)
    const result = parseJsonPreservingLargeIntegers(await response.text())
    checks.push({ name: '报告期与参数提交', start, end, code, status: response.status(), result })
    assert.equal(response.status(), expectedStatus, result.message)
    if (expectedStatus === 200) {
      assert.deepEqual(result.data.parameterSnapshot, payload.parameters)
      assert.equal(result.data.executionMode, 'AD_HOC_SOURCE')
      const row = result.data.rows[0]
      if (code === values[2]) assert.equal(row.value, null, 'nonexistent member must not return an unfiltered value')
      else {
        assert.ok(row.denominatorValue > 0)
        assert.ok(Math.abs(row.value - row.numeratorValue / row.denominatorValue) < 1e-8)
      }
    }
    console.log(JSON.stringify({ start, end, code, status: response.status(), message: result.message, data: result.data }))
    await page.waitForFunction(() => !document.querySelector('.instant-query-panel .el-button.is-loading'))
  }
  await page.screenshot({ path: `${folder}/runtime-controls-${indicatorId}.png` })
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${folder}/browser-checks-${indicatorId}.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
