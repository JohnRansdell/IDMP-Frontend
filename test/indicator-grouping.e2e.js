import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class Cdp {
  sequence = 0
  pending = new Map()
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject) })
    this.socket.addEventListener('message', event => { const data = JSON.parse(event.data); const request = this.pending.get(data.id); if (!request) return; this.pending.delete(data.id); data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result) })
  }
  async send(method, params = {}) { await this.ready; return new Promise((resolve, reject) => { const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) }) }
}

// These API fixtures are deliberately isolated from the deployed platform database.
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'grouping-browser-fixture')
  const realFetch = window.fetch.bind(window)
  window.__groupingRequests = []
  const formula = { root: { nodeType: 'BINARY', operator: 'DIV', left: { nodeType: 'FACTOR_REF', factorVersionId: '11' }, right: { nodeType: 'FACTOR_REF', factorVersionId: '12' } }, display: { format: 'PERCENT', multiplier: '100' } }
  const columns = ['dept_code', 'dept_name', 'doctor_code', 'doctor_name', 'diagnosis']
  const fields = columns.map(columnName => ({ physicalTable: 'visit', sqlAlias: 'b', columnName, fieldReference: `b.${columnName}`, columnType: 'varchar', comment: '' }))
  const drafts = ['total', 'transfer'].map((key, index) => ({ key, suggestedCode: key.toUpperCase(), suggestedName: key === 'total' ? '入院总人次' : '转科人次', outputAlias: `${key}_cnt`, groupingSupported: true, dimensionFieldOptions: index ? [...fields, { ...fields[0], sqlAlias: 't', physicalTable: 'transfer', columnName: 'department_id', fieldReference: 't.department_id' }] : fields, dsl: { definitionType: 'SQL', sqlTemplate: 'SELECT COUNT(*) factor_value FROM visit b', parameters: [] } }))
  const preview = { valid: true, factors: drafts, tables: [], diagnostics: [], formula: { template: { root: { nodeType: 'FACTOR_KEY_REF', factorKey: 'total' } } } }
  const path = { path: { id: '90', pathCode: 'ORGANIZATION', pathName: '科室到医生' }, version: { id: '91', publicationStatus: 'PUBLISHED', versionNo: '3' }, levels: [{ levelCode: 'HOSPITAL', levelName: '全院' }, { levelCode: 'OUT_DEPT', levelName: '科室', dimensionSemanticFieldCode: 'DEPT_CODE', memberKeySemanticFieldCode: 'DEPT_CODE', displaySemanticFieldCode: 'DEPT_NAME' }, { levelCode: 'ATTENDING_DOCTOR', levelName: '医生', dimensionSemanticFieldCode: 'DOCTOR_CODE', displaySemanticFieldCode: 'DOCTOR_NAME' }] }
  let metadata = null
  let version = { id: '201', indicatorId: '1', version: 0, resourceVersion: 0, status: 'DRAFT', formula, drillConfig: { drillPaths: [] }, dimensionGrain: [] }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const p = url.pathname
    if (!p.includes('/api/v1/')) return realFetch(input, init)
    const body = init.body ? JSON.parse(init.body) : null
    window.__groupingRequests.push({ path: p, method: init.method || 'GET', body })
    let data = {}
    if (p.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester', displayName: '验收用户' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (p.endsWith('/meta/drill-paths')) data = { records: [{ ...path.path, currentPublishedVersionId: '91' }], total: 1 }
    else if (p.endsWith('/meta/drill-path-versions/91')) data = path
    else if (p.endsWith('/sql-imports') || p.endsWith('/sql-imports/grouping-test')) data = { importId: 'grouping-test', status: metadata ? 'READY_FOR_TRIAL' : 'AWAITING_METADATA', preview, resources: [], metadata }
    else if (p.endsWith('/sql-imports/grouping-test/metadata')) { metadata = body; data = { importId: 'grouping-test', status: 'READY_FOR_TRIAL', preview, resources: [], metadata } }
    else if (p.endsWith('/factor-versions')) data = { records: ['11', '12'].map((id, index) => ({ id, factorVersionId: id, factorId: id, code: index ? 'DENOMINATOR' : 'NUMERATOR', name: index ? '入院总人次' : '转科人次', publicationStatus: 'PUBLISHED', calculationMode: 'TEMPORAL', dsl: { calculationMode: 'TEMPORAL', aggregation: { function: 'COUNT' }, filters: { nodeType: 'PREDICATE', fieldCode: 'IN_DATE', operator: 'BETWEEN', parameter: 'period' }, output: { grain: [] } } })) }
    else if (p.endsWith('/indicators/1')) {
      if (init.method === 'PUT') version.resourceVersion += 1
      data = { id: '1', code: 'RATE', name: '转科比例验收', status: 'DRAFT', resourceVersion: body ? 8 : 7, metadataVersionId: '201', metadataResourceVersion: version.resourceVersion, dataSources: body?.dataSources || [{ sourceCategory: 'HIS' }] }
    }
    else if (p.endsWith('/indicators/1/versions')) data = [version]
    else if (p.endsWith('/indicator-versions/drill-capabilities')) data = { factorVersionIds: ['11', '12'], dimensions: [], dimensionGrainOptions: ['DEPT_CODE', 'DIAGNOSIS'] }
    else if (p.endsWith('/indicator-versions/201/formula') && init.method === 'PUT') { version = { ...version, formula: body.formula, dimensionGrain: body.dimensionGrain, resourceVersion: version.resourceVersion + 1 }; data = version }
    else if (p.endsWith('/indicator-versions/201/formula')) data = { formula: version.formula }
    else if (p.endsWith('/indicator-versions/201')) data = version
    return new Response(JSON.stringify({ code: '0', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

const appPort = 41741, debugPort = 41742
const profile = await mkdtemp(join(tmpdir(), 'idmp-grouping-e2e-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let chrome, cdp
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser acceptance condition timed out') }
async function evaluate(expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
async function click(expression) {
  await evaluate(`(() => { const el = (${expression}); if (!el) throw new Error('Missing click target'); el.scrollIntoView({block:'center',behavior:'instant'}); })()`)
  await delay(300)
  const point = await evaluate(`(() => { const r=(${expression}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  await delay(100)
}
const button = label => `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(label)})`
async function fill(label, text) { await evaluate(`(() => { const item=Array.from(document.querySelectorAll('.el-form-item')).find(el=>el.querySelector('.el-form-item__label')?.textContent.trim()===${JSON.stringify(label)}); const input=item.querySelector('input'); input.value=${JSON.stringify(text)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`) }
async function choose(select, text) {
  await click(select)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.trim()===${JSON.stringify(text)} && el.getBoundingClientRect().height>0)`))
  await click(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.trim()===${JSON.stringify(text)} && el.getBoundingClientRect().height>0)`)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await waitFor(() => evaluate(`!Array.from(document.querySelectorAll('.el-select-dropdown')).some(el=>el.getBoundingClientRect().height>0 && getComputedStyle(el).visibility!=='hidden')`))
}
try {
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } })
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--disable-gpu-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--disable-features=Vulkan', '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } })
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/import/sql` })
  await waitFor(() => evaluate(`!!document.querySelector('.sql-editor textarea')`))
  await evaluate(`(() => { const input=document.querySelector('.sql-editor textarea'); input.value='SELECT COUNT(*) FROM visit'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await waitFor(() => evaluate(`!(${button('解析 SQL')}).disabled`))
  await click(button('解析 SQL'))
  await waitFor(() => evaluate(`!!document.querySelector('.sql-grouping') && document.querySelectorAll('.sql-grouping input[type=checkbox]').length>0`))
  await fill('指标编码', 'RATE_TEST'); await fill('指标名称', '患者入院48小时内转科比例')
  const timeOriginBeforeEnter = await evaluate('performance.timeOrigin')
  for (const name of ['科室', '病种']) {
    await evaluate(`(() => { const input=document.querySelector('.name-entry input'); input.value=${JSON.stringify(name)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    if (name === '科室') {
      await click(`document.querySelector('.name-entry input')`)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await delay(300)
      assert.equal(await evaluate('performance.timeOrigin'), timeOriginBeforeEnter, 'Enter must not submit the form and reload the page')
      assert.equal(await evaluate(`document.querySelectorAll('.name-list .el-tag').length`), 1)
    } else await click(button('新增维度'))
  }
  assert.equal(await evaluate(`document.querySelectorAll('.name-list .el-tag').length`), 2)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.factor-bindings input')).some(input=>input.value)`), false)
  await click(button('确认元数据并进入试算'))
  assert.equal(await evaluate(`window.__groupingRequests.some(r=>r.path.endsWith('/metadata'))`), false)
  await click(`document.querySelector('.sql-grouping input[type=checkbox]').closest('.el-checkbox')`)
  await waitFor(() => evaluate(`document.querySelectorAll('.factor-bindings').length===2`))
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('.factor-bindings').querySelectorAll('.el-form-item__label')).map(el => el.textContent.trim())`), ['科室', '病种', '科室编码', '科室名称', '医生分组字段', '医生名称'])
  const bindings = { 科室: 'b.dept_code', 病种: 'b.diagnosis', DEPT_CODE: 'b.dept_code', DEPT_NAME: 'b.dept_name', DOCTOR_CODE: 'b.doctor_code', DOCTOR_NAME: 'b.doctor_name' }
  for (const index of [0, 1]) {
    for (const [name, field] of Object.entries(bindings)) {
      const physical = index === 1 && name === '科室' ? 't.department_id' : field
      await choose(`Array.from(Array.from(document.querySelectorAll('.factor-bindings'))[${index}].querySelectorAll('.el-form-item')).find(item=>item.dataset.fieldCode===${JSON.stringify(name)}).querySelector('.el-select')`, physical + ' · varchar')
    }
  }
  await mkdir('.tmp/grouping-browser/screenshots', { recursive: true })
  for (const width of [1440, 390]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 })
    await evaluate(`document.querySelector('.sql-grouping').scrollIntoView({block:'start'})`)
    await delay(300)
    const headings = await evaluate(`Array.from(document.querySelectorAll('.sql-grouping h3')).slice(0,2).map(el => { const style = getComputedStyle(el); return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, left: el.getBoundingClientRect().left } })`)
    assert.deepEqual(headings[0], headings[1], 'Combination grain and drill path headings must share the same typography and alignment')
    await writeFile(`.tmp/grouping-browser/screenshots/sql-grouping-${width}.png`, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await click(button('确认元数据并进入试算'))
  await waitFor(() => evaluate(`window.__groupingRequests.some(r=>r.path.endsWith('/metadata'))`))
  const submitted = await evaluate(`window.__groupingRequests.find(r=>r.path.endsWith('/metadata')).body`)
  assert.deepEqual(submitted.dimensionGrain, ['科室', '病种'])
  assert.deepEqual(submitted.drillPaths, [{ pathCode: 'ORGANIZATION', maxLevel: 'ATTENDING_DOCTOR', pathVersionId: '91' }])
  assert.equal(submitted.factors[1].dimensionBindings.DEPT_CODE, 'b.dept_code')
  assert.equal(submitted.factors[0].dimensionBindings.科室, 'b.dept_code')
  assert.equal(submitted.factors[1].dimensionBindings.科室, 't.department_id')
  assert.equal(submitted.factors[0].dimensionBindings.DOCTOR_CODE, 'b.doctor_code')
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/1` })
  await waitFor(() => evaluate(`document.body.innerText.includes('转科比例验收')`))
  await click(`document.getElementById('tab-formula')`)
  await click(button('预检下钻能力'))
  await waitFor(() => evaluate(`document.querySelector('.drill-capability-selection-hint .el-select')`))
  await evaluate(`(() => { let component=document.querySelector('.editor-page').__vueParentComponent; while(component && component.type.__name!=='IndicatorEditor') component=component.parent; window.__indicatorFixture=component.setupState; window.__indicatorFixture.indicatorWorkflow.batchId='previous-trial'; window.__indicatorFixture.indicatorWorkflow.compiled=true; })()`)
  await choose(`document.querySelector('.drill-capability-selection-hint .el-select')`, 'DEPT_CODE')
  await choose(`document.querySelector('.drill-capability-selection-hint .el-select')`, 'DIAGNOSIS')
  assert.equal(await evaluate(`window.__indicatorFixture.indicatorWorkflow.batchId`), '')
  assert.equal(await evaluate(`window.__indicatorFixture.indicatorWorkflow.compiled`), false)
  await click(button('保存公式'))
  await waitFor(() => evaluate(`window.__groupingRequests.some(r=>r.path.endsWith('/formula') && r.method==='PUT')`))
  assert.deepEqual(await evaluate(`window.__groupingRequests.find(r=>r.path.endsWith('/formula') && r.method==='PUT').body.dimensionGrain`), ['DEPT_CODE', 'DIAGNOSIS'])
  await writeFile('.tmp/grouping-browser/screenshots/normal-indicator-grouping.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate(`(() => { window.__indicatorFixture.form.name='转科比例验收'; window.__indicatorFixture.form.definition='转科比例定义'; window.__indicatorFixture.form.significance='质量监测'; window.__indicatorFixture.form.sources=['HIS','病案']; window.__indicatorFixture.form.categoryPath=['医疗质量','质量安全']; window.__indicatorFixture.form.policies=['绩效考核2024版']; })()`)
  assert.equal(await evaluate(`window.__indicatorFixture.indicatorWorkflow.masterResourceVersion`), 7)
  await evaluate(`window.__indicatorFixture.saveIndicatorBasicInfo()`)
  const metadataBody = await evaluate(`window.__groupingRequests.find(r=>r.path.endsWith('/indicators/1') && r.method==='PUT')?.body`)
  assert.ok(metadataBody, 'metadata save request was not submitted')
  assert.equal(metadataBody.resourceVersion, 7)
  assert.equal(metadataBody.metadataResourceVersion, 1)
  assert.deepEqual(metadataBody.dataSources, [{ sourceCategory: 'HIS' }, { sourceCategory: '病案' }])
  assert.equal(await evaluate(`window.__indicatorFixture.indicatorWorkflow.resourceVersion`), 2)
  assert.equal(await evaluate(`window.__indicatorFixture.indicatorWorkflow.masterResourceVersion`), 8)
  console.log('indicator-grouping: PASS SQL metadata selectors, join disambiguation, department-doctor path, ordinary draft save, desktop/mobile screenshots')
} catch (error) {
  if (cdp) console.error(await evaluate(`document.body.innerText`).catch(() => 'Browser unavailable'))
  if (cdp) console.error(await evaluate(`JSON.stringify(window.__groupingRequests)`))
  throw error
} finally {
  cdp?.socket.close()
  chrome?.kill()
  server.kill()
}
