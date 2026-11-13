import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.CATALOG_SEARCH_PORT || 5176), debugPort = 41815
const profile = await mkdtemp(join(tmpdir(), 'idmp-catalog-search-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser condition timed out') }
async function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

function mockBackend() {
  localStorage.setItem('idmp_access_token', 'catalog-search-fixture')
  const original = fetch.bind(window)
  window.catalogRequests = []
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return original(input, init)
    window.catalogRequests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) })
    let data = []
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    if (url.pathname.endsWith('/factors/categories')) data = ['医疗质量']
    if (url.pathname.endsWith('/data-domains/counts')) data = { PUBLISHED: '20', DRAFT: '7' }
    if (url.pathname.endsWith('/file-objects/upload-options')) data = { extensions: ['pdf', 'txt'], maxBytes: 10000000 }
    if (/\/(factors|factor-templates|policy-files|data-domains|dashboards|scenarios)$/.test(url.pathname)) {
      const keyword = url.searchParams.get('keyword') || '', page = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('size') || 20)
      const total = keyword === 'C_01' ? 1 : 27
      const count = Math.max(0, Math.min(size, total - (page - 1) * size))
      const names = Array.from({ length: count }, (_, i) => keyword === 'C_01' ? '住院质控' : page === 1 && i === 0 ? '手术死亡' : page === 1 && i === 1 ? '手术死亡率' : `死亡病例中接受手术患者占比${(page - 1) * size + i}`)
      data = { records: names.map((name, i) => ({ id: String((page - 1) * size + i + 1), name, code: keyword === 'C_01' ? 'C_01' : `SURG_${i}`,
        category: '医疗质量', status: 'PUBLISHED', definitionKind: 'SOURCE', currentPublishedVersionId: '101', type: 'CUSTOM',
        createdAt: '2026-11-13T08:00:00', updatedAt: '2026-11-13T08:00:00' })), total: String(total), pageNum: page, pageSize: size }
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
  await mkdir('.tmp/catalog-search', { recursive: true })
  for (const [route, api, placeholder] of [
    ['/factor', '/factors', '因子名称或编码'], ['/factor/templates', '/factor-templates', '模板名称或编码'],
    ['/policies', '/meta/policy-files', '政策文件名称或编码'], ['/data/domains', '/meta/data-domains', '数据域名称或编码'],
    ['/dashboard/manage', '/analysis/dashboards', '看板名称或编码'], ['/scenarios', '/scenarios', '场景名称或编码']
  ]) {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` })
    const selector = `input[placeholder="${placeholder}"]`
    await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && !!document.querySelector('.el-pagination')`))
    const calls = `window.catalogRequests.filter(x=>x.path==='/api/v1${api}'&&x.query.size!=='500')`
    async function search(keyword) {
      const before = await evaluate(`${calls}.length`)
      await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); input.focus(); input.value=${JSON.stringify(keyword)}; input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await waitFor(() => evaluate(`${calls}.length>${before} && ${calls}.at(-1).query.keyword===${JSON.stringify(keyword)} && !document.querySelector('.el-loading-mask')`))
    }
    await search('死亡手术')
    assert.equal(await evaluate(`${calls}.at(-1).query.page`), '1')
    assert.match(await evaluate(`document.querySelector('.idmp-page').textContent`), /手术死亡率/)
    const namesSelector = route === '/factor' ? '.factor-name-text' : route === '/dashboard/manage' ? '.dashboard-card h2' : '.el-table__row .el-table__cell:first-child .cell'
    assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(namesSelector)})].slice(0,2).map(node=>node.textContent.trim())`), ['手术死亡', '手术死亡率'])
    await evaluate(`document.querySelector('.el-pagination .btn-next').click()`)
    await waitFor(() => evaluate(`${calls}.at(-1).query.page==='2'`))
    assert.equal(await evaluate(`${calls}.at(-1).query.keyword`), '死亡手术')
    await search('C_01')
    assert.equal(await evaluate(`${calls}.at(-1).query.page`), '1')
    assert.match(await evaluate(`document.querySelector('.idmp-page').textContent`), /住院质控/)
    const resetLabel = route === '/data/domains' ? '清空筛选' : '重置'
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(resetLabel)}).click()`)
    await waitFor(() => evaluate(`${calls}.at(-1).query.keyword==null`))
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width === 390, deviceScaleFactor: 1 })
      await delay(150)
      await writeFile(`.tmp/catalog-search/${api.split('/').at(-1)}-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
    console.log(`PASS ${route}: Enter search, backend order, paging, exact code and reset`)
  }
  assert.deepEqual(errors, [])
} finally { socket?.close(); chrome.kill() }
