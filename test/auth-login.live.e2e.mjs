import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const base = process.env.IDMP_AUTH_TEST_URL || 'http://127.0.0.1:5176'
const credentials = JSON.parse(await readFile(process.env.IDMP_AUTH_TEST_CREDENTIALS || new URL('../.tmp/forced-login-admin-20261024.json', import.meta.url), 'utf8'))
const output = new URL('../.tmp/forced-login-live/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const passed = [], errors = [], responses = []
const pass = label => { passed.push(label); console.log('PASS', label) }
async function signIn(page) {
  await page.getByLabel('工号', { exact: true }).fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
}
function observe(page) {
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    if (response.url().includes('/api/v1/')) responses.push({ path: new URL(response.url()).pathname, status: response.status() })
  })
}
try {
  const fake = await browser.newContext()
  await fake.addInitScript(() => localStorage.setItem('idmp_access_token', 'invalid-login-acceptance-token'))
  const fakePage = await fake.newPage()
  observe(fakePage)
  await fakePage.goto(`${base}/factor`)
  await fakePage.waitForURL('**/login?redirect=**')
  assert.equal(await fakePage.evaluate(() => localStorage.getItem('idmp_access_token')), null)
  assert.equal(await fakePage.locator('.idmp-shell').count(), 0)
  pass('forged token cannot open business pages')
  await fake.close()

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  observe(page)
  const initial = responses.length
  await page.goto(`${base}/indicator?keyword=login-test#list`)
  await page.waitForURL('**/login?redirect=**')
  assert.equal(new URL(page.url()).searchParams.get('redirect'), '/indicator?keyword=login-test#list')
  assert.equal(responses.slice(initial).filter(item => !item.path.includes('/auth/')).length, 0)
  await page.screenshot({ path: fileURLToPath(new URL('login-desktop.png', output)) })
  pass('anonymous direct entry preserves the return URL without mounting or querying business pages')

  await page.getByLabel('工号', { exact: true }).fill(credentials.username)
  await page.getByLabel('密码', { exact: true }).fill('deliberately-wrong-acceptance-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.locator('.el-message--error').waitFor()
  assert.equal(new URL(page.url()).pathname, '/login')
  pass('incorrect password remains on login without exposing business data')
  await signIn(page)
  await page.waitForURL('**/indicator?keyword=login-test#list')
  await page.locator('.idmp-user__name').filter({ hasText: 'Login acceptance administrator' }).waitFor()
  pass('real administrator login returns to the original page with its identity')

  await page.goto(`${base}/system`)
  await page.getByRole('heading', { name: '当前会话', exact: true }).waitFor()
  assert.equal(await page.getByLabel('密码', { exact: true }).count(), 0)
  await page.getByRole('button', { name: '读取用户', exact: true }).first().click()
  await page.getByRole('cell', { name: credentials.username, exact: true }).waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('session-desktop.png', output)), fullPage: true })
  pass('system management uses the restored session and reads the protected real user list')

  await page.reload()
  await page.getByRole('heading', { name: '当前会话', exact: true }).waitFor()
  pass('browser reload validates the stored access token and keeps the user signed in')
  let before = responses.length
  await page.evaluate(() => localStorage.setItem('idmp_access_token', 'expired-acceptance-token'))
  await page.reload()
  await page.getByRole('heading', { name: '当前会话', exact: true }).waitFor()
  assert.ok(responses.slice(before).some(item => item.path === '/api/v1/auth/me' && item.status === 401))
  assert.ok(responses.slice(before).some(item => item.path === '/api/v1/auth/refresh' && item.status === 200))
  pass('expired access token is refreshed with real cookies after a full browser reload')

  before = responses.length
  await page.evaluate(() => localStorage.removeItem('idmp_access_token'))
  await page.reload()
  await page.getByRole('heading', { name: '当前会话', exact: true }).waitFor()
  assert.ok(responses.slice(before).some(item => item.path === '/api/v1/auth/refresh' && item.status === 200))
  const cookies = await context.cookies()
  assert.equal(cookies.filter(cookie => cookie.name === 'IDMP_REFRESH_CSRF').length, 1)
  assert.equal(cookies.find(cookie => cookie.name === 'IDMP_REFRESH_CSRF').path, '/')
  assert.equal(cookies.find(cookie => cookie.name === 'IDMP_REFRESH_TOKEN').httpOnly, true)
  pass('missing access token restores from refresh cookies and the legacy CSRF cookie is absent')

  await page.goto(`${base}/login?redirect=/factor`)
  await page.waitForURL('**/factor')
  pass('an authenticated visitor skips login and reaches the requested business page')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.waitForURL('**/login')
  assert.equal(await page.locator('.idmp-shell').count(), 0)
  assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('IDMP_REFRESH')).length, 0)
  await page.goBack()
  await page.waitForURL('**/login**')
  assert.equal(await page.locator('.idmp-shell').count(), 0)
  pass('logout clears cookies, unmounts cached business views and blocks browser Back')

  await signIn(page)
  await page.waitForURL(url => new URL(url).pathname !== '/login')
  const other = await context.newPage()
  observe(other)
  await other.goto(`${base}/system`)
  await other.getByRole('heading', { name: '当前会话', exact: true }).waitFor()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.waitForURL('**/login')
  await other.waitForURL('**/login')
  pass('logout propagates to another ordinary-login tab')
  await other.close()

  await signIn(page)
  await page.waitForURL(url => new URL(url).pathname !== '/login')
  const token = await page.evaluate(() => localStorage.getItem('idmp_access_token'))
  const revoked = await context.request.post(`${base}/api/v1/auth/logout-all`, { headers: { Authorization: `Bearer ${token}` }, data: {} })
  assert.equal(revoked.status(), 200)
  await page.evaluate(async () => {
    const { requestJson } = await import('/src/idmp/api/request.js')
    await requestJson('/system/users', { cache: 'no-store' }).catch(() => null)
  })
  await page.waitForURL('**/login?redirect=**')
  assert.equal(await page.locator('.idmp-shell').count(), 0)
  pass('server-side session revocation and failed refresh return to login without stale content')
  await context.close()

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobile.newPage()
  observe(mobilePage)
  await mobilePage.goto(`${base}/calc?batchId=102027642463173862#batch-overview`)
  await mobilePage.waitForURL('**/login?redirect=**')
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await mobilePage.screenshot({ path: fileURLToPath(new URL('login-mobile.png', output)), fullPage: true })
  await mobilePage.goto(`${base}/auto-login?token=invalid-live-acceptance-token`)
  await mobilePage.getByText('单点登录失败', { exact: true }).waitFor()
  assert.equal(new URL(mobilePage.url()).searchParams.has('token'), false)
  pass('mobile login fits and disabled medical SSO fails closed without leaking the URL token')
  await mobile.close()
  assert.deepEqual(errors, [])
  assert.equal(responses.filter(response => response.status >= 500).length, 0)
  pass('no browser runtime exception or backend 5xx')
  await writeFile(new URL('report.json', output), JSON.stringify({ passed, responses, errors }, null, 2))
  console.log(`Real authentication flow: ${passed.length} checks passed`)
} finally { await browser.close() }
