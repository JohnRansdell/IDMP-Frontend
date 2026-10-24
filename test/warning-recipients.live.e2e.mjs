import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const { chromium } = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright')
const base = process.env.IDMP_SSO_TEST_URL || 'http://127.0.0.1:5176'
const output = new URL('../.tmp/warning-recipients-live/', import.meta.url)
await mkdir(output, { recursive: true })
const credentials = JSON.parse(await readFile(process.env.IDMP_AUTH_TEST_CREDENTIALS || new URL('../.tmp/forced-login-admin-20261024.json', import.meta.url), 'utf8'))
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = [], paths = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (request.url().includes('/api/v1/')) paths.push(new URL(request.url()).pathname) })
let token
async function api(path) {
  const response = await fetch(`${base}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const payload = parse(await response.text())
  assert.equal(response.status, 200, `${path}: ${payload.message}`)
  return payload.data
}
const label = user => user.displayName && user.displayName !== user.username ? `${user.displayName} · ${user.username}` : user.displayName || user.username
try {
  await page.goto(`${base}/alerts`)
  await page.getByLabel('工号', { exact: true }).fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('tab', { name: '预警规则', exact: true }).waitFor()
  token = await page.evaluate(() => localStorage.getItem('idmp_access_token'))
  const options = await api('/analysis/warning-rules/recipient-options')
  assert.ok(options.length > 0)
  for (const user of options) assert.deepEqual(Object.keys(user).sort(), ['displayName', 'username'])
  const recipient = options.find(user => user.username === credentials.username)
  assert.ok(recipient, 'The authenticated real administrator must be selectable')
  const existing = await api('/analysis/warning-rules?page=1&size=100')
  for (const rule of existing.records) {
    const policy = rule.version?.notificationPolicy
    if (policy) assert.equal(Object.hasOwn(policy, 'recipientUserIds'), false)
  }
  await page.getByRole('tab', { name: '预警规则', exact: true }).click()
  await page.getByRole('button', { name: '创建预警规则', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建预警规则', exact: true })
  const item = text => dialog.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: text }) })
  const code = `WARN_RECIPIENT_${Date.now()}`
  await item('规则编码').locator('input').fill(code)
  await item('规则名称').locator('input').fill('接收人工号接口真实验收')
  await item('已发布指标版本').locator('.el-select').click()
  await page.getByRole('option').filter({ hasText: /男性出院|住院死亡|48小时/ }).first().click()
  await dialog.locator('input[aria-label="阈值"]').fill('0.4')
  const recipients = item('接收用户')
  await recipients.locator('.el-select').click()
  await page.getByRole('option', { name: label(recipient), exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await recipients.locator('.el-select__tags-text').innerText(), label(recipient))
  const savedResponse = page.waitForResponse(response => response.url().endsWith('/analysis/warning-rules') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: '创建草稿', exact: true }).click()
  const response = await savedResponse
  assert.equal(response.status(), 200)
  const request = parse(response.request().postData())
  assert.deepEqual(request.notificationPolicy.recipientUsernames, [recipient.username])
  assert.equal(Object.hasOwn(request.notificationPolicy, 'recipientUserIds'), false)
  const created = parse(await response.text()).data
  assert.equal(created.enableStatus, 'DISABLED')
  assert.equal(created.version.publicationStatus, 'DRAFT')
  assert.deepEqual(created.version.notificationPolicy.recipientUsernames, [recipient.username])
  assert.equal(Object.hasOwn(created.version.notificationPolicy, 'recipientUserIds'), false)
  const saved = page.getByRole('dialog', { name: '预警规则', exact: true })
  await saved.waitFor()
  const savedItem = saved.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: '接收用户' }) })
  assert.equal(await savedItem.locator('.el-select__tags-text').innerText(), label(recipient))
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 })
    await savedItem.scrollIntoViewIfNeeded()
    await page.screenshot({ path: fileURLToPath(new URL(`recipients-${width}.png`, output)) })
    assert.ok(await savedItem.evaluate(element => element.scrollWidth <= element.clientWidth + 1))
    assert.equal(await savedItem.locator('.el-select__tags-text').innerText(), label(recipient))
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await saved.locator('input[aria-label="阈值"]').fill('0.45')
  const updatedResponse = page.waitForResponse(response => response.url().includes('/analysis/warning-rule-versions/') && response.request().method() === 'PATCH')
  await saved.getByRole('button', { name: '保存草稿', exact: true }).click()
  assert.equal((await updatedResponse).status(), 200)
  const reread = await api(`/analysis/warning-rules/${created.id}`)
  assert.deepEqual(reread.version.notificationPolicy.recipientUsernames, [recipient.username])
  assert.equal(Object.hasOwn(reread.version.notificationPolicy, 'recipientUserIds'), false)
  assert.equal(reread.version.condition.children[0].threshold, '0.45')
  assert.equal(paths.includes('/api/v1/system/users'), false, 'Recipient selection must not load full system user profiles')
  assert.deepEqual(errors, [])
  await writeFile(new URL('acceptance.json', output), JSON.stringify({ code, ruleId: created.id, versionId: created.version.id, recipientUsernames: [recipient.username], published: false }))
  console.log('PASS: minimal recipient API, real draft create/update/get, employee-number-only payloads, desktop/mobile labels, no full user API')
} finally { await browser.close() }
