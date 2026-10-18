import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const appPort = 41931, debugPort = 41932
const evidence = '.tmp/factor-detail-browser'
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-factor-detail-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) { for (let i = 0; i < 250; i++) { if (await predicate()) return; await pause(100) } throw new Error(`Timed out: ${label}`) }
let socket, next = 0
const pending = new Map(), errors = []
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
async function click(label, scope = 'document') { assert.equal(await evaluate(`(() => { const el=Array.from(${scope}.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(label)});if(!el||el.disabled)return false;el.click();return true })()`), true, label) }
async function navigate(path, selector) { await send('Page.navigate', { url: `http://127.0.0.1:${appPort}${path}` }); await until(() => evaluate(`!!document.querySelector('${selector}')`), path) }
async function screenshot(name) { await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
function fixture() {
  const original = fetch.bind(window)
  window.__factorCalls = []
  const master = id => ({ id, code: `FACTOR_${id}`, name: id === '900' ? '复合因子查看验收' : '上游原子因子', category: '医疗质量', description: '独立详情页验收', definitionKind: id === '900' ? 'DERIVED' : 'SOURCE', status: 'PUBLISHED', currentPublishedVersionId: id === '900' ? '901' : '911', draftVersionId: id === '900' ? '902' : null })
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    if (!path.startsWith('/api/v1/')) return original(input, options)
    const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null
    window.__factorCalls.push({ path, method, body })
    let data = {}
    if (path.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path === '/api/v1/factors') data = { records: [master('900'), master('910')], total: 2 }
    else if (/\/factors\/(900|910)$/.test(path)) data = master(path.split('/').at(-1))
    else if (path.endsWith('/factors/900/versions')) data = [{ id: '901', versionNo: 1, status: 'PUBLISHED' }, { id: '902', versionNo: 2, status: 'DRAFT' }, { id: '903', versionNo: 3, status: 'PUBLISHED' }]
    else if (path.endsWith('/factors/910/versions')) data = [{ id: '911', versionNo: 1, status: 'PUBLISHED' }]
    else if (/\/factor-versions\/(901|902|903|911|999)$/.test(path)) {
      const id = path.split('/').at(-1)
      data = { id, factorId: ['911', '999'].includes(id) ? '910' : '900', versionNo: id === '902' ? 2 : id === '903' ? 3 : 1, status: id === '902' ? 'DRAFT' : 'PUBLISHED', currentArtifactId: id === '902' ? null : `a${id}`, dsl: { definitionKind: id === '901' ? 'DERIVED' : 'SOURCE', definitionType: 'SQL', calculationMode: id === '903' ? 'TEMPORAL' : 'STATIC', output: { grain: ['dept'] }, primaryDomain: { domainCode: 'INPATIENT' } } }
    }
    else if (/\/compile-artifacts\/a(901|903|911)$/.test(path)) {
      const id = path.split('/').at(-1)
      data = id === 'a901' ? { id, logicalPlan: { factorDependencies: [{ factorVersionId: '911' }] } } : { id, parameterSchema: { parameters: id === 'a911' ? [{ code: 'deptCode', name: '科室编码', type: 'STRING', required: true }] : [] } }
    }
    else if (path.endsWith('/trial-period-recommendation')) data = { availabilityStatus: 'AVAILABLE', recommendedPeriodStart: '2026-01-01T00:00:00', recommendedPeriodEnd: '2026-02-01T00:00:00' }
    else if (path.endsWith('/dependency-graph')) data = { nodes: [{ factorVersionId: path.split('/').at(-2), factorName: '当前因子', status: 'PUBLISHED' }, ...(path.includes('/901/') ? [{ factorVersionId: '911', factorName: '上游原子因子', status: 'PUBLISHED' }] : [])], edges: [{ factorVersionId: '901', dependsOnFactorVersionId: '911' }] }
    else if (path.endsWith('/impact-analysis')) data = { nodes: [], edges: [] }
    else if (path.endsWith('/query')) {
      if (window.__holdFactorQuery) await new Promise(resolve => { window.__releaseFactorQuery = resolve })
      data = { executionMode: 'AD_HOC_SOURCE', rows: [{ value: 3, displayValue: '3', dimensions: { 科室: body.parameters.deptCode || '总体' }, qualityStatus: 'PASSED' }] }
    }
    return new Response(JSON.stringify({ code: 'OK', data }), { headers: { 'Content-Type': 'application/json' } })
  }
}
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'Vite')
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => { const value = JSON.parse(event.data); if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails); const request = pending.get(value.id); if (request) { pending.delete(value.id); value.error ? request.reject(new Error(value.error.message)) : request.resolve(value.result) } })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, mobile: false, deviceScaleFactor: 1 })
  await navigate('/factor', '.factor-management')
  await until(() => evaluate(`document.querySelector('.factor-table')?.textContent.includes('复合因子查看验收')`), 'factor catalog')
  await click('复合因子查看验收', `document.querySelector('.factor-table')`)
  await until(() => evaluate(`document.querySelector('.factor-basic')?.textContent.includes('901') && !!document.querySelector('.runtime-parameter-fields input')`), 'independent detail and inherited parameter')
  assert.equal(await evaluate(`location.pathname`), '/factor/view/900')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.factor-detail-page h2')).map(el=>el.textContent)`), ['基本信息', '运行参数与即时查询', '因子依赖关系'])
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.factor-detail-page button')).some(el=>/保存草稿|编译并校验|发布因子版本/.test(el.textContent))`), false)
  await click('即时查询')
  assert.equal(await evaluate(`window.__factorCalls.filter(call=>call.path.endsWith('/query')).length`), 0)
  await evaluate(`(() => {const input=document.querySelector('.runtime-parameter-fields input');input.value='A';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await click('即时查询')
  await until(() => evaluate(`!!document.querySelector('.query-result .el-table__body')`), 'static query result')
  const query = await evaluate(`window.__factorCalls.find(call=>call.path.endsWith('/query'))`)
  assert.equal(query.path, '/api/v1/factor-versions/901/query')
  assert.deepEqual(query.body, { parameters: { deptCode: 'A' } })
  await screenshot('desktop.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await screenshot('mobile.png')
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 2`), true)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, mobile: false, deviceScaleFactor: 1 })
  await evaluate(`window.__holdFactorQuery=true`)
  await click('即时查询')
  await until(() => evaluate(`!!window.__releaseFactorQuery`), 'held query')
  await evaluate(`document.querySelector('.factor-basic .el-select__wrapper').click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.includes('版本 2'))`), 'version choices')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.includes('版本 2')).click()`)
  await until(() => evaluate(`document.querySelector('.runtime-query')?.textContent.includes('尚未取得编译产物')`), 'uncompiled draft')
  await evaluate(`window.__releaseFactorQuery()`)
  await pause(200)
  assert.equal(await evaluate(`!!document.querySelector('.query-result')`), false)
  await navigate('/factor/view/900?factorVersionId=903', '.factor-detail-page')
  await until(() => evaluate(`!!document.querySelector('.query-period .el-date-editor') && !document.querySelector('.runtime-query button.is-loading')`), 'temporal query period')
  await click('即时查询')
  await until(() => evaluate(`!!document.querySelector('.query-result')`), 'temporal query result')
  assert.equal(await evaluate(`window.__factorCalls.find(call=>call.path.endsWith('/903/query')).body.periodStart`), '2026-01-01T00:00:00')
  await navigate('/factor/view/900?factorVersionId=999', '.factor-detail-page')
  await until(() => evaluate(`document.querySelector('.factor-basic')?.textContent.includes('不属于当前因子')`), 'foreign version rejected')
  assert.equal(await evaluate(`!!document.querySelector('.runtime-query')`), false)
  await navigate('/factor/view/900', '.factor-detail-page')
  await until(() => evaluate(`document.querySelector('.dependency-panel')?.textContent.includes('上游原子因子')`), 'upstream dependency')
  await click('查看因子', `document.querySelector('.dependency-panel')`)
  await until(() => evaluate(`location.pathname==='/factor/view/910' && document.querySelector('.factor-basic')?.textContent.includes('911')`), 'dependency detail navigation')
  await click('编辑因子')
  await until(() => evaluate(`location.pathname==='/factor/edit/910' && new URLSearchParams(location.search).get('factorVersionId')==='911'`), 'explicit editor navigation')
  await navigate('/factor', '.factor-management')
  await until(() => evaluate(`!!document.querySelector('.factor-table .el-table__body')`), 'catalog returned')
  await click('查看', `document.querySelector('.factor-table .el-table__body tr')`)
  await until(() => evaluate(`location.pathname==='/factor/view/900' && !!document.querySelector('.factor-basic')`), 'catalog view action')
  const calls = await evaluate(`window.__factorCalls`)
  assert.equal(calls.filter(call => call.method !== 'GET' && !call.path.endsWith('/query')).length, 0)
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, errors, calls }, null, 2))
  console.log('factor-detail: PASS catalog/detail/edit separation, static and temporal queries, inherited parameters, version isolation, dependency navigation and mobile layout')
} catch (e) { if (socket?.readyState === WebSocket.OPEN) { await screenshot('failure.png'); await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({url:location.href,text:document.body.innerText,calls:window.__factorCalls})`), null, 2)) } throw e }
finally { socket?.close(); chrome.kill(); server.kill() }
