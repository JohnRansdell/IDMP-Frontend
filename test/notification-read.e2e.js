import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.NOTIFICATION_APP_PORT || 5173), debugPort = 41814
const profile = await mkdtemp(join(tmpdir(), 'idmp-notification-read-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser condition timed out') }
async function send(method, params = {}) {
  return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'notification-read-fixture')
  const realFetch = fetch.bind(window)
  const content = '住院死亡率超过预警阈值，请核查本期正式结果及对应科室的数据。'.repeat(25) + 'A'.repeat(300)
  const notifications = [1, 2, 3].map(id => ({ id: String(id), title: `通知 ${id}`, content, notificationStatus: 'UNREAD', createdAt: '2026-10-03T09:00:00' }))
  window.__notificationRequests = []
  window.__notificationDocument = document
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    window.__notificationRequests.push({ path, method: init.method || 'GET' })
    let data = [], status = 200
    if (path === '/auth/me') data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/me/notifications/unread-count') {
      const unreadCount = notifications.filter(item => item.notificationStatus === 'UNREAD').length
      if (window.__holdNextCount) {
        window.__holdNextCount = false
        await new Promise(resolve => { window.__releaseCount = resolve })
      }
      data = { unreadCount }
    } else if (path === '/me/notifications') data = { records: notifications, total: '3', pageNum: 1, pageSize: 100 }
    else if (/^\/me\/notifications\/\d+\/read$/.test(path)) {
      if (window.__failNextRead) { window.__failNextRead = false; status = 500 }
      else notifications.find(item => item.id === path.split('/').at(-2)).notificationStatus = 'READ'
      data = {}
    } else if (path === '/me/notifications/read-all') {
      notifications.forEach(item => { item.notificationStatus = 'READ' })
      data = {}
    }
    return new Response(JSON.stringify({ code: status === 200 ? '0' : 'INTERNAL_ERROR', message: status === 200 ? '' : '服务暂时不可用，请稍后重试。', data }), { status, headers: { 'Content-Type': 'application/json' } })
  }
}

const badgeCount = `document.querySelector('.notification-badge button').getAttribute('aria-label')`
const firstReadButton = `Array.from(document.querySelectorAll('#pane-notifications .el-table__body button')).find(el=>el.textContent.trim()==='标记已读')`
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/alerts` })
  await waitFor(() => evaluate(`!!document.querySelector('.alert-center')`))
  await waitFor(() => evaluate(`${badgeCount}==='查看 3 条未读站内通知'`))
  await evaluate(`document.querySelector('#tab-notifications').click()`)
  await waitFor(() => evaluate(`document.querySelectorAll('#pane-notifications .el-table__body tr').length===3`))
  await mkdir('.tmp/notification-read', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await evaluate(`document.querySelector('#pane-notifications .el-table__body tr td:nth-child(2)').scrollIntoView({block:'center',inline:'center',behavior:'instant'})`)
    await delay(200)
    const point = await evaluate(`(() => {const r=document.querySelector('#pane-notifications .el-table__body tr td:nth-child(2)').getBoundingClientRect();return {x:Math.max(80,Math.min(innerWidth-30,r.x+r.width/2)),y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.notification-content-tooltip')).some(el=>el.getBoundingClientRect().height>0)`))
    const tooltip = await evaluate(`(() => {const el=Array.from(document.querySelectorAll('.notification-content-tooltip')).find(el=>el.getBoundingClientRect().height>0);const r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,text:el.textContent,wrap:getComputedStyle(el).overflowWrap}})()`)
    assert.ok(tooltip.width <= Math.min(420, viewport.width - 32) + 1, JSON.stringify(tooltip))
    assert.ok(tooltip.height <= 321, JSON.stringify(tooltip))
    assert.ok(tooltip.left >= 0 && tooltip.right <= viewport.width, JSON.stringify(tooltip))
    assert.ok(tooltip.scrollHeight > tooltip.clientHeight)
    assert.equal(tooltip.wrap, 'anywhere')
    assert.match(tooltip.text, /A{300}/)
    await writeFile(`.tmp/notification-read/${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  const countsBeforeFailure = await evaluate(`window.__notificationRequests.filter(item=>item.path==='/me/notifications/unread-count').length`)
  await evaluate(`window.__failNextRead=true;(${firstReadButton}).click()`)
  await waitFor(() => evaluate(`!!document.querySelector('.el-message--error')`))
  assert.equal(await evaluate(badgeCount), '查看 3 条未读站内通知')
  assert.equal(await evaluate(`window.__notificationRequests.filter(item=>item.path==='/me/notifications/unread-count').length`), countsBeforeFailure)
  await evaluate(`(${firstReadButton}).click()`)
  await waitFor(() => evaluate(`${badgeCount}==='查看 2 条未读站内通知'`))
  await waitFor(() => evaluate(`document.querySelectorAll('#pane-notifications .el-table__body button').length===2`))
  assert.equal(await evaluate(`window.__notificationDocument===document`), true)
  await evaluate(`window.__holdNextCount=true;(${firstReadButton}).click()`)
  await waitFor(() => evaluate(`typeof window.__releaseCount==='function'`))
  await waitFor(() => evaluate(`document.querySelectorAll('#pane-notifications .el-table__body button').length===1`))
  await evaluate(`Array.from(document.querySelectorAll('#pane-notifications button')).find(el=>el.textContent.trim()==='全部已读').click()`)
  await waitFor(() => evaluate(`${badgeCount}==='查看 0 条未读站内通知'`))
  await evaluate(`window.__releaseCount()`)
  await delay(200)
  assert.equal(await evaluate(badgeCount), '查看 0 条未读站内通知')
  await waitFor(() => evaluate(`getComputedStyle(document.querySelector('.notification-badge .el-badge__content')).display==='none'`))
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.notification-badge .el-badge__content')).display`), 'none')
  assert.equal(await evaluate(`window.__notificationDocument===document`), true)
  assert.deepEqual(errors, [])
  console.log('PASS: single/all read refresh badge without reload, failed reads do not alter count, stale count ignored, responsive bounded tooltip')
} finally { socket?.close(); chrome.kill() }
