import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 41871, debugPort = 41872
const profile = await mkdtemp(join(tmpdir(), 'idmp-template-browser-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let chrome, socket
let sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser condition timed out') }
async function send(method, params = {}) { const id = ++sequence; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
function fixture() {
  localStorage.setItem('idmp_access_token', 'template-fixture')
  window.__requests = []
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return nativeFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    const body = init.body ? JSON.parse(init.body) : undefined
    window.__requests.push({ path, body })
    let data = {}
    if (path === '/auth/me') data = { user: { id: '1', username: 'test' }, roles: ['SYSTEM_ADMIN'], menus: [], permissions: [] }
    else if (path === '/meta/data-domains') data = [{ id: '1', code: 'SURGERY', name: '手术数据域', status: 'PUBLISHED' }]
    else if (path.endsWith('/physical-tables')) data = [{ id: '2', tableName: 'surgery', tableComment: '手术记录', defaultTimeSemanticFieldCode: 'OPERATION_TIME', status: 'PUBLISHED' }]
    else if (path.endsWith('/semantic-fields')) data = [{ id: '3', code: 'OPERATION_TIME', name: '手术时间', sourceFieldName: 'operation_date', dataType: 'STRING' }, { id: '4', code: 'LEVEL', name: '手术级别', sourceFieldName: 'surgery_level', dataType: 'STRING' }]
    else if (path.endsWith('/fields')) data = [{ columnName: 'operation_date', columnType: 'datetime', comment: '手术时间' }, { columnName: 'surgery_level', columnType: 'varchar(20)', comment: '手术级别' }]
    else if (path === '/factor-templates') data = { template: { id: '10' }, version: { id: '11' } }
    else if (path === '/factor-template-versions/11') data = { template: { id: '10', code: 'TEST', name: '手术计数模板' }, version: { id: '11', publicationStatus: 'DRAFT', templateDefinition: window.__requests.find(r => r.path === '/factor-templates')?.body?.templateDefinition || {}, parameters: [] } }
    return new Response(JSON.stringify({ code: '0', data }), { headers: { 'Content-Type': 'application/json' } })
  }
}
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}`)).ok } catch { return false } })
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); return !!target } catch { return false } })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve))
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.method === 'Runtime.exceptionThrown') errors.push(data.params); const call = pending.get(data.id); if (call) { pending.delete(data.id); data.error ? call.reject(new Error(data.error.message)) : call.resolve(data.result) } })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/factor/templates/new` })
  await until(() => evaluate(`!!document.querySelector('.editor-card')`))
  await evaluate(`(() => {let c=document.querySelector('.editor-card').__vueParentComponent;while(c&&c.type.__name!=='FactorTemplateEditor')c=c.parent;window.__editor=c.setupState})()`)
  await until(() => evaluate('window.__editor.domains.length === 1'))
  await evaluate(`window.__editor.designer.domainCode='SURGERY';window.__editor.handleDomainChange('SURGERY')`)
  await until(() => evaluate('window.__editor.tables.length === 1'))
  await evaluate(`window.__editor.designer.tableName='surgery';window.__editor.handleTableChange()`)
  await until(() => evaluate('window.__editor.fields.length === 2'))
  assert.deepEqual(await evaluate('window.__editor.fields.map(f=>f.code)'), ['operation_date', 'surgery_level'])
  assert.equal(await evaluate('window.__editor.designer.periodFieldCode'), 'operation_date')
  await evaluate(`window.__editor.form.code='TEMPLATE_TEST';window.__editor.form.name='手术计数模板';window.__editor.designer.drillPathVersionIds=['102027642461473150'];window.__editor.addParameter();Object.assign(window.__editor.designer.parameters[0],{code:'LEVEL',displayName:'手术级别',dataType:'STRING',defaultValue:'3'});Object.assign(window.__editor.designer.templateFilter,{enabled:true,fieldCode:'surgery_level',parameterCode:'LEVEL'});window.__editor.save()`)
  await until(() => evaluate(`window.__requests.some(r=>r.path==='/factor-templates')`))
  const payload = await evaluate(`window.__requests.find(r=>r.path==='/factor-templates').body`)
  assert.equal(payload.templateDefinition.primaryDomain.tableName, 'surgery')
  assert.equal(payload.templateDefinition.calculationMode, 'TEMPORAL')
  assert.equal(payload.templateDefinition.filters.children[1].fieldCode, 'operation_date')
  assert.deepEqual(payload.templateDefinition.drillPathVersionIds, ['102027642461473150'])
  assert.equal('enum' in payload.parameters[0].validation, false)
  assert.equal(await evaluate(`window.__requests.some(r=>r.path.includes('/semantic-tables'))`), false)
  await until(() => evaluate(`location.pathname.endsWith('/versions/11')`))
  await mkdir('.tmp/template-browser', { recursive: true })
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('.tmp/template-browser/desktop.png', Buffer.from(screenshot.data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  await writeFile('.tmp/template-browser/mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  assert.deepEqual(errors, [])
  console.log('PASS physical metadata, temporal period binding, form creation, parameter default, bigint IDs, desktop/mobile rendering')
} finally { socket?.close(); chrome?.kill(); server.kill() }
