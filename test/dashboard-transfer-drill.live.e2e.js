import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const proxyTarget = process.env.DASHBOARD_API_PROXY_TARGET
if (!proxyTarget) throw new Error('请设置 DASHBOARD_API_PROXY_TARGET')
const port = 41759
const debugPort = 41760
const appUrl = `http://127.0.0.1:${port}/dashboard?id=8185872850794987969`
const profile = await mkdtemp(join(tmpdir(), 'idmp-transfer-drill-'))
const server = spawn(process.execPath, [join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  env: { ...process.env, VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: proxyTarget },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
})
let chrome, cdp
try {
  await waitForHttp(appUrl)
  chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--disable-features=Vulkan',
    '--window-size=1440,1100', appUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  cdp = new Cdp((await waitForTarget()).webSocketDebuggerUrl)
  await cdp.ready
  await waitFor(`document.querySelector('[data-testid="dashboard-period-start"]') && document.querySelector('[data-testid="dashboard-edit"]')`, 60000)
  for (const testId of ['dashboard-period-start', 'dashboard-period-end']) {
    await evalInPage(`document.querySelector('[data-testid="${testId}"] .el-select__wrapper').click()`)
    await new Promise(resolve => setTimeout(resolve, 350))
    await waitFor(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item => item.offsetParent && item.innerText.trim() === '2026 年 1 月')`)
    await evalInPage(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.offsetParent && item.innerText.trim() === '2026 年 1 月').click()`)
    await waitFor(`document.querySelector('[data-testid="${testId}"]').innerText.includes('2026 年 1 月')`)
    await new Promise(resolve => setTimeout(resolve, 350))
  }
  await evalInPage(`document.querySelector('[data-testid="dashboard-period-apply"]').click()`)
  await waitFor(`document.querySelector('[data-testid="dashboard-period-start"]').innerText.includes('2026 年 1 月') && document.querySelector('[data-testid="dashboard-period-end"]').innerText.includes('2026 年 1 月')`, 60000)
  await evalInPage(`document.querySelector('[data-testid="dashboard-edit"]').click()`)
  await waitFor(`document.querySelector('.studio-library .el-select__wrapper')`, 60000)
  await evalInPage(`document.querySelector('.studio-library .el-select__wrapper').click()`)
  await waitFor(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item => item.offsetParent && item.innerText.includes('患者入院48小时内转科比例（组合粒度与多维下钻验收）'))`, 60000)
  await evalInPage(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.offsetParent && item.innerText.includes('患者入院48小时内转科比例（组合粒度与多维下钻验收）')).click()`)

  for (const kind of ['bar', 'pie']) {
    await evalInPage(`window.previousWidgetIds = Array.from(document.querySelectorAll('[data-widget-id]')).map(item => item.dataset.widgetId); document.querySelector('[data-testid="dashboard-library-${kind}"]').click(); document.querySelector('[data-testid="dashboard-add-widget"]').click()`)
    const widget = `Array.from(document.querySelectorAll('[data-widget-id]')).find(item => !window.previousWidgetIds.includes(item.dataset.widgetId))`
    await waitFor(`(${widget})?.querySelector('.idmp-chart')`, 100000)
    await evalInPage(`window.drillWidgetId = (${widget}).dataset.widgetId; Array.from(document.querySelectorAll('[role="tab"]')).find(item => item.innerText.trim() === '交互').click()`)
    await waitFor(`document.querySelector('.binding-interaction select option[value="drill"]')`)
    await evalInPage(`(() => { const select = document.querySelector('.binding-interaction select'); select.value = 'drill'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await evalInPage(`document.querySelector('[data-testid="dashboard-preview"]').click()`)
    const chart = `document.querySelector('.dashboard-preview-frame [data-widget-id="' + window.drillWidgetId + '"] .idmp-chart')`
    const previewWidget = `document.querySelector('.dashboard-preview-frame [data-widget-id="' + window.drillWidgetId + '"]')`
    await waitFor(`${chart}`, 60000)
    await evalInPage(`${chart}.scrollIntoView({ block: 'center' })`)
    await new Promise(resolve => setTimeout(resolve, 700))
    const bounds = await evalInPage(`(() => { const b = ${chart}.getBoundingClientRect(); return { x:b.x,y:b.y,width:b.width,height:b.height } })()`)
    let opened = false
    for (const ratio of [0.5, 0.65, 0.8, 0.35]) {
      for (let offset = 40; offset < bounds.width - 10; offset += 15) {
        const x = bounds.x + offset, y = bounds.y + bounds.height * ratio
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
        if (await evalInPage(`Boolean(${previewWidget}?.querySelector('[data-testid="backend-chart-drill"]'))`)) { opened = true; break }
      }
      if (opened) break
    }
    assert.ok(opened, `${kind} 图表点击应在原组件下钻`)
    const drill = `${previewWidget}?.querySelector('[data-testid="backend-chart-drill"]')`
    await waitFor(`(${drill})?.querySelector('.idmp-chart') && !(${drill})?.getAttribute('aria-busy')?.includes('true')`, 60000)
    assert.equal(await evalInPage(`document.querySelectorAll('.el-dialog').length`), 1, '下钻不应打开额外弹窗')
    if (await evalInPage(`(${drill})?.querySelector('.backend-chart-drill__level')?.innerText === '医师'`)) {
      await evalInPage(`Array.from((${drill}).querySelectorAll('.backend-chart-drill__path button')).find(item => item.innerText === '全部科室').click()`)
    }
    await waitFor(`(${drill})?.querySelector('.backend-chart-drill__level')?.innerText === '科室' && Array.from((${drill}).querySelectorAll('tbody tr')).some(row => row.innerText.includes('MICU'))`, 60000)
    await evalInPage(`Array.from((${drill}).querySelectorAll('tbody tr')).find(row => row.innerText.includes('MICU')).querySelector('button').click()`)
    await waitFor(`(${drill})?.querySelector('.backend-chart-drill__level')?.innerText === '医师' && (${drill})?.querySelectorAll('tbody tr').length === 8`, 60000)
    const names = await evalInPage(`Array.from((${drill}).querySelectorAll('tbody tr')).map(row => row.cells[0].innerText)`)
    assert.ok(names.includes('傅小雨'))
    await evalInPage(`Array.from((${drill}).querySelectorAll('.backend-chart-drill__path button')).find(item => item.innerText === '全部科室').click()`)
    await waitFor(`(${drill})?.querySelector('.backend-chart-drill__level')?.innerText === '科室'`, 60000)
    await evalInPage(`Array.from((${drill}).querySelectorAll('.backend-chart-drill__path button')).find(item => item.innerText === '全院').click()`)
    await waitFor(`!(${drill}) && (${previewWidget})?.querySelector('.idmp-chart')`, 60000)
    process.stdout.write(`dashboard-transfer-${kind}: PASS ${JSON.stringify({ doctors: names.length, sample: names.slice(0, 3), returnedToDepartment: true, returnedToOriginalChart: true, saved: false })}\n`)
    await evalInPage(`document.querySelector('.el-dialog .el-dialog__headerbtn').click()`)
    await evalInPage(`document.querySelector('.dashboard-preview-frame').closest('.el-dialog').querySelector('.el-dialog__headerbtn').click()`)
    await waitFor(`!document.querySelector('.dashboard-preview-frame')`)
  }
} finally {
  try { await cdp?.send('Browser.close') } catch {}
  cdp?.close()
  chrome?.kill()
  server.kill()
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function Cdp(url) {
  this.id = 0
  this.pending = new Map()
  this.socket = new WebSocket(url)
  this.ready = new Promise((resolve, reject) => {
    this.socket.addEventListener('open', resolve, { once: true })
    this.socket.addEventListener('error', () => reject(new Error('CDP 连接失败')), { once: true })
  })
  this.socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
  })
  this.send = async (method, params = {}) => {
    await this.ready
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  this.close = () => this.socket.close()
}
async function evalInPage(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression, timeoutMs = 45000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evalInPage(`Boolean(${expression})`)) return
    await new Promise(resolve => setTimeout(resolve, 180))
  }
  throw new Error(`等待页面条件超时：${expression}; ${String(await evalInPage('document.body.innerText')).slice(-1800)}`)
}
async function waitForHttp(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`前端服务启动超时：${url}`)
}
async function waitForTarget() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()).catch(() => [])
    const page = targets.find(item => item.type === 'page' && item.url.startsWith(appUrl) && item.webSocketDebuggerUrl)
    if (page) return page
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Chrome 调试目标启动超时')
}
