import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBindingGoldenPath } from './dashboard-binding-golden-path.js'
import { runMembershipGoldenPath } from './dashboard-membership-golden-path.js'

class Cdp {
  constructor(url) {
    this.id = 0
    this.pending = new Map()
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CDP WebSocket connection timed out: ${url}`)), 10000)
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('open', () => clearTimeout(timeout), { once: true })
      this.socket.addEventListener('error', event => { clearTimeout(timeout); reject(new Error(`CDP WebSocket error: ${event.message || 'unknown error'}`)) }, { once: true })
      this.socket.addEventListener('close', event => { clearTimeout(timeout); reject(new Error(`CDP WebSocket closed before ready: ${event.code} ${event.reason || ''}`)) }, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) this.onEvent?.(message)
      if (!message.id || !this.pending.has(message.id)) return
      const { resolve, reject, timeout, method } = this.pending.get(message.id)
      this.pending.delete(message.id)
      clearTimeout(timeout)
      message.error ? reject(new Error(`CDP ${method}: ${message.error.message}`)) : resolve(message.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, 20000)
      this.pending.set(id, { resolve, reject, timeout, method })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

const appPort = 41739
const debugPort = 41740
const previewSmokeMode = process.env.VITE_DASHBOARD_PREVIEW_MODE === '1'
// Preview mode provides data fallbacks, but it does not select a populated
// dashboard. Select the existing quality-safety scene through its supported
// managed-dashboard route rather than relying on an empty default catalog.
// The non-preview golden path keeps its existing backend-backed target.
const dashboardId = previewSmokeMode ? 'quality-overview-quality-safety' : 'quality-overview'
const appUrl = previewSmokeMode
  ? `http://127.0.0.1:${appPort}/dashboard?id=${dashboardId}`
  : `http://127.0.0.1:${appPort}/dashboard`
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = await mkdtemp(join(tmpdir(), 'idmp-dashboard-e2e-'))
// Invoke Vite's JavaScript entry directly. Spawning pnpm.cmd without a Windows
// shell is invalid, while spawning it through a shell loses reliable quoting and
// child-process diagnostics.
const server = spawn(process.execPath, [join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true })
// This managed Windows environment cannot start Chrome's default GPU process
// (exit -1073741790). Keep the software ANGLE implementation in-process and
// disable Vulkan for headless tests only; application rendering code is unchanged.
const processLog = { chrome: { stdout: '', stderr: '', exit: null, error: null }, server: { stdout: '', stderr: '', exit: null, error: null } }
captureProcess(server, processLog.server)
let chrome
let cdp

try {
  // Do not navigate Chrome before Vite has accepted requests. A cold-start
  // connection-refused navigation was the remaining source of target crashes.
  await waitHttp(appUrl)
  chrome = spawn(chromePath, [`--headless=new`, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--disable-features=Vulkan', '--window-size=1440,1100', appUrl], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  captureProcess(chrome, processLog.chrome)
  if (chrome.exitCode !== null) throw new Error(chromeDiagnostic(processLog.chrome))
  await waitChromeDebugPort(`http://127.0.0.1:${debugPort}/json/version`, chrome, processLog.chrome)
  const target = await waitForPageTarget(`http://127.0.0.1:${debugPort}/json/list`)
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.ready
  // Page event subscription is not required by this command-driven harness and
  // crashes the renderer in this managed Chrome build. Page.reload/screenshot
  // remain exercised through their normal CDP commands below.
  // Runtime.evaluate works without Runtime.enable; avoiding domain event
  // subscriptions is required by the constrained headless renderer here.
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-edit"]')`)
  await click(cdp, '[data-testid="dashboard-edit"]')
  await waitForDashboardCanvas(cdp)

  if (process.env.DASHBOARD_VISUAL_DIR) {
    await mkdir(process.env.DASHBOARD_VISUAL_DIR, { recursive: true })
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
      await delay(400)
      await value(cdp, 'window.scrollTo(0, 0)')
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(process.env.DASHBOARD_VISUAL_DIR, `designer-${width}.png`), Buffer.from(shot.data, 'base64'))
      const overflow = await value(cdp, 'document.documentElement.scrollWidth > window.innerWidth')
      assert.equal(overflow, false, `page must not overflow horizontally at ${width}`)
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  }

  const initialCount = await value(cdp, `document.querySelectorAll('[data-testid="dashboard-canvas"] .grid-stack-item').length`)
  if (previewSmokeMode) {
    const firstWidget = await value(cdp, `(() => { const widget = document.querySelector('[data-testid="dashboard-canvas"] .grid-stack-item'); return { id: widget?.getAttribute('data-widget-id') || '', type: widget?.querySelector('[data-widget-type]')?.getAttribute('data-widget-type') || widget?.querySelector('[class*="widget"]')?.className || '' }; })()`)
    assert.ok(initialCount > 0, 'preview smoke dashboard must render at least one widget')
    process.stdout.write(`dashboard-visual-smoke: PASS dashboard=${dashboardId} widgets=${initialCount} first=${JSON.stringify(firstWidget)}\n`)
  } else {
  await click(cdp, '[aria-label="指标数据"]')
  await waitFor(cdp, `document.querySelector('.el-select-dropdown__item:not(.is-disabled)')`)
  await click(cdp, '.el-select-dropdown__item:not(.is-disabled)')
  await click(cdp, '[data-testid="dashboard-add-widget"]')
  await waitFor(cdp, `document.querySelectorAll('[data-testid="dashboard-canvas"] .grid-stack-item').length === ${initialCount + 1}`)

  const widgetSelector = '[data-testid="dashboard-canvas"] .grid-stack-item:last-of-type'
  const beforeDrag = await gridNode(cdp, widgetSelector)
  await updateGridStackNode(cdp, widgetSelector, { x: Math.min(18, beforeDrag.x + 1), y: beforeDrag.y + 1 })
  const afterDrag = await gridNode(cdp, widgetSelector)
  assert.ok(afterDrag.x !== beforeDrag.x || afterDrag.y !== beforeDrag.y, 'real GridStack update must change x or y')
  await click(cdp, widgetSelector)
  await click(cdp, '[data-testid="dashboard-configure-widget"]')
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-widget-title"]')`)
  assert.equal(await value(cdp, `document.querySelectorAll('.dashboard-grid-guide').length`), 0, 'selection must not show guide')
  await setInput(cdp, '[data-testid="dashboard-widget-title"]', 'Golden Path KPI')
  await click(cdp, '#tab-style')
  await setInput(cdp, '[data-testid="dashboard-widget-border-width"]', '2')

  if (process.env.DASHBOARD_VISUAL_DIR) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.DASHBOARD_VISUAL_DIR, 'inspector-1440.png'), Buffer.from(shot.data, 'base64'))
  }

  const beforeResize = await gridNode(cdp, widgetSelector)
  await click(cdp, '[data-testid="dashboard-preview"]')
  await waitFor(cdp, `document.querySelector('.el-dialog [data-testid="dashboard-canvas"]')`)
  assert.equal(await value(cdp, `document.querySelectorAll('.el-dialog .dashboard-grid-guide').length`), 0, 'preview must not expose guide')
  await click(cdp, '.el-dialog__headerbtn')
  await delay(400)
  assert.deepEqual(await gridNode(cdp, widgetSelector), beforeResize, 'preview must not modify designer geometry')
  await updateGridStackNode(cdp, widgetSelector, { w: Math.max(3, beforeResize.w - 1), h: Math.max(2, beforeResize.h - 1) })
  const afterResize = await gridNode(cdp, widgetSelector)
  assert.ok(afterResize.w !== beforeResize.w || afterResize.h !== beforeResize.h, 'real GridStack resize must change w or h')
  const gridSavedBeforePersist = await value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(widgetSelector)}); const grid = element.gridstackNode.grid; const item = grid.save(false, false, undefined, grid.getColumn()).find(widget => widget.id === element.gridstackNode.id); return { x: item.x || 0, y: item.y || 0, w: item.w ?? item.minW ?? 1, h: item.h ?? item.minH ?? 1 }; })()`)
  assert.deepEqual(gridSavedBeforePersist, afterResize, 'GridStack save output must match the live node before persistence')

  await domClick(cdp, '[data-testid="dashboard-save"]')
  await waitFor(cdp, `document.querySelector('.dashboard-save-state')?.textContent.trim().startsWith('✓ 已保存')`)
  const saved = await value(cdp, `JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:${dashboardId}'))`)
  const added = saved.widgets.find((widget) => widget.title === 'Golden Path KPI')
  assert.ok(added, 'saved schema must contain the added KPI')
  assert.equal(saved.widgets.length, initialCount + 1)
  assert.equal(added.config.style.borderWidth, 2)
  assert.deepEqual(added.layout, afterResize)

  await reload(cdp)
  await waitFor(cdp, `document.body.textContent.includes('Golden Path KPI')`)
  const restored = await value(cdp, `JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:${dashboardId}')).widgets.find(widget => widget.title === 'Golden Path KPI')`)
  assert.deepEqual(restored.layout, afterResize)
  await click(cdp, '[data-testid="dashboard-edit"]')
  await waitFor(cdp, `document.querySelector('[data-widget-id="${added.id}"]')`)
  const restoredNode = await gridNode(cdp, `[data-widget-id="${added.id}"]`)
  assert.deepEqual(restoredNode, afterResize)

  await click(cdp, `[data-widget-id="${added.id}"]`)
  await click(cdp, '[data-testid="dashboard-delete-widget"]')
  await domClick(cdp, '[data-testid="dashboard-save"]')
  await waitFor(cdp, `!JSON.parse(localStorage.getItem('idmp:dashboard-schema:v1:${dashboardId}')).widgets.some(widget => widget.id === '${added.id}')`)
  await reload(cdp)
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-edit"]')`)
  assert.equal(await value(cdp, `document.body.textContent.includes('Golden Path KPI')`), false)
  process.stdout.write('dashboard-golden-path: PASS\n')
  await runMembershipGoldenPath(cdp, { click, domClick, value, waitFor, delay, reload })
  await runBindingGoldenPath(cdp, { click, domClick, value, waitFor, setInput, gridNode, delay, reload })
  }
} catch (error) {
  process.stderr.write(`dashboard-e2e failure: ${error instanceof Error ? error.stack : String(error)}\n${chromeDiagnostic(processLog.chrome)}\nVite stderr=${processLog.server.stderr.trim() || '(empty)'}\n`)
  throw error
} finally {
  server.kill()
  if (cdp) {
    try { await cdp.send('Browser.close') } catch {}
    cdp.close()
  } else {
    chrome?.kill()
  }
  if (chrome) await waitForExit(chrome)
  await removeTemporaryProfile(profile)
}

