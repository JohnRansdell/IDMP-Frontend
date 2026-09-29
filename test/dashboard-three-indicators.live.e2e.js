import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const proxyTarget = process.env.DASHBOARD_API_PROXY_TARGET
if (!proxyTarget) throw new Error('请设置 DASHBOARD_API_PROXY_TARGET，例如 http://backend-host:8081')

const appPort = 41749
const debugPort = 41750
const dashboardId = process.env.DASHBOARD_ID || '8185872850794987969'
const appUrl = process.env.DASHBOARD_APP_URL || `http://127.0.0.1:${appPort}/dashboard?id=${dashboardId}`
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = await mkdtemp(join(tmpdir(), 'idmp-three-indicators-'))
const server = process.env.DASHBOARD_APP_URL ? null : spawn(process.execPath, [join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
  env: { ...process.env, VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: proxyTarget },
  stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true
})

let chrome
let cdp
try {
  await waitHttp(appUrl)
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-extensions', '--disable-background-networking', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--disable-features=Vulkan',
    '--window-size=1440,1100', appUrl
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const target = await waitForPageTarget(`http://127.0.0.1:${debugPort}/json/list`)
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.ready

  if (process.env.DASHBOARD_CURRENT_VERSION_SMOKE === '1') {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.dashboardQueryDiagnostics = [];
      const originalFetch = window.fetch;
      window.fetch = async function(input, options) {
        const response = await originalFetch.apply(this, arguments);
        if (String(input).includes('/analysis/dashboards/') && String(input).endsWith('/query')) {
          const payload = await response.clone().json().catch(() => null);
          window.dashboardQueryDiagnostics.push({ request: JSON.parse(options?.body || '{}'), status: response.status, data: payload?.data });
        }
        return response;
      };` })
    await cdp.send('Page.reload', { ignoreCache: true })
  }

  if (process.env.DASHBOARD_SELECT_TEST === '1') {
    await waitFor(cdp, `document.querySelector('.scene-select .el-select__wrapper')`)
    await value(cdp, `document.querySelector('.scene-select .el-select__wrapper').click()`)
    await waitFor(cdp, `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item => item.offsetParent && item.innerText.trim() === 'test')`)
    await value(cdp, `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.offsetParent && item.innerText.trim() === 'test').click()`)
  }
  await waitFor(cdp, `document.body.innerText.includes('住院死亡率') && !document.body.innerText.includes('正在加载质量看板')`, 60000)
  const bodyText = await value(cdp, 'document.body.innerText')
  if (process.env.DASHBOARD_CURRENT_VERSION_SMOKE === '1') {
    assert.match(bodyText, /0\.34%/)
    assert.match(bodyText, /环比\s*\+12\.02%/)
    assert.doesNotMatch(bodyText, /暂无正式结果|尚未配置数据|数据源不可用|加载失败/)
    process.stdout.write(`dashboard-current-version: PASS ${JSON.stringify({ appUrl, value: '0.34%', mom: '+12.02%' })}\n`)
  } else {
  assert.match(bodyText, /住院死亡率/)
  assert.match(bodyText, /急诊手术占比/)
  assert.match(bodyText, /入院48小时内转科(?:的)?比例/)
  assert.match(bodyText, /科室对比/)
  assert.match(bodyText, /趋势/)
  assert.match(bodyText, /数据明细/)
  assert.match(bodyText, /0\.31%/)
  assert.match(bodyText, /5\.19%/)
  assert.match(bodyText, /0\.49%/)
  assert.doesNotMatch(bodyText, /加载失败|暂无正式结果/)

  assert.match(await value(cdp, `document.querySelector('[data-testid="dashboard-period-start"]').innerText`), /2026\s*年\s*3\s*月/)
  assert.match(await value(cdp, `document.querySelector('[data-testid="dashboard-period-end"]').innerText`), /2026\s*年\s*3\s*月/)
  await selectMonth(cdp, 'dashboard-period-start', '2025 年 9 月')
  assert.equal(await value(cdp, `document.querySelector('[data-testid="dashboard-period-start"]').innerText.includes('2025 年 9 月')`), true)
  assert.equal(await value(cdp, `document.body.innerText.includes('正在加载质量看板')`), false, '选择月份时不应立即查询')
  await value(cdp, `document.querySelector('[data-testid="dashboard-period-apply"]').click()`)
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-period-start"]')?.innerText.includes('2025 年 9 月') && document.querySelector('[data-testid="dashboard-period-end"]')?.innerText.includes('2026 年 3 月') && document.body.innerText.includes('0.31%') && !document.body.innerText.includes('正在加载质量看板')`, 100000)
  assert.doesNotMatch(await value(cdp, 'document.body.innerText'), /HTTP 408|请求超时|质量看板加载失败/)

  await value(cdp, `Array.from(document.querySelectorAll('[data-widget-id]')).find(item => item.innerText.includes('住院死亡率（质量安全看板）') && !item.innerText.includes('科室对比') && !item.innerText.includes('趋势') && !item.innerText.includes('数据明细')).querySelector('[data-testid="binding-widget"]').click()`)
  await waitFor(cdp, `location.pathname === '/analysis'`, 60000)
  const navigation = await value(cdp, `({ pathname: location.pathname, search: location.search })`)
  assert.equal(navigation.pathname, '/analysis')

  process.stdout.write(`dashboard-three-indicators-live: PASS ${JSON.stringify({ dashboardId, period: '2025-09..2026-03', navigation })}\n`)
  }
} finally {
  server?.kill()
  if (cdp) {
    try { await cdp.send('Browser.close') } catch {}
    cdp.close()
  } else chrome?.kill()
  if (chrome) await waitForExit(chrome)
  await removeProfile(profile)
}

