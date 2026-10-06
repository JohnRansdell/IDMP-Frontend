import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.MAPPING_APP_PORT || 5173), debugPort = 41826
const profile = await mkdtemp(join(tmpdir(), 'idmp-mapping-alignment-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) }
  throw new Error('Browser condition timed out')
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'mapping-alignment-fixture')
  const realFetch = fetch.bind(window)
  window.__mappingRequests = []
  window.__policyRequests = []
  window.__policyWrites = []
  const policy = { id: '102027642462358147', name: '医疗质量政策', code: 'QUALITY_POLICY' }
  const policyVersion = { id: '102027642462358159', policyFileId: policy.id, policyFileName: policy.name, policyFileCode: policy.code, versionNo: '2026' }
  window.__mappingDocument = document
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    if (url.pathname.endsWith('/mappings')) window.__mappingRequests.push(url.href)
    let data = { records: [], total: 0 }
    if (url.pathname.endsWith('/meta/policy-files')) {
      window.__policyRequests.push(url.href)
      const matches = (!url.searchParams.get('name') || policy.name.includes(url.searchParams.get('name')))
        && (!url.searchParams.get('code') || policy.code.includes(url.searchParams.get('code')))
      data = { records: matches ? [policy] : [], total: matches ? 1 : 0 }
    }
    if (url.pathname.endsWith('/meta/policy-file-versions/published')) data = { records: [policyVersion], total: 1 }
    if (url.pathname.endsWith('/mappings/policy-picker-test')) data = {
      mapping: { id: 'policy-picker-test', code: 'POLICY_MAPPING', name: '政策选择验收', reviewStatus: 'DRAFT',
        publicationStatus: 'DRAFT', sourceIndicator: { indicatorVersionId: '101', indicatorName: '源指标' },
        targetIndicator: { indicatorVersionId: '102', indicatorName: '目标指标' } },
      version: { versionNo: 1, difference: {}, evidence: {} }
    }
    if (url.pathname.endsWith('/policy-references')) {
      if (init.method === 'POST') window.__policyWrites.push({ path: url.pathname, body: JSON.parse(init.body) })
      data = window.__policyWrites.filter(item => item.path === url.pathname).map(item => ({ ...item.body, id: '999', policyFileName: policy.name }))
    }
    if (url.pathname.endsWith('/auth/me')) data = { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    if (url.pathname.endsWith('/unread-count')) data = { unreadCount: 0 }
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/mapping` })
  await waitFor(() => evaluate(`!!document.querySelector('.mapping-filter .el-select') && window.__mappingRequests.length > 0`))
  await mkdir('.tmp/mapping-alignment', { recursive: true })
  for (const width of [1440, 1280, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width < 500, deviceScaleFactor: 1 })
    await delay(200)
    const fields = await evaluate(`Array.from(document.querySelectorAll('.mapping-filter .el-form-item')).map(el=>{ const item=el.getBoundingClientRect(),control=el.querySelector('.el-select,.el-input').getBoundingClientRect(),label=el.querySelector('.el-form-item__label').getBoundingClientRect(); return {label:el.querySelector('.el-form-item__label').textContent,itemX:item.x,itemRight:item.right,x:control.x,y:control.y,width:control.width,height:control.height,labelWidth:label.width} })`)
    assert.equal(fields.length, 5)
    for (const field of fields) {
      assert.equal(field.labelWidth, 96)
      assert.ok(Math.abs(field.x - field.itemX - 96) < 1, JSON.stringify(field))
      assert.ok(Math.abs(field.itemRight - field.x - field.width) < 1, JSON.stringify(field))
      assert.ok(field.width > 100, JSON.stringify(field))
      assert.ok(Math.abs(field.width - fields[0].width) < 1)
      assert.equal(field.height, fields[0].height)
    }
    const group = fields.find(item => item.label === '语义组'), status = fields.find(item => item.label === '审核状态')
    if (width === 1440) assert.ok(Math.abs(group.x - status.x) < 1)
    const actions = await evaluate(`(() => {const form=document.querySelector('.mapping-form').getBoundingClientRect(),category=document.querySelector('.mapping-type-shortcuts > span').getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('.mapping-filter__actions button')).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {formRight:form.right,categoryCenter:category.y+category.height/2,buttons}})()`)
    assert.equal(actions.buttons.length, 2)
    assert.ok(Math.abs(actions.buttons.at(-1).right - actions.formRight) < 1, JSON.stringify(actions))
    assert.ok(actions.buttons[0].y >= Math.max(...fields.map(field=>field.y+field.height))+14)
    if (width >= 1280) assert.ok(Math.abs(actions.categoryCenter-(actions.buttons[0].y+actions.buttons[0].bottom)/2)<1)
    console.log(`Mapping filter layout passed at ${width}px`)
    await writeFile(`.tmp/mapping-alignment/${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  assert.equal(await evaluate(`document.querySelector('.mapping-filter').innerText.includes('政策文件 ID')`), false)
  await evaluate(`document.querySelector('.policy-file-select .el-select__wrapper').click()`)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.trim()==='医疗质量政策 · QUALITY_POLICY')`))
  await evaluate(`(() => {let component=document.querySelector('.indicator-mapping').__vueParentComponent;while(component&&component.type.__name!=='IndicatorMapping')component=component.parent;window.__mappingState=component.setupState;window.__mappingState.searchPolicyFiles('QUALITY_POLICY')})()`)
  await waitFor(() => evaluate(`!window.__mappingState.policyFilesLoading && window.__policyRequests.some(url=>new URL(url).searchParams.get('code')==='QUALITY_POLICY')`))
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.trim()==='医疗质量政策 · QUALITY_POLICY').click()`)
  assert.equal(await evaluate(`window.__mappingState.filters.policyFileId`), '102027642462358147')
  await evaluate(`window.__mappingState.loadPolicyFiles('找不到的政策')`)
  assert.equal(await evaluate(`document.querySelector('.policy-file-select').innerText.includes('医疗质量政策')`), true)
  await evaluate(`document.querySelector('.mapping-filter__actions button[type="submit"]').click()`)
  await waitFor(() => evaluate(`window.__mappingRequests.some(url=>new URL(url).searchParams.get('policyFileId')==='102027642462358147')`))
  await evaluate(`document.querySelectorAll('.mapping-filter__actions button')[1].click()`)
  await waitFor(() => evaluate(`window.__mappingState.filters.policyFileId===''`))
  assert.equal(await evaluate(`window.__mappingDocument===document && location.pathname==='/mapping'`), true)
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/mapping/policy-picker-test` })
  await waitFor(() => evaluate(`!!document.querySelector('.policy-panel')`))
  await evaluate(`document.querySelector('#tab-policy').click();Array.from(document.querySelectorAll('.policy-panel button')).find(b=>b.textContent.trim()==='添加引用').click()`)
  await waitFor(() => evaluate(`!!document.querySelector('.policy-form .el-select')`))
  assert.equal(await evaluate(`document.querySelector('.policy-form').innerText.includes('版本 ID')`), false)
  await evaluate(`document.querySelector('.policy-form .el-select__wrapper').click()`)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.trim()==='医疗质量政策 · 版本 2026')`))
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.trim()==='医疗质量政策 · 版本 2026').click()`)
  await evaluate(`Array.from(document.querySelectorAll('.policy-form button')).find(b=>b.textContent.trim()==='保存引用').click()`)
  await waitFor(() => evaluate(`window.__policyWrites.length===1 && !document.querySelector('.policy-form')`))
  assert.deepEqual(await evaluate(`window.__policyWrites[0]`), { path: '/api/v1/mappings/indicator-versions/101/policy-references', body: { policyFileVersionId: '102027642462358159', citationLocation: '', citationText: '', relationRole: 'SOURCE' } })
  assert.ok((await evaluate(`document.querySelector('.policy-table').innerText`)).includes('医疗质量政策'))
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width < 500, deviceScaleFactor: 1 })
    await delay(150)
    await writeFile(`.tmp/mapping-alignment/policy-detail-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  }
  assert.deepEqual(errors, [])
  console.log('PASS: mapping filter layout; policy name/code selection; selected label preserved; file ID query/reset; published-version reference selection and exact payload. APIs mocked; no server writes.')
} finally { socket?.close(); chrome.kill() }
