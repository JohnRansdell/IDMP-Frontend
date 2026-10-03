import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.MAPPING_APP_PORT || 5173), debugPort = 41826
const profile = await mkdtemp(join(tmpdir(), 'idmp-mapping-alignment-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) }
  throw new Error('Browser condition timed out')
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'mapping-alignment-fixture')
  const realFetch = fetch.bind(window)
  window.__mappingRequests = []
  window.__mappingDocument = document
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    if (url.pathname.endsWith('/mappings')) window.__mappingRequests.push(url.href)
    let data = { records: [], total: 0 }
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    if (url.pathname.endsWith('/unread-count')) data = { unreadCount: 0 }
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/mapping` })
  await waitFor(() => evaluate(`!!document.querySelector('.mapping-filter .el-select') && window.__mappingRequests.length > 0`))
  await mkdir('.tmp/mapping-alignment', { recursive: true })
  for (const width of [1440, 1280, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width < 500, deviceScaleFactor: 1 })
    await delay(200)
    const fields = await evaluate(`Array.from(document.querySelectorAll('.mapping-filter .el-form-item')).map(el=>{ const item=el.getBoundingClientRect(),control=el.querySelector('.el-select,.el-input').getBoundingClientRect(),label=el.querySelector('.el-form-item__label').getBoundingClientRect(); return {label:el.querySelector('.el-form-item__label').textContent,itemX:item.x,itemRight:item.right,x:control.x,y:control.y,width:control.width,height:control.height,labelWidth:label.width} })`)
    assert.equal(fields.length, 5)
    for (const field of fields) {
      assert.equal(field.labelWidth, 96)
      assert.ok(Math.abs(field.x - field.itemX - 96) < 1, JSON.stringify(field))
      assert.ok(Math.abs(field.itemRight - field.x - field.width) < 1, JSON.stringify(field))
      assert.ok(field.width > 100, JSON.stringify(field))
      assert.ok(Math.abs(field.width - fields[0].width) < 1)
      assert.equal(field.height, fields[0].height)
    }
    const group = fields.find(item => item.label === '语义组'), status = fields.find(item => item.label === '审核状态')
    if (width === 1440) assert.ok(Math.abs(group.x - status.x) < 1)
    const actions = await evaluate(`(() => {const form=document.querySelector('.mapping-form').getBoundingClientRect(),category=document.querySelector('.mapping-type-shortcuts > span').getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('.mapping-filter__actions button')).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {formRight:form.right,categoryCenter:category.y+category.height/2,buttons}})()`)
    assert.equal(actions.buttons.length, 2)
    assert.ok(Math.abs(actions.buttons.at(-1).right - actions.formRight) < 1, JSON.stringify(actions))
    assert.ok(actions.buttons[0].y >= Math.max(...fields.map(field=>field.y+field.height))+14)
    if (width >= 1280) assert.ok(Math.abs(actions.categoryCenter-(actions.buttons[0].y+actions.buttons[0].bottom)/2)<1)
    console.log(`Mapping filter layout passed at ${width}px`)
    await writeFile(`.tmp/mapping-alignment/${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`(() => { const input=document.querySelector('.mapping-filter .el-input input'); input.value='999'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await evaluate(`document.querySelector('.mapping-filter__actions button[type="submit"]').click()`)
  await waitFor(() => evaluate(`window.__mappingRequests.some(url=>new URL(url).searchParams.get('policyFileId')==='999')`))
  await evaluate(`document.querySelectorAll('.mapping-filter__actions button')[1].click()`)
  await waitFor(() => evaluate(`document.querySelector('.mapping-filter .el-input input').value===''`))
  assert.equal(await evaluate(`window.__mappingDocument===document && location.pathname==='/mapping'`), true)
  assert.deepEqual(errors, [])
  console.log('Mapping query and reset actions passed without reloading the page')
} finally { socket?.close(); chrome.kill() }
