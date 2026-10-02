import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.SQL_IMPORT_PORT || 5173)
const debugPort = 41812
const profile = await mkdtemp(join(tmpdir(), 'idmp-sql-fields-'))
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
  localStorage.setItem('idmp_access_token', 'sql-fields-fixture')
  const realFetch = fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const data = url.pathname.endsWith('/auth/me') ? { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] } : []
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/indicator/import/sql` })
  await waitFor(() => evaluate(`!!document.querySelector('.sql-import-page')`))
  const time = { physicalTable: 'vmq_basicinformationzy', sqlAlias: 'b', columnName: 'In_Date', fieldReference: 'b.In_Date', columnType: 'datetime', comment: '入院时间', recommended: true }
  const department = { physicalTable: 'vmq_basicinformationzy', sqlAlias: 'b', columnName: 'out_dept_code', fieldReference: 'b.out_dept_code', columnType: 'varchar', comment: '出院科室编码' }
  const task = { importId: '100', status: 'AWAITING_METADATA', scope: 'FACTORS_AND_INDICATOR', preview: { valid: true, tables: [], factors: [{ key: 'total', suggestedCode: 'TOTAL', suggestedName: '入院人次', groupingSupported: true, timeFieldOptions: [time], dimensionFieldOptions: [department], dsl: { definitionType: 'SQL', calculationMode: 'TEMPORAL', periodColumn: 'b.In_Date' } }], formula: { template: { root: { nodeType: 'FACTOR_REF', factorKey: 'total' } } } } }
  await evaluate(`(() => { let c=document.querySelector('.sql-import-page').__vueParentComponent; while(c&&c.type.__name!=='SqlIndicatorImport')c=c.parent;window.__sqlFields=c.setupState;window.__sqlFields.accept(${JSON.stringify(task)});window.__sqlFields.factorMetadata[0].calculationMode='TEMPORAL';window.__sqlFields.indicator.dimensionGrain=['科室'];window.__sqlFields.factorMetadata[0].dimensionBindings={'科室':'b.out_dept_code'} })()`)
  await waitFor(() => evaluate(`!!document.querySelector('.sql-grouping .factor-bindings .el-select')`))
  await mkdir('.tmp/sql-import-field-labels', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1100, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await delay(300)
    const labels = await evaluate(`({time:document.querySelector('.time-field-control .el-select').textContent,dimension:document.querySelector('.sql-grouping .factor-bindings .el-select').textContent,timeValue:window.__sqlFields.factorMetadata[0].timeField,dimensionValue:window.__sqlFields.factorMetadata[0].dimensionBindings['科室']})`)
    assert.match(labels.time, /vmq_basicinformationzy\.In_Date/)
    assert.match(labels.dimension, /vmq_basicinformationzy\.out_dept_code/)
    assert.doesNotMatch(labels.time, /\bb\.In_Date/)
    assert.doesNotMatch(labels.dimension, /\bb\.out_dept_code/)
    assert.equal(labels.timeValue, 'b.In_Date')
    assert.equal(labels.dimensionValue, 'b.out_dept_code')
    await evaluate(`document.querySelector('.time-field-control').scrollIntoView({block:'center',behavior:'instant'})`)
    await writeFile(`.tmp/sql-import-field-labels/${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  assert.deepEqual(errors, [])
  console.log('PASS: SQL time and dimension selectors display real table names on desktop/mobile and preserve backend binding references')
} finally { socket?.close(); chrome.kill() }