function captureProcess(handle, diagnostic) {
  handle.stdout?.on('data', chunk => { diagnostic.stdout += chunk.toString() })
  handle.stderr?.on('data', chunk => { diagnostic.stderr += chunk.toString() })
  handle.on('error', error => { diagnostic.error = error.message })
  handle.on('exit', (code, signal) => { diagnostic.exit = { code, signal } })
}
function chromeDiagnostic(diagnostic) {
  return `Chrome failed to start. exit=${JSON.stringify(diagnostic.exit)} error=${diagnostic.error || ''} stderr=${diagnostic.stderr.trim() || '(empty)'}`
}
async function waitChromeDebugPort(url, chromeProcess, diagnostic) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (chromeProcess.exitCode !== null || diagnostic.exit || diagnostic.error) throw new Error(chromeDiagnostic(diagnostic))
    try { if ((await fetch(url)).ok) return } catch {}
    await delay(100)
  }
  throw new Error(`Chrome debug port did not become ready. ${chromeDiagnostic(diagnostic)}`)
}
async function waitForPageTarget(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await fetch(url).then(response => response.json()).catch(() => [])
    const page = targets.find(target => target.type === 'page' && target.url.startsWith(appUrl) && target.webSocketDebuggerUrl)
    if (page) return page
    await delay(100)
  }
  throw new Error(`Chrome did not expose an application page target for ${appUrl}`)
}

