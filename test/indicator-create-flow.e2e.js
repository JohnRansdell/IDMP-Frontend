import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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
  let policyReferences = []
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
    else if (path.endsWith('/indicators/700/versions') && method === 'GET') data = window.__published ? [{ id: '701', status: 'PUBLISHED', versionNo: 1 }] : []
    else if (path.endsWith('/indicator-versions/701') && method === 'GET') data = { id: '701', status: window.__published ? 'PUBLISHED' : 'DRAFT', currentArtifactId: window.__compiled ? 'artifact' : null, versionNo: 1, formula: { root: { nodeType: 'BINARY', operator: 'DIV', left: { nodeType: 'FACTOR_REF', factorVersionId: '11' }, right: { nodeType: 'FACTOR_REF', factorVersionId: '12' } } } }
    else if (path.endsWith('/policy-references') && method === 'GET') data = policyReferences
    else if (path.endsWith('/policy-references') && method === 'POST') {
      if (window.__failPolicySave) return new Response(JSON.stringify({code:'ERR', message:'引用暂时保存失败'}), {status:503,headers:{'Content-Type':'application/json'}})
      data = { id: '801', policyFileId: '600', resourceVersion: 3, policyFileName: '真实政策引用验收', policyVersionNo: '2026', ...body }
      policyReferences = [data]
    }
    else if (path.endsWith('/policy-references/801/invalidate')) { policyReferences = []; data = null }
    else if (path.endsWith('/meta/policy-file-versions/published')) data = { records: [{ id: '100000000000000099', policyFileId: '600', policyFileName: '真实政策引用验收', versionNo: '2026' }] }
    else if (path.endsWith('/meta/policy-file-versions/100000000000000099')) data = { id: '100000000000000099', policyFileId: '600', publicationStatus: 'PUBLISHED', fileObjectId: '901' }
    else if (path.endsWith('/meta/file-objects/901')) data = { id: '901', originalName: '真实政策.txt', mimeType: 'text/plain' }
    else if (path.endsWith('/meta/file-objects/901/content')) return new Response('真实政策文件内容', { headers: { 'Content-Type': 'text/plain' } })
    else if (path.endsWith('/meta/policy-files/600')) data = { policyFile: { id: '600', name: '真实政策引用验收', documentNumber: '医发2026号' } }
    else if (path.endsWith('/indicators/700/scenarios')) data = { records: [], total: 0 }
    else if (path.endsWith('/indicator-versions/701/formula/compile')) { window.__compiled = true; data = { status: 'VALID', resourceVersion: draftVersion } }
    else if (path.endsWith('/indicator-versions/701/trial')) data = { taskId: 'task', batchId: 'batch' }
    else if (path.endsWith('/async-tasks/task')) data = { status: 'SUCCEEDED' }
    else if (path.endsWith('/calc/batches/batch') || path.endsWith('/calc/batches/formal')) data = { status: 'SUCCEEDED' }
    else if (path.endsWith('/trials/batch/results')) data = { batchId: 'batch', batchStatus: 'SUCCEEDED', outcomeStatus: 'CALCULATED', results: { records: [{ value: 0.5, displayValue: '50%', dimensions: {} }], total: 1 } }
    else if (path.endsWith('/indicator-versions/701/query')) data = { executionMode: 'AD_HOC_SOURCE', rows: [{ value: 0.5, displayValue: '50%' }] }
    else if (path.endsWith('/indicator-versions/701/publish')) { window.__published = true; data = { id: '701', status: 'PUBLISHED' } }
    else if (path.endsWith('/calc/batches') && method === 'POST') data = { batchId: 'formal' }
    else if (path.endsWith('/analysis/indicators/700/analysis')) data = { dataAvailable: false }
    else if (path.endsWith('/scenarios')) data = { records: [{ id: '500', name: '可选测试场景' }], total: 1 }
    else if (path.endsWith('/scenarios/500/versions')) data = [{ id: '501', versionNo: 2, publicationStatus: 'DRAFT' }]
    else if (path.endsWith('/scenario-versions/501')) data = { version: { id: '501', publicationStatus: 'DRAFT', resourceVersion: 7, indicators: [{ indicatorVersionId: 'other', displayOrder: 0, required: false, periodType: 'MONTHLY', dimensionGrain: ['科室'] }] } }
    else if (path.endsWith('/scenario-versions/501/indicators')) data = { version: { ...body, id: '501', publicationStatus: 'DRAFT', resourceVersion: 8 } }
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
  await evaluate(`(() => { window.__currentEditor = () => { let component = document.querySelector('.editor-page')?.__vueParentComponent; while (component && component.type.__name !== 'IndicatorEditor') component = component.parent; return component?.setupState }; window.__editor = window.__currentEditor(); Object.assign(window.__editor.form, { code: 'QUALITY_RATE', name: '流程测试指标', definition: '业务定义', sources: ['HIS'] }); })()`)
  await evaluate(`window.__editor.saveIndicatorBasicInfo()`)
  assert.equal(await evaluate(`window.__indicatorRequests.filter(item => item.method === 'POST' && item.path.endsWith('/indicators')).length`), 0, 'missing policy source blocks creation')
  assert.equal(await evaluate(`window.__editor.activeTab`), 'basic')
  assert.equal(await evaluate(`!!document.querySelector('#pane-basic .indicator-policy-sources .el-select__wrapper')`), true)
  assert.equal(await evaluate(`!!document.querySelector('#pane-policy')`), false, 'basis belongs to the selected source rather than a separate tab')
  await evaluate(`document.querySelector('#pane-basic .indicator-policy-sources > .el-select .el-select__wrapper').click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('真实政策引用验收'))`), 'real policy options')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes('真实政策引用验收')).click()`)
  await until(() => evaluate(`window.__editor.form.policyDrafts.length === 1 && window.__editor.policySourceState.count === 1`), 'source selected')
  assert.equal(await evaluate(`window.__editor.activeTab`), 'basic', 'source chosen without leaving page 1')
  assert.equal(await evaluate(`document.querySelector('.pending-source details').open`), false)
  await evaluate(`document.querySelector('.pending-source summary').click()`)
  await evaluate(`(() => { const row=document.querySelector('.pending-source'); const location=row.querySelector('input'); location.value='第三章第二条'; location.dispatchEvent(new Event('input',{bubbles:true})); const text=row.querySelector('textarea'); text.value='创建前填写的依据'; text.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await until(() => evaluate(`document.querySelector('.pending-source summary').textContent.includes('已补充依据')`), 'basis completion indicator')
  await mkdir('.tmp/policy-editor-browser', { recursive:true })
  await send('Emulation.setDeviceMetricsOverride', { width:390, height:844, mobile:true, deviceScaleFactor:1 })
  await evaluate(`document.querySelector('#pane-basic .indicator-policy-sources > .el-select input').blur();document.querySelector('.pending-source').scrollIntoView({block:'center',behavior:'instant'})`)
  await pause(100)
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`), false, 'inline policy fields fit mobile viewport')
  assert.ok(await evaluate(`document.querySelector('.pending-source textarea').getBoundingClientRect().width>=200`), 'basis input uses the full mobile form width')
  await writeFile('.tmp/policy-editor-browser/inline-basis-mobile.png', Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, mobile:false, deviceScaleFactor:1 })

  await evaluate(`document.querySelector('#pane-basic .indicator-policy-sources > .el-select input').blur()`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '保存并进入公式配置').click()`)
  await until(() => evaluate(`location.pathname === '/indicator/edit/700' && window.__currentEditor()?.indicatorWorkflow.indicatorId === '700' && window.__currentEditor() !== window.__editor`), 'new editor mounted after creation')
  await evaluate(`window.__editor = window.__currentEditor()`)
  assert.equal(await evaluate(`window.__indicatorRequests.find(item => item.method === 'POST' && item.path.endsWith('/indicators')).body.code`), 'QUALITY_RATE')
  assert.equal(await evaluate(`window.__editor.form.code`), 'QUALITY_RATE')
  assert.equal(await evaluate(`window.__editor.activeTab`), 'formula')
  assert.deepEqual(await evaluate(`Array.from(window.__editor.form.sources)`), ['HIS'])
  assert.equal(await evaluate(`Object.hasOwn(window.__editor.form, 'policies')`), false)
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
  assert.equal(await evaluate(`window.__editor.form.policyDrafts.length`), 1, 'source survives route remount and version creation')
  assert.equal(await evaluate(`window.__editor.form.policyDrafts[0].citationText`), '创建前填写的依据', 'basis survives creation and version changes')
  assert.equal(await evaluate(`window.__editor.form.policyDrafts[0].citationLocation`), '第三章第二条')
  assert.equal(await evaluate(`window.__indicatorRequests.filter(item => item.method === 'POST' && item.path.endsWith('/policy-references')).length`), 0, 'draft does not call published-only reference endpoint')
  // Missing source at publish time returns to the actual picker on page 1.
  await evaluate(`window.__savedSources = structuredClone(Array.from(window.__editor.form.policyDrafts, row => ({ ...row }))); window.__editor.form.policyDrafts = []; window.__editor.activeTab = 'publish'`)
  await until(() => evaluate(`window.__editor.policySourceState.count === 0`), 'source removed')
  await evaluate(`window.__editor.publishIndicatorVersionOnly()`)
  assert.equal(await evaluate(`window.__editor.activeTab`), 'basic')
  assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), '政策文件来源', 'missing source focuses page 1 picker')
  await evaluate(`window.__editor.form.policyDrafts = window.__savedSources; window.__editor.activeTab = 'basic'`)
  await until(() => evaluate(`!!document.querySelector('#pane-basic .pending-source textarea')`), 'optional basis beside the selected source')
  assert.equal(await evaluate(`document.querySelector('.pending-source details').open`), false)
  await evaluate(`document.querySelector('.pending-source summary').click()`)
  await evaluate(`(() => { const input = document.querySelector('#pane-basic .pending-source textarea'); input.value = '同步测试依据'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await until(() => evaluate(`window.__editor.form.policyDrafts[0].citationText === '同步测试依据'`), 'basis uses shared source state')
  await evaluate(`window.__editor.activeTab = 'basic'`)
  assert.equal(await evaluate(`window.__editor.form.policyDrafts[0].citationText`), '同步测试依据')
  assert.equal(await evaluate(`document.querySelector('#pane-basic .pending-source').textContent.includes('真实政策引用验收')`), true)
  await evaluate(`window.__editor.activeTab = 'basic'`)
  assert.equal(await evaluate(`document.querySelector('#pane-basic .pending-source textarea').value`), '同步测试依据', 'basis survives tab switches')
  await evaluate(`(() => { const input = document.querySelector('#pane-basic .pending-source textarea'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); const location=document.querySelector('#pane-basic .pending-source input'); location.value=''; location.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await until(() => evaluate(`window.__editor.form.policyDrafts[0].citationText === ''`), 'blank basis remains valid')
  await evaluate(`window.__editor.indicatorTrialPeriod = ['2026-01-01T00:00:00', '2026-02-01T00:00:00']; window.__editor.activeTab = 'formula'`)
  await evaluate(`window.__editor.compileIndicatorFormulaOnly()`)
  await until(() => evaluate(`window.__editor.indicatorWorkflow.compiled`), 'compiled')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#pane-formula button')).some(el => el.textContent.trim() === '发布指标版本')`), false)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#pane-formula button')).some(el => el.textContent.trim() === '即时运行')`), false, 'editor uses the original trial flow')
  assert.equal(await evaluate(`window.__indicatorRequests.filter(item => item.path.endsWith('/query')).length`), 0, 'editor does not send instant queries')
  await evaluate(`window.__editor.trialIndicatorAndLoadResult()`)
  assert.equal(await evaluate(`window.__editor.hasIndicatorTrialResults`), true)
  await evaluate(`Array.from(document.querySelectorAll('#pane-formula button')).find(el => el.textContent.includes('前往发布检查')).click(); window.__failPolicySave = true`)
  await until(() => evaluate(`window.__editor.activeTab === 'publish'`), 'publication step')
  await evaluate(`Array.from(document.querySelectorAll('#pane-publish button')).find(el => el.textContent.trim() === '发布指标版本').click()`)
  await until(() => evaluate(`window.__editor.indicatorWorkflow.published && !window.__editor.workflowLoading.publish`), 'published from publication step')
  assert.equal(await evaluate(`window.__editor.editorStatusLabel`), '已发布')
  assert.equal(await evaluate(`window.__editor.form.policyDrafts.length`), 1, 'failed reference persists for retry after publication')
  assert.equal(await evaluate(`window.__indicatorRequests.filter(item => item.path.endsWith('/publish') && item.path.includes('scenario')).length`), 0, 'no mandatory scenario operation')
  await evaluate(`window.__failPolicySave = false; Array.from(document.querySelectorAll('#pane-publish button')).find(el => el.textContent.trim() === '重试保存政策来源').click()`)
  await until(() => evaluate(`window.__editor.form.policyDrafts.length === 0 && !window.__editor.policySourceState.saving`), 'source retry saved')
  const policyWrite = await evaluate(`window.__indicatorRequests.filter(item => item.method === 'POST' && item.path.endsWith('/policy-references')).at(-1).body`)
  assert.equal(policyWrite.relationRole, 'SOURCE')
  assert.equal(policyWrite.citationText, '')
  assert.equal(policyWrite.citationLocation, '')
  assert.equal(await evaluate(`window.__indicatorRequests.filter(item => item.path.endsWith('/indicator-versions/701/publish')).length`), 1, 'retry does not republish')
  await evaluate(`window.__editor.activeTab = 'basic'`)
  await until(() => evaluate(`document.querySelector('.indicator-policy-sources .saved-source')?.textContent.includes('医发2026号')`), 'policy name and document number')
  await mkdir('.tmp/policy-editor-browser', { recursive: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile('.tmp/policy-editor-browser/published-references.png', Buffer.from(screenshot.data, 'base64'))
  await evaluate(`Array.from(document.querySelectorAll('.indicator-policy-sources .saved-source button')).find(el => el.textContent.includes('查看文件')).click()`)
  await until(() => evaluate(`document.querySelector('.policy-viewer pre')?.textContent.includes('真实政策文件内容')`), 'preview policy attachment')
  await evaluate(`document.querySelector('.policy-viewer').closest('.el-dialog').querySelector('.el-dialog__headerbtn').click()`)
  await evaluate(`window.__editor.activeTab = 'scene'`)
  await evaluate(`document.querySelector('#pane-scene .scenario-controls .el-select__wrapper').click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('可选测试场景'))`), 'scenario search')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes('可选测试场景')).click()`)
  await until(() => evaluate(`!document.querySelectorAll('#pane-scene .scenario-controls .el-select')[1].classList.contains('is-disabled')`), 'scenario versions loaded')
  await evaluate(`document.querySelectorAll('#pane-scene .scenario-controls .el-select__wrapper')[1].click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('草稿版本 2'))`), 'scenario draft options')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes('草稿版本 2')).click()`)
  await evaluate(`Array.from(document.querySelectorAll('#pane-scene button')).find(el => el.textContent.includes('加入场景草稿')).click()`)
  await until(() => evaluate(`window.__indicatorRequests.some(item => item.path.endsWith('/scenario-versions/501/indicators'))`), 'scenario binding saved')
  const bindings = await evaluate(`window.__indicatorRequests.find(item => item.path.endsWith('/scenario-versions/501/indicators')).body`)
  assert.equal(bindings.resourceVersion, 7)
  assert.equal(bindings.indicators.length, 2)
  assert.equal(bindings.indicators[0].periodType, 'MONTHLY')
  assert.equal(bindings.indicators[1].indicatorVersionId, '701')
  await evaluate(`window.__editor.activeTab = 'publish'; window.__editor.generateFormalResultAndOpenAnalysis()`)
  await until(() => evaluate(`window.__indicatorRequests.some(item => item.method === 'POST' && item.path.endsWith('/calc/batches'))`), 'standalone formal batch')
  const formal = await evaluate(`window.__indicatorRequests.find(item => item.method === 'POST' && item.path.endsWith('/calc/batches')).body`)
  assert.equal(formal.ownerType, 'INDICATOR')
  assert.equal(formal.ownerVersionId, '701')
  assert.equal(formal.scenarioVersionId, undefined)
  console.log('indicator-editor-workflow: PASS required source, optional basis, publication step publish, failed binding retry, trial results and independent formal run and non-destructive optional scenario binding')
} finally {
  socket?.close()
  chrome.kill()
  server.kill()
}
