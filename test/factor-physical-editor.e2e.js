import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

class Cdp {
  sequence = 0
  pending = new Map()
  errors = []
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject) })
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data)
      if (data.method === 'Runtime.exceptionThrown') this.errors.push(data.params.exceptionDetails)
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    return new Promise((resolve, reject) => { const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
}

function mockBackend() {
  localStorage.setItem('idmp_access_token', 'factor-physical-fixture')
  const realFetch = window.fetch.bind(window)
  window.__factorRequests = []
  const mapped = table => table === 'visit' ? [
    { id: '10', code: 'ADMISSION_TIME', name: '入院时间', sourceFieldName: 'in_date', dataType: 'STRING' },
    { id: '11', code: 'DEPARTMENT', name: '科室', sourceFieldName: 'dept_code', dataType: 'STRING' },
    { id: '12', code: 'COST', name: '费用', sourceFieldName: 'fee', dataType: 'STRING' }
  ] : [
    { id: '20', code: 'VISIT_KEY', name: '住院号', sourceFieldName: 'visit_id', dataType: 'STRING' },
    { id: '21', code: 'DIAGNOSIS', name: '病种', sourceFieldName: 'diagnosis', dataType: 'STRING' },
    { id: '22', code: 'DIAGNOSIS_TIME', name: '诊断时间', sourceFieldName: 'diagnosis_time', dataType: 'DATETIME' }
  ]
  const source = table => mapped(table).map(field => ({ columnName: field.sourceFieldName, columnType: ['10', '22'].includes(field.id) ? 'datetime' : field.id === '12' ? 'decimal(12,2)' : 'varchar(40)', comment: field.name }))
  const relation = { id: '100', leftPhysicalTableBindingId: '1', rightPhysicalTableBindingId: '2', leftDomainId: '9', rightDomainId: '9', leftDomainCode: 'VISIT', rightDomainCode: 'VISIT', leftTableName: 'visit', rightTableName: 'diagnosis', joinType: 'LEFT', cardinality: 'MANY_TO_ONE' }
  let dsl = { primaryDomain: { domainCode: 'VISIT', tableName: 'visit', sourceAlias: 'base' }, calculationMode: 'TEMPORAL', aggregation: { function: 'COUNT_DISTINCT', fieldRef: { sourceAlias: 'join1', fieldCode: 'visit_id' } }, joins: [{ relationId: '100', fromAlias: 'base', sourceAlias: 'join1' }], groupBy: ['dept_code', { sourceAlias: 'join1', fieldCode: 'diagnosis' }], filters: { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'in_date', operator: 'BETWEEN', parameter: 'period' }] }, missingRowPolicy: 'ZERO' }
  const legacyDsl = JSON.parse(JSON.stringify(dsl))
  const initialDsl = JSON.parse(JSON.stringify(dsl))
  window.__restoreOriginalDsl = () => { dsl = initialDsl; window.__factorRequests = [] }
  legacyDsl.primaryDomain = { domainCode: 'VISIT', semanticTableCode: 'visit', sourceAlias: 'base' }
  legacyDsl.aggregation.fieldRef.fieldCode = 'VISIT_KEY'
  legacyDsl.groupBy = ['DEPARTMENT', { sourceAlias: 'join1', fieldCode: 'DIAGNOSIS' }]
  legacyDsl.filters.children[0].fieldCode = 'ADMISSION_TIME'
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const p = url.pathname.replace('/api/v1', '')
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    const body = init.body ? JSON.parse(init.body) : null
    window.__factorRequests.push({ path: p, query: url.search, method: init.method || 'GET', body })
    let data = {}
    if (p === '/auth/me') data = { user: { id: '1', username: 'tester', displayName: '验收用户' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] }
    else if (p === '/meta/data-domains') data = [{ id: '9', code: 'VISIT', name: '住院数据域', status: 'PUBLISHED' }]
    else if (p.endsWith('/physical-tables')) data = [{ id: '1', domainId: '9', tableName: 'visit', tableComment: '住院记录', defaultTimeSemanticFieldCode: 'ADMISSION_TIME', status: 'PUBLISHED' }, { id: '2', domainId: '9', tableName: 'diagnosis', tableComment: '诊断记录', status: 'PUBLISHED' }]
    else if (p.includes('/physical-tables/') && p.endsWith('/semantic-fields')) data = mapped(p.split('/').at(-2))
    else if (p.startsWith('/meta/source-tables/') && p.endsWith('/fields')) data = source(p.split('/').at(-2))
    else if (p === '/meta/physical-table-relations') data = [relation]
    else if (p.includes('/value-set')) data = p.includes('/11/') ? { bound: true, valueSet: { id: '90' }, publishedVersion: { id: '91', matchMode: 'EXACT', items: [{ code: 'D1', label: '内科' }] } } : { bound: false }
    else if (p === '/factors' && init.method === 'POST') { dsl = body.dsl; data = { id: '1', draftVersionId: '3', status: 'DRAFT', resourceVersion: 1 } }
    else if (p === '/factors/1') { if (body) dsl = body.dsl; data = { id: '1', code: 'FACTOR_TEST', name: '物理字段因子', draftVersionId: '3', status: 'DRAFT', resourceVersion: 1 } }
    else if (p === '/factors/1/versions') data = [{ id: '3', versionNo: 1, publicationStatus: 'DRAFT' }]
    else if (p === '/factor-versions/3') data = { id: '3', dsl, publicationStatus: 'DRAFT' }
    else if (p === '/factors/2' || p === '/factors/3') data = { id: p.split('/').at(-1), code: 'EXISTING', name: '已有因子', draftVersionId: p.endsWith('/2') ? '4' : '5', status: 'DRAFT' }
    else if (p === '/factors/2/versions' || p === '/factors/3/versions') data = [{ id: p.includes('/2/') ? '4' : '5', publicationStatus: 'DRAFT' }]
    else if (p === '/factor-versions/4') data = { id: '4', dsl: legacyDsl, publicationStatus: 'DRAFT' }
    else if (p === '/factor-versions/5') data = { id: '5', dsl: { definitionType: 'SQL', sqlTemplate: 'SELECT COUNT(*) FROM visit', calculationMode: 'STATIC' }, publicationStatus: 'DRAFT' }
    return new Response(JSON.stringify({ code: '0', data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

const appPort = Number(process.env.FACTOR_EDITOR_PORT || 41771), debugPort = 41772
const profile = await mkdtemp(join(tmpdir(), 'idmp-factor-physical-e2e-'))
const server = process.env.FACTOR_EDITOR_PORT ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let chrome, cdp
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser acceptance condition timed out') }
async function evaluate(expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
async function click(expression) {
  await evaluate(`(${expression}).scrollIntoView({block:'center',behavior:'instant'})`)
  await delay(150)
  const point = await evaluate(`(() => { const r=(${expression}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2} })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
const button = label => `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(label)})`
async function choose(selector, text) {
  await click(selector)
  const option = `Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.textContent.includes(${JSON.stringify(text)})&&el.getBoundingClientRect().height>0)`
  await waitFor(() => evaluate(`!!(${option})`))
  await click(option)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await delay(200)
}
async function fixture() {
  await evaluate(`(() => {let component=document.querySelector('.factor-editor').__vueParentComponent;while(component&&component.type.__name!=='FactorEditor')component=component.parent;window.__factorFixture=component.setupState})()`)
}
try {
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } })
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item=>item.type==='page'); return !!target } catch { return false } })
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/new` })
  await waitFor(()=>evaluate(`!!document.querySelector('.factor-editor')`)); await fixture()
  await choose(`document.querySelector('.form-block .el-select')`, '住院数据域')
  await choose(`document.querySelectorAll('.form-block .el-select')[1]`, '住院记录')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===3`))
  assert.match(await evaluate(`document.querySelector('.time-binding').textContent`), /入院时间（in_date）/)
  assert.deepEqual(await evaluate(`window.__factorFixture.fields.map(f=>[f.code,f.kind])`), [['in_date','DATETIME'],['dept_code','VALUE_SET'],['fee','NUMBER']])
  await evaluate(`window.__factorFixture.basicForm.name='单表测试'`)
  await click(button('保存因子定义'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors'&&r.method==='POST')`))
  const created = await evaluate(`window.__factorRequests.find(r=>r.path==='/factors'&&r.method==='POST').body.dsl`)
  assert.deepEqual(created.primaryDomain, { domainCode: 'VISIT', tableName: 'visit' })
  assert.equal(created.periodColumn, 'in_date')
  assert.deepEqual(created.filters, { nodeType: 'TRUE' })
  await waitFor(()=>evaluate(`location.pathname==='/factor/edit/1'&&document.querySelector('.page-toolbar')?.textContent.includes('保存修改')`))
  await delay(300); await fixture()
  await click(button('添加关联表'))
  await choose(`document.querySelector('.join-row .el-select')`, 'diagnosis（LEFT')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  await choose(`document.querySelector('.time-binding .el-select')`, '诊断时间（diagnosis_time）')
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'join1.diagnosis_time')
  await click(`Array.from(document.querySelectorAll('.measure-card')).find(el=>el.textContent.includes('去重计数'))`)
  await choose(`document.querySelector('.measure-field .el-select')`, '住院号（visit_id）')
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  await evaluate(`window.__factorFixture.filters.children.push({nodeType:'PREDICATE',fieldCode:'dept_code',operator:'IN_VALUE_SET',itemCodes:['D1']});window.__factorFixture.scopeMode='FILTERED'`)
  await click(button('保存修改'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors/1'&&r.method==='PATCH')`))
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl.filters.children[0].valueSetVersionId`), '91')
  assert.equal(await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl.periodColumn`), 'join1.diagnosis_time')
  // Reload an existing temporal join draft, independently of the created fixture.
  await evaluate(`window.__restoreOriginalDsl()`)
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/1` })
  await waitFor(()=>evaluate(`document.querySelector('.join-target strong')?.textContent==='diagnosis'`)); await fixture()
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  assert.deepEqual(await evaluate(`Array.from(window.__factorFixture.dslForm.groupBy)`), ['dept_code','join1.diagnosis'])
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'in_date')
  assert.equal(await evaluate(`window.__factorFixture.scopeMode`), 'ALL')
  assert.match(await evaluate(`document.body.innerText`), /diagnosis（LEFT · MANY_TO_ONE）/)
  await choose(`document.querySelector('.join-row .el-select')`, 'diagnosis（LEFT')
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  await click(button('保存修改'))
  await waitFor(()=>evaluate(`window.__factorRequests.some(r=>r.path==='/factors/1'&&r.method==='PATCH')`))
  const updated = await evaluate(`window.__factorRequests.find(r=>r.path==='/factors/1'&&r.method==='PATCH').body.dsl`)
  assert.deepEqual(updated.aggregation.fieldRef, { sourceAlias: 'join1', fieldCode: 'visit_id' })
  assert.deepEqual(updated.joins, [{ relationId: '100', fromAlias: 'base', sourceAlias: 'join1' }])
  assert.equal(updated.missingRowPolicy, 'ZERO')
  assert.equal(updated.periodColumn, 'in_date')
  assert.deepEqual(updated.filters, { nodeType: 'TRUE' })
  assert.deepEqual(updated.groupBy, ['dept_code', { sourceAlias: 'join1', fieldCode: 'diagnosis' }])
  assert.equal(await evaluate(`window.__factorRequests.some(r=>r.path.includes('semantic-tables')||r.path.includes('semantic-table-relations'))`), false)
  await mkdir('.tmp/factor-physical-browser', { recursive: true })
  await evaluate(`window.scrollTo(0,0)`)
  await writeFile('.tmp/factor-physical-browser/desktop.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await delay(300)
  await writeFile('.tmp/factor-physical-browser/mobile.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/2` })
  await waitFor(()=>evaluate(`document.querySelector('.join-target strong')?.textContent==='diagnosis'`)); await fixture()
  await waitFor(()=>evaluate(`window.__factorFixture.fields.length===6`))
  assert.equal(await evaluate(`window.__factorFixture.dslForm.fieldCode`), 'join1.visit_id')
  assert.deepEqual(await evaluate(`Array.from(window.__factorFixture.dslForm.groupBy)`), ['dept_code','join1.diagnosis'])
  assert.equal(await evaluate(`window.__factorFixture.dslForm.periodColumn`), 'in_date')
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/factor/edit/3` })
  await waitFor(()=>evaluate(`document.querySelector('.editor-alert')?.textContent.includes('该因子使用 SQL')`))
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()==='保存修改').disabled`), true)
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/indicator/edit/new` })
  await waitFor(()=>evaluate(`!!document.querySelector('.editor-page')`))
  await evaluate(`(() => {let c=document.querySelector('.editor-page').__vueParentComponent;while(c&&c.type.__name!=='IndicatorEditor')c=c.parent;window.__indicator=c.setupState;window.__indicator.numeratorFactors=[{code:'SQL_FACTOR',name:'SQL 因子',versionId:'10',dsl:{definitionType:'SQL',periodColumn:'b.in_date'}}];window.__indicator.indicatorWorkflow.versionId='11'})()`)
  assert.equal(await evaluate(`window.__indicator.indicatorCalculationMode`), 'TEMPORAL')
  assert.equal(await evaluate(`window.__indicator.canPublishIndicatorVersion`), true)
  assert.equal(await evaluate(`window.__indicator.publishPanelDescription.includes('缺少统计周期')`), false)
  assert.deepEqual(cdp.errors, [])
  console.log('PASS: physical table creation, field types, value sets, JOIN hydration/save, desktop/mobile screenshots; no legacy table APIs')
} catch (error) {
  if (cdp) console.error(await evaluate(`document.body.innerText`).catch(()=>''))
  throw error
} finally { cdp?.socket.close(); chrome?.kill(); server?.kill() }
