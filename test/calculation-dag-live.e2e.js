import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5173'
const batchId = '102027642462401188'
const profile = await mkdtemp(join(tmpdir(), 'idmp-calc-dag-live-'))
const port = 41939, errors = [], writes = [], pending = new Map()
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await predicate()) return; await pause(150) }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result) }, reject: error => { clearTimeout(timeout); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
try {
  let target
  await until(async () => {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); return !!target } catch { return false }
  }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails)
    if (data.method === 'Fetch.requestPaused') {
      const { requestId, request } = data.params
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        writes.push({ method: request.method, url: request.url })
        send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {})
      } else send('Fetch.continueRequest', { requestId }).catch(() => {})
    }
    const request = pending.get(data.id)
    if (request) { pending.delete(data.id); data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result) }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/*', requestStage: 'Request' }] })
  await send('Page.navigate', { url: `${base}/calc?batchId=${batchId}` })
  await until(() => evaluate(`document.querySelectorAll('.calculation-targets .el-collapse-item').length === 10`), 'real target list')
  const payload = await evaluate(`(async () => {
    const { requestJson } = await import('/src/idmp/api/request.js');
    return requestJson('/calc/batches/${batchId}', { cache: 'no-store' });
  })()`)
  assert.equal(payload.status, 'SUCCEEDED')
  assert.equal(payload.targets.reduce((count, t) => count + t.nodes.length, 0), 60)
  assert.equal(await evaluate(`document.querySelectorAll('.dag-node').length`), 0)
  for (let index = 0; index < payload.targets.length; index++) {
    const target = payload.targets[index]
    await evaluate(`document.querySelectorAll('.calculation-targets .el-collapse-item__header')[${index}].click()`)
    await until(() => evaluate(`document.querySelector('.dag-node')?.dataset.nodeId === '${target.nodes[0].nodeId}'`), `target ${index}`)
    assert.equal(await evaluate(`document.querySelectorAll('.dag-node').length`), target.nodes.length)
    const codes = new Set(target.nodes.map(n => n.nodeCode))
    const expectedEdges = target.nodes.flatMap(n => [...new Set(n.dependencies)].filter(code => codes.has(code)).map(code => [code, n.nodeCode]))
    const edges = await evaluate(`Array.from(document.querySelectorAll('.dag-edges polyline')).map(e => [e.dataset.from, e.dataset.to])`)
    assert.deepEqual(edges.sort(), expectedEdges.sort())
  }
  await evaluate(`document.querySelectorAll('.calculation-targets .el-collapse-item__header')[0].click()`)
  await until(() => evaluate(`document.querySelector('.dag-node')?.dataset.nodeId === '${payload.targets[0].nodes[0].nodeId}'`), 'base graph')
  const composite = payload.targets[0].nodes.find(n => n.nodeType === 'DERIVED_FACTOR')
  await evaluate(`document.querySelector('[data-node-id="${composite.nodeId}"]').click()`)
  await until(() => evaluate(`!!document.querySelector('.node-details')`), 'real composite detail')
  const drawer = await evaluate(`document.querySelector('.el-drawer').innerText`)
  assert.ok(drawer.includes(composite.nodeName))
  assert.ok(drawer.includes(String(composite.ownerVersionId)))
  assert.ok(drawer.includes('复合因子'))
  assert.equal(await evaluate(`document.querySelectorAll('.dependency-links button').length`), 2)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.el-drawer button')).some(b => b.textContent.includes('重试失败节点'))`), false)
  const upstream = payload.targets[0].nodes.find(n => n.nodeCode === composite.dependencies[0])
  await evaluate(`document.querySelector('.dependency-links button').click()`)
  await until(() => evaluate(`document.querySelector('.node-heading').innerText.includes(${JSON.stringify(upstream.nodeName)})`), 'real upstream detail')
  assert.ok((await evaluate(`document.querySelector('.node-details').innerText`)).includes(String(upstream.ownerVersionId)))
  await evaluate(`Array.from(document.querySelectorAll('.el-drawer button')).find(b => b.textContent.trim() === '关闭').click()`)
  await until(() => evaluate(`!document.querySelector('.node-details')`), 'upstream detail closed')
  await evaluate(`document.querySelector('[data-node-id="${composite.nodeId}"]').click()`)
  await until(() => evaluate(`!!document.querySelector('.node-details')`), 'composite detail reopened')
  await mkdir('.tmp/calculation-dag-live', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await until(() => evaluate(`(() => { const b = document.querySelector('.el-drawer').getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1; })()`), 'drawer transition settled')
    const bounds = await evaluate(`document.querySelector('.el-drawer').getBoundingClientRect().toJSON()`)
    assert.ok(bounds.left >= -1 && bounds.right <= viewport.width + 1, JSON.stringify(bounds))
    await writeFile(`.tmp/calculation-dag-live/detail-${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`Array.from(document.querySelectorAll('.el-drawer button')).find(b => b.textContent.trim() === '关闭').click()`)
  await until(() => evaluate(`!document.querySelector('.node-details')`), 'detail closed')
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await evaluate(`document.querySelector('.node-card').scrollIntoView({ block: 'start' })`)
    await pause(250)
    assert.equal(await evaluate(`document.querySelectorAll('.dag-node').length`), 6)
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'graph must scroll internally')
    const overlaps = await evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll('.dag-node')).map(n => n.getBoundingClientRect());
      return nodes.some((a, i) => nodes.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
    })()`)
    assert.equal(overlaps, false)
    await writeFile(`.tmp/calculation-dag-live/graph-${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await send('Page.navigate', { url: `${base}/calc?batchId=101996817981379215` })
  await until(() => evaluate(`document.querySelectorAll('.calculation-targets .el-collapse-item').length === 1`), 'historical batch compatibility')
  await evaluate(`document.querySelector('.calculation-targets .el-collapse-item__header').click()`)
  await until(() => evaluate(`document.querySelectorAll('.dag-node').length === 4`), 'historical graph')
  assert.deepEqual(writes, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ status: 'PASS', batchId, targets: 10, nodes: 60, historicalNodes: 4, writes: 0, verified: ['all target dependencies', 'composite detail and upstream navigation', 'desktop/mobile layout', 'lazy rendering'] }))
} finally {
  for (const request of pending.values()) request.reject(new Error('Browser closed'))
  socket?.close()
  chrome.kill()
}
