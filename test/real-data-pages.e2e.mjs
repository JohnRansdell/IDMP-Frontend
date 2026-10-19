import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appPort = 41941, debugPort = 41942
const evidence = '.tmp/real-data-browser'
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-real-data-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  for (let i = 0; i < 250; i++) { if (await predicate()) return; await pause(100) }
  throw new Error(`Timed out: ${label}`)
}
let socket, next = 0
const pending = new Map(), errors = []
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function click(label) {
  if (label === '删除看板') await until(() => evaluate(`[...document.querySelectorAll('.el-message-box')].every(el => !el.checkVisibility({checkOpacity:true}))`), 'previous delete dialog closed')
  await until(() => evaluate(`Array.from(document.querySelectorAll('button')).some(el => el.textContent.trim() === ${JSON.stringify(label)} && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.disabled && !el.classList.contains('is-loading'))`), `button ready: ${label}`)
  assert.equal(await evaluate(`(() => { const button = [...document.querySelectorAll('button')].findLast(el => el.textContent.trim() === ${JSON.stringify(label)} && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })); if (!button || button.disabled) return false; button.click(); return true })()`), true, label)
}
async function navigate(path, text) {
  await send('Page.navigate', { url: `http://127.0.0.1:${appPort}${path}` })
  await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), path)
}
async function screenshot(name) {
  await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}

