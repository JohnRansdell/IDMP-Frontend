import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-source-summary-'))
const output = '.tmp/source-database-summary'
await mkdir(output, { recursive: true })
const port = 41843
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map()
async function waitFor(work) {
  for (let i = 0; i < 150; i++) {
    if (await work()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('页面验收等待超时')
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function backend() {
  localStorage.setItem('idmp_access_token', 'source-summary-fixture')
  const realFetch = fetch.bind(window)
  window.__databaseFails = false
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.startsWith('/api/v1/')) return realFetch(input, init)
    let data = []
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: '1', username: '验收管理员' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (url.pathname.endsWith('/meta/source-database')) {
      if (window.__databaseFails) return new Response(JSON.stringify({ code: 'UNAVAILABLE', message: '源数据库连接超时' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      data = { host: 'source-database.internal.example', databaseType: 'MySQL', databaseName: 'yunnan-vmq' }
    } else if (url.pathname.endsWith('/meta/source-tables')) data = [{ tableName: 'vmq_visits', tableType: 'BASE TABLE', comment: '住院病案', fieldCount: 12 }]
    return new Response(JSON.stringify({ code: 'OK', message: '成功', data }), { headers: { 'Content-Type': 'application/json' } })
  }
}
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); return Boolean(target) } catch { return false } })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); const request = pending.get(message.id); if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) } })
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${backend.toString()})()` })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5176/data/sources' })
  await waitFor(() => evaluate(`document.querySelector('[aria-label="源数据库信息"]')?.textContent.includes('yunnan-vmq') || false`))
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 })
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.source-database__details dd')).every(e => e.scrollWidth <= e.clientWidth + 1)`), true)
    await writeFile(join(output, `${name}.png`), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`window.__databaseFails = true; [...document.querySelectorAll('button')].find(b => b.textContent.includes('刷新目录')).click()`)
  await waitFor(() => evaluate(`document.querySelector('.source-database__error')?.textContent.includes('源数据库连接超时') || false`))
  assert.equal(await evaluate(`document.querySelector('.table-card').textContent.includes('vmq_visits')`), true)
  await evaluate(`window.__databaseFails = false; document.querySelector('.source-database__error button').click()`)
  await waitFor(() => evaluate(`!document.querySelector('.source-database__error')`))
  console.log('PASS 数据源信息展示、独立错误提示、重试恢复、桌面及窄屏布局（模拟接口）')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) console.error(await evaluate('document.body.innerText.slice(0, 2200)'))
  throw error
} finally {
  socket?.close()
  chrome.kill()
}
