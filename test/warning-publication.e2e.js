import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.WARNING_APP_PORT || 5173), debugPort = 41813
const profile = await mkdtemp(join(tmpdir(), 'idmp-warning-publication-'))
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
  localStorage.setItem('idmp_access_token', 'warning-publication-fixture')
  const realFetch = fetch.bind(window)
  const version = (id, publicationStatus) => ({ id, publicationStatus, resourceVersion: 7, warningType: 'THRESHOLD', indicatorVersionId: '101', periodType: 'MONTHLY', condition: { operator: 'GT', threshold: '0.08' }, notificationPolicy: { recipientUserIds: ['1'] } })
  const rules = [
    { id: '1', name: '未发布测试规则', code: 'DRAFT_RULE', resourceVersion: 4, enableStatus: 'DISABLED', currentPublishedVersionId: null, version: version('11', 'DRAFT') },
    { id: '2', name: '已发布未启用测试规则', code: 'PUBLISHED_RULE', resourceVersion: 5, enableStatus: 'DISABLED', currentPublishedVersionId: '20', version: version('20', 'PUBLISHED') },
    { id: '3', name: '已发布已启用测试规则', code: 'ENABLED_RULE', resourceVersion: 6, enableStatus: 'ENABLED', currentPublishedVersionId: '30', version: version('30', 'PUBLISHED') }
  ]
  window.__warningRequests = []
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    const body = init.body ? JSON.parse(init.body) : null
    window.__warningRequests.push({ path, query: url.search, method: init.method || 'GET', body })
    let data = []
    if (path === '/auth/me') data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/analysis/warning-rules') {
      const status = url.searchParams.get('publicationStatus')
      const records = rules.filter(rule => !status || rule.version.publicationStatus === status)
      data = { records, total: String(records.length), pageNum: 1, pageSize: 20 }
    } else if (path === '/analysis/warning-rule-versions/11/publish') {
      if (body?.resourceVersion !== 7) throw new Error('Publication must use the version resourceVersion')
      rules[0].version.publicationStatus = 'PUBLISHED'
      rules[0].currentPublishedVersionId = '11'
      data = rules[0]
    } else if (path === '/system/users') data = [{ id: '1', username: 'tester' }]
    return new Response(JSON.stringify({ code: '0', data }), { headers: { 'Content-Type': 'application/json' } })
  }
}

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
  await evaluate(`document.querySelector('#tab-rules').click()`)
  await waitFor(() => evaluate(`document.querySelector('#pane-rules .el-table__body')?.textContent.includes('未发布测试规则')`))
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await delay(200)
    const rows = await evaluate(`Array.from(document.querySelectorAll('#pane-rules .el-table__body tr')).map(row=>row.textContent)`)
    assert.match(rows[0], /未发布.*未启用/)
    assert.match(rows[0], /编辑草稿.*发布/)
    assert.match(rows[1], /已发布.*未启用/)
    assert.match(rows[2], /已发布.*已启用/)
    assert.doesNotMatch(await evaluate(`document.querySelector('#pane-rules').textContent`), /下一步/)
    await mkdir('.tmp/warning-publication', { recursive: true })
    await writeFile(`.tmp/warning-publication/${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await evaluate(`document.querySelectorAll('#pane-rules .el-form-item')[3].querySelector('.el-select').click()`)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent==='未发布')`))
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent==='未发布').click()`)
  await evaluate(`Array.from(document.querySelectorAll('#pane-rules button')).find(el=>el.textContent.trim()==='查询').click()`)
  await waitFor(() => evaluate(`document.querySelectorAll('#pane-rules .el-table__body tr').length===1`))
  assert.ok(await evaluate(`window.__warningRequests.some(item=>item.path==='/analysis/warning-rules'&&item.query.includes('publicationStatus=DRAFT'))`))
  await evaluate(`Array.from(document.querySelectorAll('#pane-rules .el-table__body button')).find(el=>el.textContent.trim()==='发布').click()`)
  await waitFor(() => evaluate(`!!document.querySelector('.el-message-box')`))
  await evaluate(`Array.from(document.querySelectorAll('.el-message-box button')).find(el=>el.textContent.trim()==='发布规则').click()`)
  await waitFor(() => evaluate(`window.__warningRequests.some(item=>item.path==='/analysis/warning-rule-versions/11/publish')`))
  const publication = await evaluate(`window.__warningRequests.find(item=>item.path==='/analysis/warning-rule-versions/11/publish')`)
  assert.deepEqual(publication.body, { resourceVersion: 7 })
  await waitFor(() => evaluate(`document.querySelector('#pane-rules').textContent.includes('暂无预警规则')`))
  assert.deepEqual(errors, [])
  console.log('PASS: draft/published badges, independent enablement, DRAFT filter and publication version on desktop/mobile')
} finally { socket?.close(); chrome.kill() }
