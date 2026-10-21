import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const versionId = '102027642463201863', tag = 'WARN_REAL_1792601340979'
const evidence = '.tmp/warning-members'
await mkdir(evidence, { recursive: true })
async function get(path) {
  const response = await fetch(`${origin}/api/v1${path}`, { signal: AbortSignal.timeout(45000) })
  const result = JSON.parse(await response.text(), (_key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) ? context.source : value)
  assert.equal(response.status, 200, JSON.stringify(result))
  return result.data
}
const members = params => get(`/analysis/warning-rules/member-options?${new URLSearchParams({ indicatorVersionId: versionId, ...params })}`)
const dictionary = []
for (let pageNum = 1; ; pageNum++) {
  const page = await get(`/meta/departments?page=${pageNum}&size=500`)
  dictionary.push(...page.records)
  if (dictionary.length >= Number(page.total)) break
}
assert.ok(dictionary.length >= 1045)
const namesByCode = new Map(dictionary.map(entry => [entry.code, entry.name]))
assert.equal(namesByCode.get('0101'), '测试门诊')
assert.equal(namesByCode.get('22'), '泌尿外科')
const full = { values: [] }
let cursor
do {
  const page = await members({ targetCode: 'BASE', dimension: 'OUT_DEPT_CODE', size: '100', ...(cursor ? { after: cursor } : {}) })
  full.values.push(...page.values); cursor = page.nextAfter
} while (cursor)
assert.deepEqual(full.values, dictionary.map(entry => entry.code).sort())
const batch = await get('/calc/batches/102027642463210782')
const formula = batch.targets.find(target => target.targetCode === 'BASE').nodes.find(node => node.nodeType === 'FORMULA')
const april = (await get(`/calc/nodes/${formula.nodeId}/results?pageNum=1&pageSize=100`)).results.records
assert.equal(april.length, 24)
assert.ok(april.every(row => full.values.includes(String(row.dimensions.out_dept_code))), 'Every April department must be selectable from the master')
assert.ok(full.values.includes('22'))
const firstPage = await members({ targetCode: 'BASE', dimension: 'OUT_DEPT_CODE', size: '5' })
assert.deepEqual(firstPage.values, full.values.slice(0, 5))
assert.equal(firstPage.nextAfter, full.values[4])
assert.ok((await members({ targetCode: 'BASE', dimension: 'out_dept_code', search: '泌尿外科' })).values.includes('22'))
await writeFile(`${evidence}/candidates.json`, JSON.stringify(full, null, 2))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], memberRequests = [], dictionaryRequests = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (response.url().includes('/member-options')) memberRequests.push({ url: response.url(), status: response.status() }) })
page.on('response', response => { if (response.url().includes('/meta/departments')) dictionaryRequests.push({ url: response.url(), status: response.status() }) })
try {
  await page.goto(`${origin}/alerts`)
  await page.getByRole('tab', { name: '预警规则', exact: true }).click()
  await page.getByRole('button', { name: '创建预警规则', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建预警规则', exact: true })
  const item = label => dialog.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: label }) })
  await item('已发布指标版本').locator('.el-select').click()
  await page.getByRole('option', { name: new RegExp(tag) }).click()
  await dialog.getByText('分组结果', { exact: true }).click()
  await item('分组粒度').locator('.el-select').click()
  await page.getByRole('option', { name: '组合粒度（OUT_DEPT_CODE）', exact: true }).click()
  const codes = item('OUT_DEPT_CODE 成员').locator('.el-select')
  await codes.click()
  await page.getByRole('option', { name: `${namesByCode.get(full.values[0])}（${full.values[0]}）`, exact: true }).waitFor()
  assert.equal(await page.getByRole('option').count(), Math.min(50, full.values.length))
  if (full.values.length > 50) {
    await page.getByRole('button', { name: '加载更多成员', exact: true }).click()
    await page.getByRole('option', { name: `${namesByCode.get(full.values[99])}（${full.values[99]}）`, exact: true }).waitFor()
  }
  assert.equal(await page.getByRole('option').count(), 100, 'Additional candidate pages must load without typing codes')
  for (const value of ['22', '21', '14']) {
    await codes.locator('input').fill(value)
    await page.getByRole('option', { name: `${namesByCode.get(value)}（${value}）`, exact: true }).click()
  }
  await page.keyboard.press('Escape')
  for (const value of ['22', '21', '14']) assert.ok((await codes.innerText()).includes(value))
  await dialog.screenshot({ path: `${evidence}/base-selected.png` })
  const searched = page.waitForResponse(response => response.url().includes('/member-options') && response.url().includes('search=22'))
  await codes.locator('input').fill('22')
  await page.getByRole('option', { name: '泌尿外科（22）', exact: true }).waitFor()
  await searched
  await page.keyboard.press('Escape')
  await item('分组粒度').locator('.el-select').click()
  await page.getByRole('option', { name: /全院到出院科室 \/ 出院科室/ }).click()
  assert.ok(!(await codes.innerText()).includes('22'), 'Changing target must clear prior member selection')
  const names = item('OUT_DEPT_NAME 成员').locator('.el-select')
  await names.click()
  await names.locator('input').fill('泌尿外科')
  await page.getByRole('option', { name: '泌尿外科', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.ok((await names.innerText()).includes('泌尿外科'))
  await dialog.screenshot({ path: `${evidence}/drill-selected.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await names.scrollIntoViewIfNeeded()
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  await dialog.screenshot({ path: `${evidence}/mobile.png` })
  assert.deepEqual(errors, [])
  assert.ok(memberRequests.length >= 4)
  assert.ok(memberRequests.every(request => request.status === 200))
  assert.equal(dictionaryRequests.length, Math.ceil(dictionary.length / 500), 'All department selectors share one full-list request')
  assert.ok(dictionaryRequests.every(request => request.status === 200))
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ passed: true, candidates: full.values.length, memberRequests, dictionaryRequests, errors }, null, 2))
  console.log(`PASS live: ${full.values.length} real BASE candidates (all 24 April departments included), cursor paging, search, actual multi-select, target reset, drill names, mobile`)
} finally { await browser.close() }
