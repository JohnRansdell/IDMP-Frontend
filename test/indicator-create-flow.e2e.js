import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appPort = 41761, debugPort = 41762
const profile = await mkdtemp(join(tmpdir(), 'idmp-indicator-create-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(100) } throw new Error(`Timed out: ${label}`) }
let socket, nextId = 0
const pending = new Map()
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails)); return data.result.value }
function fixture() {
  localStorage.setItem('idmp_access_token', 'indicator-create-fixture')
  const originalFetch = window.fetch.bind(window)
  window.__indicatorRequests = []
  let masterVersion = 1, draftVersion = 0
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    if (!path.startsWith('/api/v1/')) return originalFetch(input, options)
    const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null
    window.__indicatorRequests.push({ path, method, body })
    let data = {}
    if (path.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (path.endsWith('/factor-versions')) data = { records: [
      { id: '11', factorCode: 'A', factorName: '分子', publicationStatus: 'PUBLISHED', calculationMode: 'TEMPORAL' },
      { id: '12', factorCode: 'B', factorName: '分母', publicationStatus: 'PUBLISHED', calculationMode: 'TEMPORAL' }
    ], total: 2 }
    else if (path.endsWith('/indicators') && method === 'POST') data = { id: '700', code: body.code, name: body.name, resourceVersion: masterVersion }
    else if (path.endsWith('/indicators/700') && method === 'GET') data = { id: '700', code: 'QUALITY_RATE', name: '流程测试指标', description: '业务定义', resourceVersion: masterVersion }
    else if (path.endsWith('/indicators/700/versions') && method === 'GET') data = []
    else if (path.endsWith('/indicators/700') && method === 'PUT') {
      if (body.definition && !body.metadataVersionId) return new Response(JSON.stringify({ code: 'INVALID', message: '定义、统计周期和数据来源需要指定指标草稿版本' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      masterVersion += 1
      if (body.metadataVersionId) draftVersion += 1
      data = { id: '700', code: 'QUALITY_RATE', name: body.name, resourceVersion: masterVersion,
        ...(body.metadataVersionId ? { metadataVersionId: '701', metadataResourceVersion: draftVersion, definition: body.definition, statisticalPeriod: body.statisticalPeriod, dataSources: body.dataSources } : {}) }
    } else if (path.endsWith('/indicator-versions/drill-capabilities')) data = { factorVersionIds: ['11', '12'], dimensions: [] }
    else if (path.endsWith('/indicators/700/versions') && method === 'POST') data = { id: '701', indicatorId: '700', resourceVersion: draftVersion, status: 'DRAFT', formula: body.formula, drillPaths: [] }
    return new Response(JSON.stringify({ code: 'OK', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'preview server')
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => { const response = JSON.parse(event.data); const request = pending.get(response.id); if (!request) return; pending.delete(response.id); response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})()` })
  await send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/new` })
  await until(() => evaluate(`!!document.querySelector('.editor-page .el-form')`), 'indicator editor')
  await evaluate(`(() => { window.__currentEditor = () => { let component = document.querySelector('.editor-page')?.__vueParentComponent; while (component && component.type.__name !== 'IndicatorEditor') component = component.parent; return component?.setupState }; window.__editor = window.__currentEditor(); Object.assign(window.__editor.form, { code: 'QUALITY_RATE', name: '流程测试指标', definition: '业务定义', sources: ['HIS'], policies: ['绩效考核2024版'] }); })()`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '保存并进入公式配置').click()`)
  await until(() => evaluate(`location.pathname === '/indicator/edit/700' && window.__currentEditor()?.indicatorWorkflow.indicatorId === '700' && window.__currentEditor() !== window.__editor`), 'new editor mounted after creation')
  await evaluate(`window.__editor = window.__currentEditor()`)
  assert.equal(await evaluate(`window.__indicatorRequests.find(item => item.method === 'POST' && item.path.endsWith('/indicators')).body.code`), 'QUALITY_RATE')
  assert.equal(await evaluate(`window.__editor.form.code`), 'QUALITY_RATE')
  assert.equal(await evaluate(`window.__editor.activeTab`), 'formula')
  assert.deepEqual(await evaluate(`Array.from(window.__editor.form.sources)`), ['HIS'])
  assert.deepEqual(await evaluate(`Array.from(window.__editor.form.policies)`), ['绩效考核2024版'])
  await evaluate(`window.__editor.saveIndicatorBasicInfo()`)
  await until(() => evaluate(`window.__indicatorRequests.some(item => item.method === 'PUT' && item.path.endsWith('/indicators/700'))`), 'master metadata saved')
  const firstUpdate = await evaluate(`window.__indicatorRequests.find(item => item.method === 'PUT' && item.path.endsWith('/indicators/700')).body`)
  assert.equal(firstUpdate.metadataVersionId, undefined)
  assert.equal(firstUpdate.definition, undefined)
  assert.equal(firstUpdate.dataSources, undefined)
  await evaluate(`(() => { window.__editor.numeratorFactors = [{ code: 'A', name: '分子', versionId: '11', calculationMode: 'TEMPORAL' }]; window.__editor.denominatorFactors = [{ code: 'B', name: '分母', versionId: '12', calculationMode: 'TEMPORAL' }]; })()`)
  await evaluate(`window.__editor.saveIndicatorFormulaOnly()`)
  await until(() => evaluate(`window.__indicatorRequests.some(item => item.method === 'PUT' && item.path.endsWith('/indicators/700') && item.body.metadataVersionId === '701')`), 'draft metadata saved')
  const draftUpdate = await evaluate(`window.__indicatorRequests.find(item => item.method === 'PUT' && item.body?.metadataVersionId === '701').body`)
  assert.equal(draftUpdate.definition, '业务定义')
  assert.equal(draftUpdate.statisticalPeriod, 'YEARLY')
  assert.deepEqual(draftUpdate.dataSources, [{ sourceCategory: 'HIS' }])
  console.log('indicator-create-flow: PASS code preserved, master save omits draft fields, formula creation saves draft metadata')
} finally {
  socket?.close()
  chrome.kill()
  server.kill()
}
