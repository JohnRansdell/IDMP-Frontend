import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class Cdp {
  sequence = 0
  pending = new Map()
  errors = []
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject) })
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data)
      if (data.method === 'Runtime.exceptionThrown') this.errors.push(data.params.exceptionDetails)
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    return new Promise((resolve, reject) => { const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'field-type-fixture')
  const realFetch = window.fetch.bind(window)
  let mapped = { id: '1', code: 'EVENT_TIME', name: '事件日期', sourceFieldName: 'event_time', dataType: 'DATETIME',
    sourceDataType: 'varchar(32)', conversionFormat: 'yyyy/MM/dd HH:mm:ss', semanticKind: 'TIME', sourceFieldMappingId: '1' }
  if (location.pathname.startsWith('/factor/')) mapped = { ...mapped, dataType: 'STRING', conversionFormat: null }
  window.__mappingRequests = []
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/auth/me') data = { user: { id: '1', username: 'tester', displayName: '验收用户' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/meta/data-domains') data = [{ id: '1', code: 'TEST', name: '字段转换验收', status: 'PUBLISHED' }]
    else if (path.endsWith('/physical-tables')) data = [{ id: '1', tableName: 'records', status: 'PUBLISHED', defaultTimeSemanticFieldCode: 'EVENT_TIME' }]
    else if (path.endsWith('/semantic-fields')) {
      if (init.method === 'POST') { const body = JSON.parse(init.body); window.__mappingRequests.push(body); mapped = { ...mapped, ...body }; data = mapped }
      else data = [mapped]
    } else if (path.endsWith('/time-fields')) data = [{ columnName: 'event_time', columnType: 'varchar(32)', comment: '事件日期', requiresConfirmation: true, sampledValueCount: 100 }]
    else if (path.endsWith('/fields')) data = [{ columnName: 'event_time', columnType: 'varchar(32)', comment: '事件日期', nullable: true }]
    return new Response(JSON.stringify({ code: 'OK', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
const port = 41782
const profile = await mkdtemp(join(tmpdir(), 'idmp-field-type-browser-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let cdp
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('页面验收等待超时') }
async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) } catch { return false } })
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5173/data/domains/1' })
  await waitFor(() => evaluate(`!!document.querySelector('.data-domain-workspace .el-table')`))
  await evaluate(`(() => { let c = document.querySelector('.data-domain-workspace').__vueParentComponent; while(c && c.type.__name !== 'DataDomainWorkspace') c=c.parent; window.__workspace=c.setupState; window.__workspace.selectTable(window.__workspace.physicalTables[0]) })()`)
  await waitFor(() => evaluate(`window.__workspace.fieldRows.length === 1`))
  assert.equal(await evaluate(`window.__workspace.timeFieldOptions[0].code`), 'EVENT_TIME')
  await evaluate(`window.__workspace.openMappingDialog(window.__workspace.fieldRows[0])`)
  await waitFor(() => evaluate(`!!document.querySelector('.el-dialog input')`))
  assert.equal(await evaluate(`window.__workspace.mappingForm.conversionFormat`), 'yyyy/MM/dd HH:mm:ss')
  assert.equal(await evaluate(`window.__workspace.needsDateFormat`), true)
  await mkdir('.tmp/field-type-browser', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 }); await delay(150)
    const bounds = await evaluate(`(() => { const r=document.querySelector('.el-dialog').getBoundingClientRect(); return {left:r.left,right:r.right} })()`)
    assert.ok(bounds.left >= 0 && bounds.right <= viewport.width, JSON.stringify(bounds))
    await writeFile(`.tmp/field-type-browser/${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`window.__workspace.submitMapping()`)
  assert.equal(await evaluate(`window.__mappingRequests[0].conversionFormat`), 'yyyy/MM/dd HH:mm:ss')
  assert.equal(await evaluate(`window.__workspace.timeFieldOptions[0].dataType`), 'DATETIME')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5173/factor/edit/new' })
  await waitFor(() => evaluate(`!!document.querySelector('.factor-editor')`))
  await evaluate(`(() => { let c=document.querySelector('.factor-editor').__vueParentComponent; while(c && c.type.__name!=='FactorEditor')c=c.parent; window.__editor=c.setupState })()`)
  await waitFor(() => evaluate(`window.__editor.domains.length===1`))
  await evaluate(`window.__editor.dslForm.domainCode='TEST'; window.__editor.handleDomainChange()`)
  await evaluate(`window.__editor.dslForm.tableName='records'; window.__editor.handleTableChange()`)
  assert.equal(await evaluate(`window.__editor.periodFields[0].dataType`), 'STRING')
  assert.equal(await evaluate(`window.__editor.periodFields[0].periodCandidate`), true)
  assert.match(await evaluate(`window.__editor.periodFieldOptionLabel(window.__editor.periodFields[0])`), /文本日期（抽样识别）/)
  await evaluate(`window.__editor.dslForm.periodColumn='event_time'`)
  assert.equal(await evaluate(`window.__editor.buildDsl().periodColumn`), 'event_time')
  await evaluate(`document.querySelector('.time-binding').scrollIntoView({block:'center'});document.querySelector('.time-binding .el-select__wrapper').click()`)
  await delay(200)
  await writeFile('.tmp/field-type-browser/factor-time-candidates.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  assert.deepEqual(cdp.errors, [])
  console.log('PASS 日期格式回显、提交；普通因子文本时间候选、周期保存；桌面和移动端截图无溢出')
} finally { cdp?.socket.close(); chrome.kill() }