async function waitHttp(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await delay(100)
  }
  throw new Error(`timed out waiting for ${url}`)
}

async function reload(cdp) {
  const previous = await value(cdp, 'performance.timeOrigin')
  await cdp.send('Page.reload', { ignoreCache: true })
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if (await value(cdp, `performance.timeOrigin !== ${previous} && document.readyState === 'complete'`)) return
    } catch (error) {
      if (!/context|navigat/i.test(error.message)) throw error
    }
    await delay(100)
  }
  throw new Error('reload did not complete in a new document')
}

async function waitFor(cdp, expression, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await value(cdp, `Boolean(${expression})`)) return
    await delay(100)
  }
  throw new Error(`timed out waiting for: ${expression}`)
}

async function waitForDashboardCanvas(cdp) {
  const expression = `document.querySelector('[data-testid="dashboard-canvas"].grid-stack') && document.querySelector('[data-testid="dashboard-canvas"] .grid-stack-item')`
  try {
    await waitFor(cdp, expression)
  } catch (error) {
    const diagnostic = await dashboardDiagnostic(cdp).catch((diagnosticError) => ({ diagnosticError: diagnosticError.message }))
    throw new Error(`${error.message}\nDashboard diagnostic: ${JSON.stringify(diagnostic)}`)
  }
}

