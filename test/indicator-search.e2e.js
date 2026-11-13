import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.INDICATOR_SEARCH_PORT || 5176)
const debugPort = 41814
const profile = await mkdtemp(join(tmpdir(), 'idmp-indicator-search-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser condition timed out') }
async function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

function mockBackend() {
  localStorage.setItem('idmp_access_token', 'indicator-search-fixture')
  const original = fetch.bind(window)
  window.searchRequests = []
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return original(input, init)
    window.searchRequests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) })
    let data = []
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    if (url.pathname.endsWith('/indicators/categories')) data = ['医疗质量', '运营效率']
    if (url.pathname.endsWith('/indicators')) {
      const keyword = url.searchParams.get('keyword') || ''
      const page = Number(url.searchParams.get('page') || 1)
      const codes = keyword === 'CORE_FT_1790935889092' ? ['CORE_FT_1790935889092'] : ['SURG_DEATH', 'DEATH_SURG_RATE']
      const names = keyword === 'CORE_FT_1790935889092' ? ['系统完整测试普通指标'] : page === 2 ? ['手术后死亡病例占比'] : ['手术死亡率', '死亡病例中接受手术患者占比']
      data = { records: names.map((name, i) => ({ id: String(page * 10 + i), name, code: codes[i], category: '医疗质量', status: 'PUBLISHED', scenarioCount: 2,
        latestPublishedVersionId: `1020276424686050${i}`, latestPublishedVersionNo: 10, direction: '↑逐步提高' })), total: keyword === 'CORE_FT_1790935889092' ? 1 : 12, pageNum: page, pageSize: 9 }
    }
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/indicator` })
  await waitFor(() => evaluate(`!!document.querySelector('.indicator-page .el-table__row')`))
  async function search(keyword) {
    const before = await evaluate('window.searchRequests.filter(x=>x.path.endsWith("/indicators")).length')
    await evaluate(`(() => {const input=document.querySelector('[aria-label="按指标名称或编码搜索"]');input.focus();input.value=${JSON.stringify(keyword)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await waitFor(() => evaluate(`(() => { let c=document.querySelector('.indicator-page')?.__vueParentComponent;while(c&&c.type.__name!=='IndicatorManagement')c=c.parent;return window.searchRequests.filter(x=>x.path.endsWith('/indicators')).length>${before}&&c&&!c.setupState.tableLoading })()`))
  }
  await search('死亡手术')
  assert.equal(await evaluate(`window.searchRequests.filter(x=>x.path.endsWith('/indicators')).at(-1).query.keyword`), '死亡手术')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.el-table__row')].map(row=>row.querySelector('.action-link').textContent)`), ['手术死亡率', '死亡病例中接受手术患者占比'])
  assert.match(await evaluate(`document.querySelector('.pagination-row').textContent`), /共 12 条/)
  await evaluate(`document.querySelector('.el-pagination .btn-next').click()`)
  await waitFor(() => evaluate(`window.searchRequests.filter(x=>x.path.endsWith('/indicators')).at(-1).query.page==='2'`))
  assert.equal(await evaluate(`window.searchRequests.filter(x=>x.path.endsWith('/indicators')).at(-1).query.keyword`), '死亡手术')
  await search('CORE_FT_1790935889092')
  assert.equal(await evaluate(`window.searchRequests.filter(x=>x.path.endsWith('/indicators')).at(-1).query.page`), '1')
  await waitFor(() => evaluate(`document.querySelector('.el-table__row')?.textContent.includes('系统完整测试普通指标')`))
  await mkdir('.tmp/indicator-search', { recursive: true })
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width === 390, deviceScaleFactor: 1 })
    await delay(200)
    await writeFile(`.tmp/indicator-search/catalog-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    assert.equal(await evaluate(`!!document.querySelector('.indicator-page [aria-label="按指标名称或编码搜索"]')`), true)
  }
  assert.equal(await evaluate(`window.searchRequests.some(x=>x.path.includes('/indicator-versions'))`), false)
  assert.deepEqual(errors, [])
  console.log('PASS: indicator search submits Enter queries and server pagination, preserves ranking and whole codes on desktop/mobile')
} finally { socket?.close(); chrome.kill() }