function Cdp(url) {
  this.id = 0
  this.pending = new Map()
  this.socket = new WebSocket(url)
  this.ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP 连接超时')), 10000)
    this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
    this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP 连接失败')) }, { once: true })
  })
  this.socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (!message.id || !this.pending.has(message.id)) return
    const pending = this.pending.get(message.id)
    this.pending.delete(message.id)
    clearTimeout(pending.timeout)
    message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
  })
  this.send = async (method, params = {}) => {
    await this.ready
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CDP ${method} 超时`)), 20000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  this.close = () => this.socket.close()
}

async function value(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面脚本执行失败')
  return result.result.value
}

async function waitFor(client, expression, timeoutMs = 45000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await value(client, `Boolean(${expression})`)) return
    await delay(150)
  }
  const text = await value(client, 'document.body.innerText').catch(() => '')
  const diagnostics = await value(client, 'window.dashboardQueryDiagnostics').catch(() => null)
  if (diagnostics) process.stderr.write(JSON.stringify(diagnostics) + '\n')
  throw new Error(`等待页面条件超时：${expression}\n${String(text).slice(0, 2000)}`)
}

async function waitHttp(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await delay(100)
  }
  throw new Error(`前端服务启动超时：${url}`)
}

async function waitForPageTarget(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const targets = await fetch(url).then(response => response.json()).catch(() => [])
    const page = targets.find(item => item.type === 'page' && item.url.startsWith(appUrl) && item.webSocketDebuggerUrl)
    if (page) return page
    await delay(100)
  }
  throw new Error('Chrome 页面调试目标启动超时')
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function selectMonth(client, testId, label) {
  await waitFor(client, `document.querySelector('[data-testid="${testId}"] .el-select__wrapper')`, 60000)
  await value(client, `document.querySelector('[data-testid="${testId}"] .el-select__wrapper').click()`)
  await waitFor(client, `Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item => item.offsetParent && item.innerText.trim() === ${JSON.stringify(label)})`)
  await value(client, `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.offsetParent && item.innerText.trim() === ${JSON.stringify(label)}).click()`)
}

async function waitForExit(processHandle) {
  if (processHandle.exitCode !== null) return
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 5000)
    processHandle.once('exit', () => { clearTimeout(timeout); resolve() })
  })
}

async function removeProfile(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await rm(path, { recursive: true, force: true }); return } catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error?.code) || attempt === 19) throw error
      await delay(100)
    }
  }
}