function fixture() {
  const original = fetch.bind(window)
  window.__mode = new URLSearchParams(location.search).get('testState') || 'error'
  window.__calls = []
  window.__deletedBoards = []
  window.__failDelete = false
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    if (!path.startsWith('/api/v1/')) return original(input, options)
    window.__calls.push({ path, method: options.method || 'GET' })
    const mode = window.__mode
    let data = [], status = 200
    if (path.endsWith('/auth/me')) data = { user: { id: '1', username: 'real-user', displayName: '接口用户' }, roles: ['SYSTEM_ADMIN'], permissions: [] }
    else if (path.endsWith('/notifications/unread-count')) data = { unreadCount: 0 }
    else if (path === '/api/v1/analysis/dashboards') data = mode === 'legacy' ? [{ id: '900', name: '旧配置看板', status: 'PUBLISHED', currentPublishedVersionId: '901' }]
      : mode.startsWith('board-') ? ['800', '810'].filter(id => !window.__deletedBoards.includes(id)).map(id => ({ id, name: '绩效看板', status: 'PUBLISHED', currentPublishedVersionId: id === '800' ? '801' : '811' })) : []
    else if (/\/analysis\/dashboards\/(800|810)$/.test(path) && options.method === 'DELETE') {
      if (window.__failDelete) status = 500
      else window.__deletedBoards.push(path.split('/').at(-1))
    }
    else if (path === '/api/v1/analysis/dashboards/900') data = {
      dashboard: { id: '900', name: '旧配置看板', currentPublishedVersionId: '901', workingVersionId: '901' },
      version: { id: '901', publicationStatus: 'PUBLISHED', resourceVersion: 1, layout: { columns: 24 }, style: { dataMode: 'MOCK' }, widgets: [] }
    }
    else if (/\/analysis\/dashboards\/(800|810)$/.test(path)) data = {
      dashboard: { id: path.split('/').at(-1), name: '绩效看板', currentPublishedVersionId: '801', workingVersionId: '801' },
      version: { id: '801', publicationStatus: 'PUBLISHED', layout: { columns: 24 }, widgets: [{
        code: 'real-kpi', type: 'KPI', title: '接口返回零值', dataSourceCode: 'REAL_SOURCE',
        position: { x: 0, y: 0, w: 8, h: 5 },
        fieldBindings: { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
      }] }
    }
    else if (path.endsWith('/REAL_SOURCE/fields')) data = [{ code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE' }]
    else if (path.endsWith('/REAL_SOURCE/available-periods')) data = [{ periodType: 'MONTHLY', periodStart: '2026-09-01' }]
    else if (/\/analysis\/dashboards\/(800|810)\/query$/.test(path)) {
      if (mode === 'board-error') status = 500
      else data = { widgets: { 'real-kpi': { status: mode === 'board-empty' ? 'EMPTY' : 'READY', rows: mode === 'board-empty' ? [] : [{ value: 0 }] } } }
    }
    else if (path === '/api/v1/indicators' || path === '/api/v1/factors' || path === '/api/v1/scenarios') {
      if (mode === 'hold') await new Promise(resolve => { window.__release = resolve })
      if (mode === 'error' || mode === 'hold') status = 500
      else if (mode === 'success') data = { records: [{ id: '101', code: 'REAL_101', name: '接口真实记录', status: 'DRAFT', type: 'CUSTOM' }], total: 1 }
      else data = { records: [], total: 0 }
    }
    else if (path === '/api/v1/indicators/101') {
      if (mode === 'error') status = 500
      else data = { id: '101', code: 'REAL_101', name: '接口详情记录', status: 'DRAFT' }
    }
    else if (path.endsWith('/query')) throw new Error('This test must not send a fabricated result query')
    return new Response(JSON.stringify(status === 200 ? { code: 'OK', data } : { code: 'SERVER_ERROR', message: '接口失败验证' }), { status, headers: { 'Content-Type': 'application/json' } })
  }
}

try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'Vite')
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails)
    const request = pending.get(value.id)
    if (request) { pending.delete(value.id); value.error ? request.reject(new Error(value.error.message)) : request.resolve(value.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  for (const [path, loading, failed, empty] of [
    ['/indicator', '正在加载指标目录', '指标目录加载失败', '没有符合条件的指标'],
    ['/factor', '正在加载因子目录', '因子目录加载失败', '没有符合条件的因子'],
    ['/scenarios', '正在加载场景目录', '场景目录加载失败', '暂无场景']
  ]) {
    await navigate(`${path}?testState=hold`, loading)
    assert.equal(await evaluate(`document.body.innerText.includes('演示数据')`), false)
    await until(() => evaluate(`typeof window.__release === 'function'`), 'held request')
    await evaluate('window.__release()')
    await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(failed)})`), failed)
    assert.equal(await evaluate(`document.body.innerText.includes('KH-01') || document.body.innerText.includes('F-001')`), false)
    await evaluate(`window.__mode='empty'`)
    await click('重试')
    await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(empty)})`), empty)
    await navigate(`${path}?testState=success`, '接口真实记录')
    assert.equal(await evaluate(`document.body.innerText.includes('全局场景')`), false)
  }
  await navigate('/indicator/view/101?testState=error', '指标详情加载失败')
  assert.equal(await evaluate(`!!document.querySelector('.detail-layout')`), false)
  await evaluate(`window.__mode='success'`)
  await click('重试')
  await until(() => evaluate(`document.body.innerText.includes('接口详情记录') && !!document.querySelector('.detail-layout')`), 'real detail retry')
  await navigate('/dashboard?dashboardDemo=1&testState=empty', '暂无服务端看板')
  await click('创建服务端看板')
  await until(() => evaluate(`document.body.innerText.includes('新建服务端看板')`), 'empty catalog create dialog')
  await navigate('/dashboard?id=800&testState=board-ready', '接口返回零值')
  await until(() => evaluate(`!!document.querySelector('[data-testid="binding-widget"]')`), 'real binding widget')
  assert.equal(await evaluate(`document.body.innerText.includes('固定验收数据')`), false)
  await navigate('/dashboard?id=800&testState=board-empty', '当前条件暂无正式结果')
  await click('编辑看板')
  await until(() => evaluate(`!!document.querySelector('.dashboard-studio') && !!document.querySelector('[data-testid="dashboard-board-menu"]')`), 'empty board editor and management menu')
  assert.equal(await evaluate(`document.body.innerText.includes('当前条件暂无正式结果')`), false)
  await evaluate(`document.querySelector('.studio-back').click()`)
  await until(() => evaluate(`document.body.innerText.includes('当前条件暂无正式结果')`), 'exit empty board editor')
  await click('删除看板')
  await until(() => evaluate(`!!document.querySelector('.el-message-box')`), 'delete confirmation')
  await click('取消')
  await until(() => evaluate(`!document.querySelector('.el-message-box')?.checkVisibility({checkOpacity:true}) && !document.querySelector('[data-testid="dashboard-delete"]')?.classList.contains('is-loading')`), 'delete cancellation settled')
  assert.equal(await evaluate(`window.__calls.filter(call => call.method === 'DELETE').length`), 0)
  await evaluate(`window.__failDelete=true`)
  await click('删除看板'); await until(() => evaluate(`!!document.querySelector('.el-message-box')?.checkVisibility({checkOpacity:true})`), 'confirm delete visible'); await click('删除')
  await until(() => evaluate(`document.body.innerText.includes('删除失败')`), 'delete failure retains board')
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('id')`), '800')
  await until(() => evaluate(`!document.querySelector('[data-testid="dashboard-delete"]')?.classList.contains('is-loading') && [...document.querySelectorAll('.el-message-box')].every(el=>!el.checkVisibility({checkOpacity:true}))`), 'failed delete settled')
  await evaluate(`window.__failDelete=false`)
  await click('删除看板'); await until(() => evaluate(`!!document.querySelector('.el-message-box')?.checkVisibility({checkOpacity:true})`), 'confirm delete visible'); await click('删除')
  await until(() => evaluate(`new URLSearchParams(location.search).get('id')==='810' && document.body.innerText.includes('当前条件暂无正式结果')`), 'delete switches to remaining board')
  assert.deepEqual(await evaluate(`window.__deletedBoards`), ['800'])
  await click('删除看板'); await until(() => evaluate(`!!document.querySelector('.el-message-box')?.checkVisibility({checkOpacity:true})`), 'confirm delete visible'); await click('删除')
  await until(() => evaluate(`document.body.innerText.includes('暂无服务端看板') && !new URLSearchParams(location.search).has('id')`), 'delete last board clears stale URL')
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="dashboard-edit"]') || !!document.querySelector('[data-testid="dashboard-delete"]')`), false)
  await navigate('/dashboard?id=800&testState=board-error', '质量看板加载失败')
  await click('编辑看板')
  await until(() => evaluate(`!!document.querySelector('.dashboard-studio')`), 'error board can enter editor')
  await evaluate(`document.querySelector('.studio-back').click()`)
  await until(() => evaluate(`document.body.innerText.includes('质量看板加载失败')`), 'exit error board editor')
  await evaluate(`window.__mode='board-ready'`)
  await click('重新加载')
  await until(() => evaluate(`document.body.innerText.includes('接口返回零值')`), 'dashboard retry')
  await navigate('/dashboard?id=900&testState=legacy', '旧演示看板需要重新配置')
  await screenshot('legacy-dashboard.png')
  await click('编辑看板')
  await until(() => evaluate(`document.body.innerText.includes('旧演示组件已从本次编辑中清空')`), 'legacy editor')
  assert.equal(await evaluate(`document.body.innerText.includes('固定验收数据') || document.body.innerText.includes('恢复演示布局')`), false)
  await navigate('/analysis/drill?source=mock&resultId=MOCK-RESULT&testState=empty', '演示下钻入口已停用')
  assert.equal(await evaluate(`window.__calls.some(call => call.path.endsWith('/drill/search'))`), false)
  await screenshot('blocked-demo-drill.png')
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, errors }, null, 2))
  console.log('PASS: catalog loading/error/retry/empty/live; detail retry; empty/error board editing and confirmed deletion; empty dashboard creation; legacy MOCK repair; obsolete mock drill blocked; no runtime exceptions')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure.png')
    await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({ url: location.href, text: document.body.innerText, calls: window.__calls, errors: ${JSON.stringify(errors)} })`), null, 2))
  }
  throw error
} finally { socket?.close(); chrome.kill(); server.kill() }
