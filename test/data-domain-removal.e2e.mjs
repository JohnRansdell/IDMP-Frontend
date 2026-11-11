import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-domain-removal-'))
const debugPort = 41842
const output = '.tmp/data-domain-removal'
await mkdir(output, { recursive: true })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' })
let socket
let sequence = 0
const pending = new Map()
async function waitFor(check) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('页面验收等待超时')
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'domain-removal-fixture')
  const realFetch = fetch.bind(window)
  window.__tables = [{ id: '10', domainId: '9', tableName: 'vmq_visits', tableComment: '住院病案', status: 'PUBLISHED' },
    { id: '20', domainId: '9', tableName: 'vmq_surgery', tableComment: '手术记录', status: 'PUBLISHED' }]
  window.__deletes = []
  window.__blocked = true
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.startsWith('/api/v1/')) return realFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    const method = init.method || 'GET'
    let data = []
    if (path === '/auth/me') data = { user: { id: '1', username: '验收管理员' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/meta/data-domains') data = [{ id: '9', code: 'QUALITY', name: '医疗质量数据域', status: 'PUBLISHED' }]
    else if (path === '/meta/data-domains/9/physical-tables') data = window.__tables
    else if (path === '/meta/data-domains/9/physical-tables/10' && method === 'DELETE') {
      window.__deletes.push(path)
      if (window.__blocked) return new Response(JSON.stringify({ code: 'CONFLICT', message: '无法移除物理表，请先调整以下引用：因子：出院人次（V2）' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      window.__tables = window.__tables.filter(table => table.id !== '10')
      data = null
    } else if (path.endsWith('/semantic-fields')) data = [{ id: '101', sourceFieldMappingId: '1001', code: 'DEPT_CODE', name: '科室', sourceFieldName: 'dept_code', dataType: 'STRING', semanticKind: 'DIMENSION' }]
    else if (path.endsWith('/fields')) data = [{ columnName: 'dept_code', columnType: 'varchar(64)', comment: '科室编码' }]
    else if (path === '/meta/source-tables') data = [{ tableName: 'vmq_visits', comment: '住院病案' }, { tableName: 'vmq_surgery', comment: '手术记录' }]
    return new Response(JSON.stringify({ code: '0', message: '成功', data }), { headers: { 'Content-Type': 'application/json' } })
  }
}
const clickRemove = `(() => { const row = [...document.querySelectorAll('[aria-label="物理表"] .el-table__body tr')].find(row => row.textContent.includes('vmq_visits')); [...row.querySelectorAll('button')].find(button => button.textContent.trim() === '移除').click(); })()`
const confirm = `document.querySelector('.el-message-box__btns .el-button--primary').click()`
try {
  let target
  await waitFor(async () => {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) }
    catch { return false }
  })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5176/data/domains/9' })
  await waitFor(() => evaluate(`document.querySelector('[aria-label="物理表"]')?.textContent.includes('vmq_visits') || false`))
  await evaluate(`document.querySelector('[aria-label="物理表"] .el-table__body tr').click()`)
  await waitFor(() => evaluate(`document.querySelector('[aria-label="字段映射"]')?.textContent.includes('科室编码') || false`))
  await evaluate(clickRemove)
  await waitFor(() => evaluate(`!!document.querySelector('.el-message-box')`))
  assert.equal(await evaluate(`document.querySelector('.el-message-box').textContent.includes('源表及业务数据不受影响')`), true)
  await evaluate(`document.querySelector('.el-message-box__btns .el-button').click()`)
  await waitFor(() => evaluate(`!document.querySelector('.el-message-box')`))
  assert.equal(await evaluate('window.__deletes.length'), 0)
  await evaluate(clickRemove)
  await waitFor(() => evaluate(`!!document.querySelector('.el-message-box')`))
  await evaluate(confirm)
  await waitFor(() => evaluate(`document.body.textContent.includes('因子：出院人次（V2）')`))
  assert.equal(await evaluate(`document.querySelector('[aria-label="物理表"]').textContent.includes('vmq_visits')`), true)
  await waitFor(() => evaluate(`!document.querySelector('.el-message-box')`))
  await writeFile(join(output, 'desktop.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate('window.__blocked = false')
  await evaluate(clickRemove)
  await waitFor(() => evaluate(`!!document.querySelector('.el-message-box')`))
  await evaluate(confirm)
  await waitFor(() => evaluate(`!document.querySelector('[aria-label="物理表"]').textContent.includes('vmq_visits')`))
  assert.equal(await evaluate(`document.querySelector('[aria-label="字段映射"]').textContent.includes('请选择物理表')`), true)
  assert.equal(await evaluate('window.__deletes.length'), 2)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await writeFile(join(output, 'mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  console.log('PASS 数据域页面：取消、引用冲突提示、移除成功、字段清空；桌面和移动端截图已生成（模拟接口）')
} finally {
  socket?.close()
  chrome.kill()
}
