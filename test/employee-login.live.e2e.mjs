import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const { chromium } = createRequire(import.meta.url)('playwright')
const base = process.env.IDMP_AUTH_TEST_URL || 'http://127.0.0.1:5176'
const portal = process.env.IDMP_MEDICAL_PORTAL_URL || 'http://127.0.0.1:5180'
const output = new URL('../.tmp/employee-login-live/', import.meta.url)
await mkdir(output, { recursive: true })
const credentials = JSON.parse(await readFile(process.env.IDMP_AUTH_TEST_CREDENTIALS || new URL('../.tmp/forced-login-admin-20261024.json', import.meta.url), 'utf8'))
const config = await (await fetch(`${portal}/test/config`)).json()
// Only initialize a password for the simulator's own acceptance identity.
const person = config.users.find(user => user.doctorNo === 'SSO_TEST_RESP')
assert.ok(person, 'This test must not reset a real hospital account')
const password = `Test-${randomBytes(24).toString('base64url')}`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const errors = [], passed = [], sessions = []
let admin
async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: response.status, payload: parse(await response.text()) }
}
async function launch() {
  const response = await fetch(`${portal}/test/launch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(portal).origin },
    body: JSON.stringify({ user: person.id, mode: 'catalog', baseUrl: config.integrationBaseUrl })
  })
  assert.equal(response.status, 200)
  const url = new URL((await response.json()).url)
  return url.searchParams.get('token')
}
async function exchange() {
  const response = await request('/auth/sso/exchange', { method: 'POST', body: { token: await launch(), entry: 'PLATFORM' } })
  assert.equal(response.status, 200, response.payload.message)
  sessions.push(response.payload.data.session.accessToken)
  return response.payload.data
}
const pass = name => { passed.push(name); console.log('PASS', name) }
try {
  const login = await request('/auth/login', { method: 'POST', body: credentials })
  assert.equal(login.status, 200)
  admin = login.payload.data.accessToken
  const first = await exchange()
  const id = first.identity.userId
  assert.equal(first.session.user.username, person.doctorNo)
  assert.equal(first.session.user.displayName, person.displayName)
  assert.ok(!first.session.user.roles.some(role => ['ADMIN', 'SYSTEM_ADMIN'].includes(role)))
  const unavailable = await request('/auth/login', { method: 'POST', body: { username: person.doctorNo, password: '!SSO_ONLY!' } })
  assert.equal(unavailable.status, 401)
  pass('verified SSO uses employee number and real name without a shared password or administrator privilege')

  const reset = await request(`/system/users/${id}/password`, { method: 'PUT', token: admin, body: { password } })
  assert.equal(reset.status, 200)
  await writeFile(new URL('simulator-credentials.json', output), JSON.stringify({ username: person.doctorNo, password }))
  assert.equal((await request('/auth/me', { token: first.session.accessToken })).status, 401)
  const second = await exchange()
  assert.equal(second.identity.userId, id)
  const ordinary = await request('/auth/login', { method: 'POST', body: { username: person.doctorNo, password } })
  assert.equal(ordinary.status, 200)
  sessions.push(ordinary.payload.data.accessToken)
  assert.equal(ordinary.payload.data.user.id, id)
  assert.deepEqual(ordinary.payload.data.user.roles, second.session.user.roles)
  assert.equal((await request('/system/users', { token: ordinary.payload.data.accessToken })).status, 403)
  pass('explicit administrator password initialization revokes old sessions; password and SSO login share one user ID and roles')

  const detail = await request(`/system/users/${id}`, { token: admin })
  const rename = await request(`/system/users/${id}`, { method: 'PUT', token: admin,
    body: { ...detail.payload.data.user, userName: 'SHOULD_NOT_RENAME_EMPLOYEE' } })
  assert.equal(rename.status, 409)
  assert.equal((await request('/auth/me', { token: second.session.accessToken })).status, 200)
  pass('administrative editing cannot break the employee-number identity link')

  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/login`)
    await page.getByLabel('工号', { exact: true }).fill(person.doctorNo)
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/dashboard')
    await page.getByText('账号尚未配置平台权限', { exact: true }).waitFor()
    const user = await page.evaluate(async () => {
      const token = localStorage.getItem('idmp_access_token')
      const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      return (await response.json()).data.user
    })
    assert.equal(String(user.id), String(id))
    assert.equal(user.username, person.doctorNo)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: fileURLToPath(new URL(`password-${width}.png`, output)), fullPage: true })
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL('**/login')
    await page.goto(`${base}/auto-login?token=${encodeURIComponent(await launch())}`)
    await page.waitForURL('**/dashboard')
    await page.getByText('账号尚未配置平台权限', { exact: true }).waitFor()
    const sso = await page.evaluate(async () => {
      const token = sessionStorage.getItem('idmp_medical_access_token')
      const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      return (await response.json()).data.user
    })
    assert.equal(String(sso.id), String(id))
    assert.equal(sso.username, person.doctorNo)
    assert.deepEqual(sso.roles, user.roles)
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForURL('**/login')
    await context.close()
    pass(`${width}px: real browser password login and SSO enter the same employee account without elevated permissions`)
  }
  assert.deepEqual(errors, [])
  await writeFile(new URL('report.json', output), JSON.stringify({ passed, errors }, null, 2))
} finally {
  for (const token of sessions) await request('/auth/logout', { method: 'POST', token, body: {} }).catch(() => {})
  if (admin) await request('/auth/logout', { method: 'POST', token: admin, body: {} }).catch(() => {})
  await browser.close()
}
