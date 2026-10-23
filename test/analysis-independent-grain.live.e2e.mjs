import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
let page
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], candidateRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/grain-options')) candidateRequests.push(request.url()) })
  await page.goto(`${process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'}/analysis?indicator=102027642461313070`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.getByText('高级筛选', { exact: true }).click()
  const fields = page.locator('.trend-grain-field')
  await fields.nth(0).locator('.el-select__wrapper').click()
  await page.getByRole('option').filter({ hasText: '血管外科门诊' }).first().click()
  await fields.nth(1).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: 'R10.402', exact: true }).click({ timeout: 60000 })
  assert.match(await fields.nth(0).innerText(), /OUT_DEPT_CODE/)
  assert.match(await fields.nth(1).innerText(), /IN_ICD10/)
  assert.ok(await fields.nth(0).locator('label').evaluate(label => label.scrollWidth <= label.clientWidth + 1), 'Field codes must not be clipped')
  async function apply() {
    const responsePromise = page.waitForResponse(response => {
      const query = new URL(response.url()).searchParams
      return response.url().includes('/analysis?') && query.get('sections') === 'TREND' && query.get('grainSelection') === 'EXACT'
    }, { timeout: 60000 })
    await page.getByRole('button', { name: '应用筛选', exact: true }).click()
    const response = await responsePromise
    assert.equal(response.status(), 200)
    const data = (await response.json()).data
    await page.waitForLoadState('networkidle')
    return data
  }
  const empty = await apply()
  assert.equal(empty.dataAvailable, false)
  assert.deepEqual(empty.trend, [])
  await page.getByText('暂无图表数据', { exact: true }).waitFor()
  await mkdir('.tmp/analysis-independent-grain', { recursive: true })
  await page.screenshot({ path: '.tmp/analysis-independent-grain/no-data.png', fullPage: true })

  await fields.nth(0).locator('.el-select__wrapper').click()
  await page.waitForFunction(() => !document.querySelector('.el-select-dropdown__loading'))
  await fields.nth(0).getByRole('combobox').pressSequentially('823', { delay: 100 })
  await page.getByRole('option').filter({ hasText: '肝胆及肝脏移植外科' }).click({ timeout: 60000 })
  assert.match(await fields.nth(1).innerText(), /R10\.402/)
  await fields.nth(1).locator('.el-select__wrapper').click()
  await page.waitForFunction(() => !document.querySelector('.el-select-dropdown__loading'))
  await fields.nth(1).getByRole('combobox').pressSequentially('Z94.400', { delay: 100 })
  await page.getByRole('option', { name: 'Z94.400', exact: true }).click({ timeout: 60000 })
  const available = await apply()
  assert.equal(available.dataAvailable, true)
  assert.ok(available.trend.length > 0)
  await page.getByRole('button', { name: '查看趋势数据表', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.chart-data-table tbody tr').length > 0)
  await page.screenshot({ path: '.tmp/analysis-independent-grain/with-data.png', fullPage: true })
  for (const url of candidateRequests) assert.ok([...new URL(url).searchParams.keys()].every(key => !key.startsWith('filter.')), url)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ emptyCombination: ['0850', 'R10.402'], emptyPoints: empty.trend.length,
    validCombination: ['823', 'Z94.400'], validPoints: available.trend.length, candidateRequests: candidateRequests.length, errors }))
} catch (error) {
  await mkdir('.tmp/analysis-independent-grain', { recursive: true })
  await page?.screenshot({ path: '.tmp/analysis-independent-grain/failure.png', fullPage: true })
  console.error(await page?.getByRole('option').allTextContents())
  throw error
} finally {
  await browser.close()
}
