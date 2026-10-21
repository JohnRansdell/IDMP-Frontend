import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { annotateDepartmentFilterFields, departmentFilterBinding, isDepartmentFilterField, loadDepartmentCodeOptions } from '../src/idmp/features/dashboard/departmentFilters.js'
import { buildRemoteWidgetQuery } from '../src/idmp/features/dashboard/remoteQuery.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
import { createDepartmentDictionaryLoader } from '../src/idmp/features/shared/departmentDictionary.js'

const env = loadEnv('development', process.cwd(), '')
const target = env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL
assert.ok(/^https?:/.test(target || ''), 'Configure a real API target before running this read-only test')
const allowed = (path, method) => method === 'GET' || method === 'POST' && /\/(query|preview|filter-options|search)$/.test(path)
async function api(path, body) {
  assert.ok(allowed(path, body ? 'POST' : 'GET'))
  const response = await fetch(new URL('/api/v1' + path, target), { signal: AbortSignal.timeout(60000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const result = parse(await response.text())
  assert.equal(response.status, 200, `Read-only API failed: ${path}`)
  return result.data ?? result
}
const catalog = await api('/analysis/dashboards')
const entry = catalog.find(item => String(item.name).toLowerCase() === 'test')
assert.ok(entry, 'The live test dashboard must exist')
const detail = await api(`/analysis/dashboards/${entry.id}`)
const widgets = detail.version.widgets.filter(widget => ['PIE', 'KPI', 'KPI_CARD'].includes(widget.type))
assert.ok(widgets.some(widget => widget.type === 'PIE') && widgets.some(widget => widget.type !== 'PIE'))
const metadata = await Promise.all(widgets.map(async widget => {
  const [fields, version, periods] = await Promise.all([
    api(`/analysis/dashboard-data-sources/${widget.dataSourceCode}/fields`),
    api(`/indicator-versions/${widget.indicatorVersionId}`),
    api(`/analysis/dashboard-data-sources/${widget.dataSourceCode}/available-periods`)
  ])
  const annotated = annotateDepartmentFilterFields(fields, version.drillConfig?.drillPaths || version.drillPaths || [])
  return { widget, fields: annotated, binding: departmentFilterBinding(annotated), periods }
}))
assert.ok(metadata.every(item => item.binding), 'Both widgets need a declared department code')
const definition = detail.version.globalFilters.find(def => isDepartmentFilterField(def.field, metadata.flatMap(item => item.fields)))
assert.ok(definition && definition.type === 'multi-select', 'The test dashboard needs its existing multi-select department filter')
const sets = metadata.map(item => new Set(item.periods.filter(period => period.periodType === 'MONTHLY').map(period => period.periodStart.slice(0, 7))))
const month = [...sets[0]].filter(value => sets.every(set => set.has(value))).sort().at(-1)
assert.ok(month)
const start = month + '-01', end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10)
const dictionary = createDepartmentDictionaryLoader(({ page, size }) => api(`/meta/departments?page=${page}&size=${size}`))
const optionLists = await Promise.all(metadata.map(item => loadDepartmentCodeOptions({
  fields: item.fields, fetchDictionary: dictionary
})))
const options = optionLists[0].filter(option => optionLists.every(list => list.some(item => item.value === option.value)))
assert.ok(options.length >= 2)
const first = options.find(option => option.value === '5'), second = options.find(option => option.value === '22')
assert.ok(first && second, 'Known departments with real results must be in the master dictionary')
assert.notEqual(first.label, first.value)
const evidence = '.tmp/dashboard-department-live'
await mkdir(evidence, { recursive: true })
const checks = []
// The same frontend planner is exercised against real APIs for both old code and name definitions.
for (const field of ['OUT_DEPT_CODE', '科室名称']) {
  for (const item of metadata) {
    const planned = buildRemoteWidgetQuery({ id: item.widget.code, config: {} }, {
      fields: item.fields, periodStart: start, periodEnd: end, definitions: [{ ...definition, field }], values: { [definition.id]: [first.value] }
    })
    assert.deepEqual(planned.query.filters, { [item.binding.codeField]: [first.value] })
    const result = expandDashboardResponse(await api(`/analysis/dashboards/${entry.id}/query`, { ...planned.query, responseFormat: 'COMPACT' })).widgets[item.widget.code]
    assert.equal(result.status, 'READY')
    assert.ok(result.rows.length > 0)
    checks.push({ definitionField: field, widgetType: item.widget.type, filters: planned.query.filters, status: result.status, rowCount: result.rows.length })
  }
}

const appPort = 41951, debugPort = 41952
const profile = await mkdtemp(join(tmpdir(), 'idmp-dept-live-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let n = 0; n < 450; n++) { if (await check()) return; await pause(150) } throw new Error(`Timed out: ${label}`) }
let socket, id = 0
const pending = new Map(), errors = []
const browserChecks = []
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); socket.send(JSON.stringify({ id: n, method, params })) }) }
async function evaluate(expression) { const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails)); return data.result.value }
const selector = `.filter-control[data-filter-field="${definition.field}"]`
async function selectCode(code) {
  assert.equal(await evaluate(`(() => { const root=document.querySelector(${JSON.stringify(selector)}); const details=root?.querySelector('details'); if(details)details.open=true; const checkbox=root?.querySelector('input[data-filter-option="${code}"]'); if(!checkbox)return false; checkbox.click();return true })()`), true)
}
async function awaitQueries(values, label) {
  for (const item of metadata) {
    const field = item.binding.codeField
    await until(() => evaluate(`window.__departmentCalls.some(call => call.path.endsWith('/query') && call.body?.widgetCodes?.includes(${JSON.stringify(item.widget.code)}) && JSON.stringify(call.body.filters?.[${JSON.stringify(field)}] || [])===${JSON.stringify(JSON.stringify(values))})`), `${label}: ${item.widget.type}`)
  }
  await until(() => evaluate(`document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length>=${widgets.length} && !document.querySelector('.dashboard-schema-viewer .el-loading-mask')`), `${label}: rendered results`)
}
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'Vite')
  let page
  await until(async () => { try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!page } catch { return false } }, 'Chrome')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails); const p = pending.get(message.id); if (p) { pending.delete(message.id); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result) } })
  await send('Page.enable'); await send('Runtime.enable')
  // Record requests while passing them to the actual backend. Writes are explicitly blocked.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {const original=window.fetch.bind(window);window.__departmentCalls=[];window.fetch=async(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;const method=options.method||'GET';if(path.includes('/api/v1/')){if(method!=='GET'&&!(method==='POST'&&/\\/(query|preview|filter-options|search)$/.test(path)))throw new Error('Live test blocks writes');window.__departmentCalls.push({path,method,body:options.body?JSON.parse(options.body):null})}return original(input,options)}})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:${appPort}/dashboard?id=${entry.id}` })
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}+' input[data-filter-option="${first.value}"]')`), 'real department options')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(selector)}+' input[data-filter-option="${first.value}"]')?.closest('label').textContent.trim()===${JSON.stringify(first.label)}`), 'real department names')
  const label = await evaluate(`document.querySelector(${JSON.stringify(selector)}+' input[data-filter-option="${first.value}"]').closest('label').textContent.trim()`)
  assert.equal(label, first.label)
  await until(() => evaluate(`document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length>=${widgets.length}`), 'initial real results')
  const initialKpi = await evaluate(`document.querySelector('[data-testid="binding-widget"]')?.innerText`)
  await evaluate('window.__departmentCalls=[]')
  await selectCode(first.value)
  await awaitQueries([first.value], 'single department')
  browserChecks.push({ phase: 'single', calls: await evaluate(`window.__departmentCalls.filter(call=>call.path.endsWith('/query')).map(call=>({widgetCodes:call.body.widgetCodes,filters:call.body.filters}))`) })
  assert.equal(await evaluate(`document.body.innerText.includes('当前周期暂无分类对比结果')`), false)
  await writeFile(join(evidence, 'single-department.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate('window.__departmentCalls=[]')
  await selectCode(second.value)
  await awaitQueries([first.value, second.value], 'multiple departments')
  browserChecks.push({ phase: 'multiple', calls: await evaluate(`window.__departmentCalls.filter(call=>call.path.endsWith('/query')).map(call=>({widgetCodes:call.body.widgetCodes,filters:call.body.filters}))`) })
  await evaluate(`window.__departmentCalls=[];document.querySelector('[data-testid="dashboard-filter-reset"]').click()`)
  // Reset may reuse an unfiltered backend result already in the Dashboard query cache.
  await until(() => evaluate(`!document.querySelector(${JSON.stringify(selector)}+' input:checked') && document.querySelectorAll('[data-testid="binding-widget"][data-binding-status="ready"]').length>=${widgets.length} && document.querySelector('[data-testid="binding-widget"]')?.innerText===${JSON.stringify(initialKpi)}`), 'clear restores unfiltered real result')
  assert.deepEqual(errors, [])
  const calls = await evaluate(`window.__departmentCalls.filter(call=>call.path.endsWith('/query')).map(call=>({widgetCodes:call.body.widgetCodes,filters:call.body.filters}))`)
  const result = { passed: true, readOnly: true, dashboardName: entry.name, month, selection: first, secondSelection: second, checks, browserChecks, resetRestoredOriginalResult: true, resetCalls: calls, errors }
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await writeFile(join(evidence, 'failure.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({url:location.pathname,text:document.body.innerText,calls:window.__departmentCalls})`), null, 2))
  }
  throw error
} finally { socket?.close(); chrome.kill(); server.kill() }
