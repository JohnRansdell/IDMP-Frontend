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
  // Protected pages restore the intercepted administrator fixture; no real credentials are used.
  localStorage.setItem('idmp_access_token', 'local-browser-fixture')
  const original = fetch.bind(window)
  window.__mode = new URLSearchParams(location.search).get('testState') || 'error'
  window.__calls = []
  window.__deletedBoards = []
  window.__failDelete = false
  if (window.__mode === 'publication') localStorage.setItem('idmp:dashboard-catalog:v1', JSON.stringify([
    { id: 'local-draft', name: '本地未发布看板', dashboardType: 'custom', scope: 'personal', updatedAt: '2026-10-26T00:00:00Z' }
  ]))
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    if (!path.startsWith('/api/v1/')) return original(input, options)
    window.__calls.push({ path, method: options.method || 'GET' })
    const mode = window.__mode
    let data = [], status = 200
    if (path.endsWith('/auth/me')) {
      const resource = mode === 'edit-factor' ? 'factors' : 'indicators'
      data = { user: { id: '1', username: 'real-user', displayName: '接口用户' }, roles: ['SYSTEM_ADMIN'], permissions: [] }
      if (mode.startsWith('board-access-')) Object.assign(data, { roles: ['CUSTOM'], permissions: ['dashboard:view'], apiRules: [
        { action: 'GET', resourcePattern: '/api/v1/analysis/dashboards' },
        { action: 'GET', resourcePattern: '/api/v1/analysis/dashboards/**' },
        ...(mode.includes('creator') ? [{ action: 'POST', resourcePattern: '/api/v1/analysis/dashboards' }] : []),
        ...(mode.includes('editor') ? [{ action: 'PUT', resourcePattern: '/api/v1/analysis/dashboards/800' }] : [])
      ] })
      if (mode === 'scenario-only') Object.assign(data, { roles: ['CUSTOM'], permissions: ['scenario:view'],
        apiRules: [{ action: 'GET', resourcePattern: '/api/v1/scenarios' }] })
      if (mode.startsWith('edit-')) Object.assign(data, { roles: ['CUSTOM'], permissions: ['resource:view'], apiRules: [
        { action: 'GET', resourcePattern: `/api/v1/${resource}` },
        { action: 'GET', resourcePattern: `/api/v1/${resource}/**` },
        { action: resource === 'factors' ? 'PATCH' : 'PUT', resourcePattern: `/api/v1/${resource}/101` }
      ] })
    }
    else if (path.endsWith('/notifications/unread-count')) data = { unreadCount: 0 }
    else if (path === '/api/v1/analysis/dashboards') data = mode === 'legacy' ? [{ id: '900', name: '旧配置看板', status: 'PUBLISHED', currentPublishedVersionId: '901' }]
      : mode === 'publication' ? [
        { id: 'draft', name: '服务端未发布看板', workingVersionId: 'd1', workingVersionStatus: 'DRAFT', ...(window.__publishedDraft ? { status: 'PUBLISHED', currentPublishedVersionId: 'd1', workingVersionStatus: 'PUBLISHED' } : {}) },
        { id: 'published', name: '已上线看板', status: 'PUBLISHED', currentPublishedVersionId: 'p1', workingVersionId: 'p1' },
        { id: 'changed', name: '已上线待更新看板', status: 'DRAFT', currentPublishedVersionId: 'c1', workingVersionId: 'c2', workingVersionStatus: 'DRAFT' }
      ] : mode.startsWith('board-') ? ['800', '810'].filter(id => !window.__deletedBoards.includes(id)).map(id => ({ id, name: '绩效看板', status: 'PUBLISHED', currentPublishedVersionId: id === '800' ? '801' : '811' })) : []
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
    else if (/\/analysis\/dashboards\/(800|810)\/versions$/.test(path) && mode.startsWith('board-access-')) data = [{ id: '801', publicationStatus: 'PUBLISHED', layout: { columns: 24 }, widgets: [{
      code: 'real-kpi', type: 'KPI', title: '接口返回零值', dataSourceCode: 'REAL_SOURCE',
      position: { x: 0, y: 0, w: 8, h: 5 },
      fieldBindings: { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
    }] }]
    else if (path.endsWith('/REAL_SOURCE/fields')) data = [{ code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE' }]
    else if (path.endsWith('/REAL_SOURCE/available-periods')) data = [{ periodType: 'MONTHLY', periodStart: '2026-09-01' }]
    else if (/\/analysis\/dashboards\/(800|810)\/query$/.test(path)) {
      if (mode === 'board-error') status = 500
      else data = { widgets: { 'real-kpi': { status: mode === 'board-empty' ? 'EMPTY' : 'READY', rows: mode === 'board-empty' ? [] : [{ value: 0 }] } } }
    }
    else if (path === '/api/v1/indicators' || path === '/api/v1/factors' || path === '/api/v1/scenarios') {
      if (mode === 'hold') await new Promise(resolve => { window.__release = resolve })
      if (mode === 'error' || mode === 'hold') status = 500
      else if (mode === 'success' || mode.startsWith('edit-')) data = { records: [{ id: '101', code: 'REAL_101', name: '接口真实记录', status: 'DRAFT', type: 'CUSTOM' }], total: 1 }
      else data = { records: [], total: 0 }
    }
    else if (path === '/api/v1/indicators/101') {
      if (mode === 'error') status = 500
      else data = { id: '101', code: 'REAL_101', name: '接口详情记录', status: 'DRAFT' }
    }
    else if (path.endsWith('/query')) throw new Error('This test must not send a fabricated result query')
    if (mode.startsWith('board-access-') && /\/analysis\/dashboards\/(800|810)$/.test(path) && options.method !== 'DELETE') {
      data.dashboard.workingVersionId = '802'
      data.dashboard.workingVersionStatus = 'DRAFT'
      data.version.id = '802'
      data.version.publicationStatus = 'DRAFT'
      data.version.widgets[0].title = '未发布草稿组件'
      if (mode.includes('unpublished')) delete data.dashboard.currentPublishedVersionId
    }
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
  await navigate('/login?testState=scenario-only', '暂无场景')
  assert.equal(await evaluate('location.pathname'), '/scenarios')
  for (const [kind, createLabel] of [['factor', '新建因子'], ['indicator', '新增指标']]) {
    await navigate(`/${kind}?testState=edit-${kind}`, '接口真实记录')
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===${JSON.stringify(createLabel)} && el.checkVisibility({checkOpacity:true}))`), false)
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='编辑' && el.checkVisibility({checkOpacity:true}))`), true)
    await click('编辑')
    await until(() => evaluate(`location.pathname==='/${kind}/edit/101'`), `${kind} edit-only navigation uses resource ID`)
    assert.equal(await evaluate(`window.__calls.some(call=>call.path==='/api/v1/${kind}s' && call.method==='POST')`), false)
  }
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
  await navigate('/indicator/edit/new?testState=empty', '保存并进入公式配置')
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(el=>el.textContent.includes('6 发布检查')).click()`)
  await until(() => evaluate(`!!document.querySelector('.publish-layout')?.checkVisibility({checkOpacity:true})`), 'extracted indicator publication step')
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='发布指标版本').disabled`), true)
  await screenshot('indicator-publish-step.png')
  for (const role of ['reader', 'creator', 'editor']) {
    await navigate(`/dashboard?id=800&testState=board-access-${role}`, '接口返回零值')
    await until(() => evaluate(`!!document.querySelector('.dashboard-schema-canvas') && document.body.innerText.includes('0')`), `${role} published viewer`)
    assert.equal(await evaluate(`!!document.querySelector('.dashboard-draft-badge')`), role === 'editor')
    assert.equal(await evaluate(`document.body.innerText.includes('未发布草稿组件')`), false, 'viewer must use published widgets')
    assert.equal(await evaluate(`!!document.querySelector('.dashboard-studio')`), false)
    await screenshot(`dashboard-${role}-publication.png`)
  }
  // Same editor can maintain 800, but switching to 810 must remove its lifecycle hint.
  await evaluate(`document.querySelector('.idmp-nav__subitem[href*="id=810"]').click()`)
  await until(() => evaluate(`location.search.includes('id=810') && window.__calls.some(call=>call.path==='/api/v1/analysis/dashboards/810/query') && !!document.querySelector('.dashboard-schema-canvas')`), 'switch to board without update grant')
  assert.equal(await evaluate(`!!document.querySelector('.dashboard-draft-badge')`), false)
  await navigate('/dashboard?id=800&edit=1&testState=board-access-editor', 'DASHBOARD STUDIO')
  await until(() => evaluate(`document.body.innerText.includes('未发布草稿组件')`), 'resource-specific editor can load draft')
  for (const role of ['reader', 'creator']) {
    await navigate(`/dashboard?id=800&edit=1&testState=board-access-${role}`, '接口返回零值')
    assert.equal(await evaluate(`new URLSearchParams(location.search).has('edit')`), false)
    assert.equal(await evaluate(`!!document.querySelector('.dashboard-studio')`), false)
  }
  await navigate('/dashboard?id=800&testState=board-access-reader-unpublished', '当前看板暂不可用')
  assert.equal(await evaluate(`/有未发布草稿|已发布|草稿配置|进入编辑模式|看板尚未发布/.test(document.body.innerText)`), false)
  assert.equal(await evaluate(`window.__calls.some(call=>call.path.endsWith('/query'))`), false)
  await screenshot('dashboard-reader-unavailable.png')
  await navigate('/dashboard?id=800&testState=board-access-editor-unpublished', '看板尚未发布')
  assert.equal(await evaluate(`document.body.innerText.includes('进入编辑模式保存并发布')`), true)
  await navigate('/dashboard/manage?testState=publication', '本地未发布看板')
  await until(() => evaluate(`document.querySelectorAll('.dashboard-card').length === 4 && document.querySelectorAll('.idmp-nav__subitem').length === 2`), 'mixed publication catalog')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.dashboard-card')].map(card=>({name:card.querySelector('h2').textContent,status:card.querySelector('.dashboard-card__publication').textContent})).sort((a,b)=>a.name.localeCompare(b.name,'en'))`), [
    { name: '已上线待更新看板', status: '已发布 · 有未发布修改' },
    { name: '已上线看板', status: '已发布' },
    { name: '服务端未发布看板', status: '草稿（未发布）' },
    { name: '本地未发布看板', status: '本地草稿' }
  ].sort((a,b)=>a.name.localeCompare(b.name,'en')))
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.idmp-nav__subitem')].map(el=>el.textContent).sort()`), ['已上线待更新看板', '已上线看板'].sort())
  await until(() => evaluate(`[...document.querySelectorAll('.dashboard-card__publication .el-tag')].every(el=>getComputedStyle(el).transform==='none' && Number(getComputedStyle(el).opacity)===1)`), 'publication badges finish entering')
  await screenshot('dashboard-publication-status.png')
  await evaluate(`window.__publishedDraft=true; import('/src/idmp/layout/shellState.js').then(module=>module.notifyDashboardCatalogChanged())`)
  await until(() => evaluate(`document.querySelectorAll('.idmp-nav__subitem').length === 3`), 'publication event refreshes overview without page reload')
  assert.equal(await evaluate(`[...document.querySelectorAll('.idmp-nav__subitem')].some(el=>el.textContent==='本地未发布看板')`), false)
  await evaluate(`localStorage.removeItem('idmp:dashboard-catalog:v1')`)
  await navigate('/dashboard?dashboardDemo=1&testState=empty', '暂无服务端看板')
  await click('前往看板管理')
  await until(() => evaluate(`document.body.innerText.includes('还没有看板')`), 'empty catalog management')
  await click('新建看板')
  await until(() => evaluate(`!!document.querySelector('.el-dialog')?.checkVisibility({checkOpacity:true})`), 'empty catalog create dialog')
  await navigate('/dashboard?id=800&testState=board-ready', '接口返回零值')
  await until(() => evaluate(`!!document.querySelector('[data-testid="binding-widget"]')`), 'real binding widget')
  assert.equal(await evaluate(`document.body.innerText.includes('固定验收数据')`), false)
  await navigate('/dashboard?id=800&testState=board-empty', '当前筛选条件下暂无数据')
  await navigate('/dashboard?id=800&edit=1&testState=board-empty', 'DASHBOARD STUDIO')
  await until(() => evaluate(`!!document.querySelector('.dashboard-studio')`), 'empty board editor')
  assert.equal(await evaluate(`!!document.querySelector('.dashboard-schema-viewer')`), false)
  await evaluate(`document.querySelector('.studio-back').click()`)
  await until(() => evaluate(`location.pathname==='/dashboard/manage' && !!document.querySelector('.dashboard-cards')`), 'exit empty board editor to management')
  await navigate('/dashboard/manage?testState=board-empty', '绩效看板')
  async function openDeleteMenu() {
    const point = await evaluate(`(() => { const box = document.querySelector('[aria-label="更多看板操作"]').getBoundingClientRect(); return {x:box.x+box.width/2,y:box.y+box.height/2} })()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await until(() => evaluate(`[...document.querySelectorAll('.el-dropdown-menu__item')].some(el=>el.textContent.trim()==='删除' && el.checkVisibility({checkOpacity:true}))`), 'management delete menu')
    await evaluate(`[...document.querySelectorAll('.el-dropdown-menu__item')].find(el=>el.textContent.trim()==='删除' && el.checkVisibility({checkOpacity:true})).click()`)
    await until(() => evaluate(`!!document.querySelector('.el-message-box')?.checkVisibility({checkOpacity:true})`), 'delete confirmation')
  }
  await openDeleteMenu(); await click('取消')
  await until(() => evaluate(`[...document.querySelectorAll('.el-message-box')].every(el=>!el.checkVisibility({checkOpacity:true}))`), 'delete cancellation settled')
  assert.equal(await evaluate(`window.__calls.filter(call => call.method === 'DELETE').length`), 0)
  await evaluate(`window.__failDelete=true`)
  await openDeleteMenu(); await click('删除')
  await until(() => evaluate(`window.__calls.filter(call => call.method === 'DELETE').length===1 && !!document.querySelector('.el-message--error')`), 'delete failure retains board')
  assert.equal(await evaluate(`document.querySelectorAll('.dashboard-card').length`), 2)
  await evaluate(`window.__failDelete=false`)
  await openDeleteMenu(); await click('删除')
  await until(() => evaluate(`document.querySelectorAll('.dashboard-card').length===1`), 'delete refreshes catalog')
  assert.deepEqual(await evaluate(`window.__deletedBoards`), ['800'])
  await openDeleteMenu(); await click('删除')
  await until(() => evaluate(`document.body.innerText.includes('还没有看板')`), 'delete last board')
  await navigate('/dashboard?id=800&testState=board-error', '质量看板加载失败')
  await navigate('/dashboard?id=800&edit=1&testState=board-error', 'DASHBOARD STUDIO')
  await until(() => evaluate(`!!document.querySelector('.dashboard-studio')`), 'error board can enter editor')
  await evaluate(`document.querySelector('.studio-back').click()`)
  await until(() => evaluate(`location.pathname==='/dashboard/manage' && !!document.querySelector('.dashboard-cards')`), 'exit error board editor to management')
  await navigate('/dashboard?id=800&testState=board-error', '质量看板加载失败')
  await evaluate(`window.__mode='board-ready'`)
  await click('重新加载')
  await until(() => evaluate(`document.body.innerText.includes('接口返回零值')`), 'dashboard retry')
  await navigate('/dashboard?id=900&testState=legacy', '旧演示看板需要重新配置')
  await screenshot('legacy-dashboard.png')
  await navigate('/dashboard?id=900&edit=1&testState=legacy', 'DASHBOARD STUDIO')
  await until(() => evaluate(`document.body.innerText.includes('旧演示组件已从本次编辑中清空')`), 'legacy editor')
  assert.equal(await evaluate(`document.body.innerText.includes('固定验收数据') || document.body.innerText.includes('恢复演示布局')`), false)
  await navigate('/analysis/drill?source=mock&resultId=MOCK-RESULT&testState=empty', '演示下钻入口已停用')
  assert.equal(await evaluate(`window.__calls.some(call => call.path.endsWith('/drill/search'))`), false)
  await screenshot('blocked-demo-drill.png')
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, errors }, null, 2))
  console.log('PASS: dashboard publication badges, draft exclusion and live publication refresh; scoped homepage and edit-only access; catalog loading/error/retry/empty/live; detail retry; indicator publication step; empty/error board editing and confirmed deletion; empty dashboard creation; legacy MOCK repair; obsolete mock drill blocked; no runtime exceptions')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure.png')
    await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({ url: location.href, text: document.body.innerText, calls: window.__calls, errors: ${JSON.stringify(errors)} })`), null, 2))
  }
  throw error
} finally { socket?.close(); chrome.kill(); server.kill() }
