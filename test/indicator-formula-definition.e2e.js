import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { api } from './system-test-client.mjs'

const indicatorId = '102027642461313070'
const versions = await api('GET', `/indicators/${indicatorId}/versions`)
const versionId = String(versions.find(version => version.status === 'PUBLISHED').id)
const detail = await api('GET', `/indicator-versions/${versionId}`)
assert.equal(detail.formulaDefinition.status, 'READY')
assert.equal(detail.formulaDefinition.factors.length, 2)
assert.match(detail.formulaDefinition.expression, /÷/)
assert.ok(detail.formulaDefinition.factors.every(factor => detail.formulaDefinition.expression.includes(factor.factorName)))
assert.ok(detail.formulaDefinition.rules.some(rule => rule.includes('百分比')))
assert.ok(detail.formulaDefinition.rules.some(rule => rule.includes('分母为 0')))
const evidence = resolve('.tmp/indicator-formula-definition')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-readable-formula-'))
const debugPort = 41821
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label) { for (let i = 0; i < 300; i++) { if (await predicate()) return; await delay(100) } throw new Error(`${label} timed out`) }
async function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function fixtures() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    const respond = (data, status = 200) => new Response(JSON.stringify({ code: status === 200 ? 'OK' : 'INTERNAL_ERROR', message: status === 200 ? '' : '版本定义读取失败，请稍后重试', data }), { status, headers: { 'Content-Type': 'application/json' } })
    if (path === '/api/v1/indicators/90000') return respond({ id: '90000', code: 'FORMULA_DISPLAY_TEST', name: '公式显示与版本切换测试', status: 'PUBLISHED' })
    if (path === '/api/v1/indicators/90000/versions') return respond([1, 2, 3, 4].map(n => ({ id: String(90000 + n), versionNo: n, status: 'PUBLISHED' })))
    if (path === '/api/v1/indicators/90000/scenarios') return respond({ records: [], total: 0 })
    if (/\/9000[1-4]\/(policy-references)$/.test(path) || /\/by-indicator-version\/9000[1-4]$/.test(path)) return respond([])
    if (/^\/api\/v1\/indicator-versions\/9000[1-4]$/.test(path)) {
      const version = Number(path.slice(-1))
      if (version === 1 && window.__holdFirst) await new Promise(resolve => { window.__releaseFirst = resolve })
      if (version === 4) return respond(null, 500)
      return respond({ id: String(90000 + version), versionNo: version, status: 'PUBLISHED', formula: { root: { nodeType: 'CONST', value: String(version) } },
        formulaDefinition: version === 3 ? { status: 'UNAVAILABLE', warnings: ['该版本尚未配置指标公式'] } : {
          status: 'READY', expression: `版本${version}业务公式`, displayExpression: `版本${version}业务公式`, rules: ['保留 2 位小数'], factors: [], warnings: []
        } })
    }
    return realFetch(input, options)
  }
}
async function screenshot(name) { await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixtures.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:5173/indicator/view/${indicatorId}?versionId=${versionId}` })
  await waitFor(() => evaluate(`!!document.querySelector('.formula-expression')`), 'Real formula')
  assert.equal(await evaluate(`document.querySelector('.formula-expression').textContent`), detail.formulaDefinition.displayExpression)
  assert.equal(await evaluate(`document.querySelector('.formula-technical').open`), false)
  assert.doesNotMatch(await evaluate(`document.querySelector('.formula-expression').textContent`), /nodeType|factorVersionId/)
  await screenshot('real-desktop.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await evaluate(`document.querySelector('.formula-definition').scrollIntoView({block:'start'})`)
  const size = await evaluate(`(()=>{const el=document.querySelector('.formula-expression');const r=el.getBoundingClientRect();return {client:el.clientWidth,scroll:el.scrollWidth,left:r.left,right:r.right}})()`)
  assert.ok(size.scroll <= size.client + 1 && size.right <= 391 && size.left >= 0, JSON.stringify(size))
  await screenshot('real-mobile.png')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/indicator/view/90000?versionId=90002' })
  await waitFor(() => evaluate(`document.querySelector('.formula-expression')?.textContent==='版本2业务公式'`), 'Explicit version selection')
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__holdFirst=true;void window.__formulaPage.selectVersion({id:'90001',versionNo:1,status:'PUBLISHED'})`)
  await waitFor(() => evaluate(`!!window.__releaseFirst`), 'Held version request')
  await evaluate(`window.__formulaPage.selectVersion({id:'90002',versionNo:2,status:'PUBLISHED'})`)
  await evaluate(`window.__releaseFirst()`)
  await delay(300)
  assert.equal(await evaluate(`document.querySelector('.formula-expression').textContent`), '版本2业务公式')
  await evaluate(`window.__formulaPage.selectVersion({id:'90003',versionNo:3,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`!!document.querySelector('.formula-expression')`), false)
  assert.match(await evaluate(`document.querySelector('.formula-definition').textContent`), /尚未配置指标公式/)
  await evaluate(`window.__formulaPage.selectVersion({id:'90004',versionNo:4,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`!!document.querySelector('.formula-expression')`), false)
  assert.match(await evaluate(`document.querySelector('.formula-definition').textContent`), /读取失败/)
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, indicatorId, versionId, formulaDefinition: detail.formulaDefinition, size, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, indicatorId, versionId, size, evidence }))
} catch (error) { if (socket?.readyState === WebSocket.OPEN) await screenshot('failure.png'); throw error }
finally { socket?.close(); chrome.kill() }