async function dashboardDiagnostic(cdp) {
  return value(cdp, `(() => {
    const text = document.body?.innerText || ''
    const count = (selector) => document.querySelectorAll(selector).length
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: text.replace(/\\s+/g, ' ').slice(0, 700),
      dashboardRoot: Boolean(document.querySelector('[data-testid="dashboard-edit"], .dashboard-page, .dashboard-workspace')),
      editButton: Boolean(document.querySelector('[data-testid="dashboard-edit"]')),
      canvas: Boolean(document.querySelector('[data-testid="dashboard-canvas"]')),
      gridStack: Boolean(document.querySelector('[data-testid="dashboard-canvas"].grid-stack')),
      gridStackItems: count('[data-testid="dashboard-canvas"] .grid-stack-item'),
      loading: count('.el-loading-mask, .dashboard-loading, .is-loading'),
      empty: count('.studio-empty, .dashboard-empty, .empty-state'),
      error: count('.dashboard-error, .el-alert--error, .el-result--error'),
      widgets: Array.from(document.querySelectorAll('[data-testid="dashboard-canvas"] .grid-stack-item')).slice(0, 3).map((element) => ({ id: element.getAttribute('data-widget-id'), type: element.querySelector('[data-widget-type]')?.getAttribute('data-widget-type') || element.className }))
    }
  })()`)
}

async function value(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function click(cdp, selector) {
  const point = await rect(cdp, selector)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await delay(150)
}

async function domClick(cdp, selector) {
  await value(cdp, `document.querySelector(${JSON.stringify(selector)}).click()`)
  await delay(150)
}

async function mouseGesture(cdp, selector, dx, dy) {
  const point = await rect(cdp, selector)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + dx * step / 8, y: point.y + dy * step / 8, button: 'left', buttons: 1 })
    await delay(30)
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + dx, y: point.y + dy, button: 'left', clickCount: 1 })
  await delay(250)
}

async function rect(cdp, selector) {
  const result = await value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({ block: 'center' }); const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`)
  assert.ok(result, `missing element: ${selector}`)
  return result
}

async function setInput(cdp, selector, nextValue) {
  await value(cdp, `(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(nextValue)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await delay(100)
}

async function gridNode(cdp, selector) {
  return value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); const attached = element.gridstackNode; const node = attached.grid.engine.nodes.find(item => item.id === attached.id); return { x: node.x, y: node.y, w: node.w, h: node.h }; })()`)
}

async function updateGridStackNode(cdp, selector, update) {
  await value(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); const attached = element.gridstackNode; const node = attached.grid.engine.nodes.find(item => item.id === attached.id); attached.grid.update(node.el, ${JSON.stringify(update)}); })()`)
  await delay(250)
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

async function waitForExit(processHandle) {
  if (processHandle.exitCode !== null) return
  await Promise.race([
    new Promise((resolve) => processHandle.once('exit', resolve)),
    delay(3000).then(() => processHandle.kill())
  ])
}

async function removeTemporaryProfile(path) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await rm(path, { recursive: true, force: true }); return } catch (error) {
      if (error?.code !== 'EBUSY') throw error
      await delay(200)
    }
  }
}
