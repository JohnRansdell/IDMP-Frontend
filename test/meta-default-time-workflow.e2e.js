import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.META_TIME_APP_PORT || 41831)
const debugPort = 41832
const profile = await mkdtemp(join(tmpdir(), 'idmp-meta-time-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let chrome
let socket
let sequence = 0
const pending = new Map()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(check) {
  for (let i = 0; i < 150; i++) {
    try { if (await check()) return } catch {}
    await delay(100)
  }
  throw new Error('Browser acceptance condition timed out')
}

async function cdp(method, params = {}) {
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
  localStorage.setItem('idmp_access_token', 'meta-time-fixture')
  const realFetch = fetch.bind(window)
  window.__semanticType = 'STRING'
  window.__defaultTimeCode = ''
  window.__metaWrites = []
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const path = url.pathname.replace('/api/v1', '')
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    let data = {}
    if (path === '/auth/me') data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/meta/data-domains') data = [{ id: '9', code: 'DEMO', name: '演示数据域', status: 'DRAFT' }]
    else if (path === '/meta/data-domains/9/physical-tables' && method === 'GET') data = [{ id: '10', tableName: 'vmq_basicinformationba', defaultTimeSemanticFieldCode: window.__defaultTimeCode, status: 'DRAFT' }]
    else if (path === '/meta/source-tables/vmq_basicinformationba/fields') data = [
      { columnName: 'out_date', columnType: 'varchar(32)', comment: '出院时间' },
      { columnName: 'create_date', columnType: 'datetime', comment: '创建时间' }
    ]
    else if (path === '/meta/data-domains/9/physical-tables/vmq_basicinformationba/semantic-fields') data = [
      { id: '11', code: 'OUT_DATE', name: '出院时间', sourceFieldName: 'out_date', dataType: 'STRING', semanticKind: 'TIME' },
      { id: '12', code: 'CREATE_DATE', name: '创建时间', sourceFieldName: 'create_date', dataType: 'DATETIME', semanticKind: 'TIME' }
    ]
    else if (path === '/meta/semantic-fields/11' && method === 'GET') data = { id: '11', code: 'OUT_DATE', name: '出院时间', valueType: window.__semanticType, semanticKind: 'TIME', nullable: true, sensitivityLevel: 'NONE', resourceVersion: 0 }
    else if (path === '/meta/semantic-fields/12' && method === 'GET') data = { id: '12', code: 'CREATE_DATE', name: '创建时间', valueType: 'DATETIME', semanticKind: 'TIME', nullable: true, sensitivityLevel: 'NONE', resourceVersion: 0 }
    else if (path === '/meta/semantic-fields/11' && method === 'PATCH') {
      window.__metaWrites.push({ path, method, body })
      window.__semanticType = body.valueType
      data = { id: '11', code: 'OUT_DATE', name: body.name, valueType: body.valueType, semanticKind: body.semanticKind, nullable: true, sensitivityLevel: body.sensitivityLevel, resourceVersion: 1 }
    } else if (path === '/meta/data-domains/9/physical-tables/vmq_basicinformationba/default-time-field' && method === 'PATCH') {
      window.__metaWrites.push({ path, method, body })
      if (window.__semanticType !== 'DATETIME') return new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: '默认时间字段必须为 DATE 或 DATETIME 语义字段' }), { status: 422 })
      window.__defaultTimeCode = body.semanticFieldCode
      data = { id: '10', tableName: 'vmq_basicinformationba', defaultTimeSemanticFieldCode: window.__defaultTimeCode, status: 'DRAFT' }
    }
    return new Response(JSON.stringify({ code: 'OK', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok)
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let target
  await waitFor(async () => { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
  })
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/data/domains/9` })
  await waitFor(() => evaluate(`!!document.querySelector('.data-domain-workspace [aria-label="物理表"]')`))
  await evaluate(`(() => { let c=document.querySelector('.data-domain-workspace').__vueParentComponent; while(c&&c.type.__name!=='DataDomainWorkspace') c=c.parent; window.__workspace=c.setupState; window.__workspace.selectTable(window.__workspace.physicalTables[0]); })()`)
  await waitFor(() => evaluate(`window.__workspace.sourceFields.length === 2 && !window.__workspace.fieldLoading`))
  assert.equal(await evaluate(`!!document.querySelector('#default-time-field')`), false)
  assert.equal(await evaluate(`document.querySelector('[aria-label="物理表"]').textContent.includes('默认时间字段')`), false)
  await evaluate(`window.__workspace.openMappingDialog(window.__workspace.fieldRows.find(x=>x.columnName==='out_date'))`)
  await waitFor(() => evaluate(`window.__workspace.mappingDialogVisible`))
  assert.equal(await evaluate(`window.__workspace.mappingForm.dataType`), 'STRING')
  await evaluate(`window.__workspace.mappingForm.dataType='DATETIME'; window.__workspace.submitMapping()`)
  await waitFor(() => evaluate(`window.__semanticType==='DATETIME' && !window.__workspace.mappingSaving`))
  assert.equal(await evaluate(`window.__workspace.mappedFields.find(x=>x.code==='OUT_DATE').dataType`), 'DATETIME')
  assert.equal(await evaluate(`window.__defaultTimeCode`), '')
  assert.deepEqual(await evaluate(`window.__metaWrites.map(x=>({path:x.path,method:x.method,valueType:x.body.valueType,semanticFieldCode:x.body.semanticFieldCode}))`), [
    { path: '/meta/semantic-fields/11', method: 'PATCH', valueType: 'DATETIME' }
  ])
  console.log('PASS semantic field editing without a table-level default time control')
} finally {
  socket?.close()
  chrome?.kill()
  server.kill()
}
