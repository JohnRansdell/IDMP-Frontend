import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { api } from './system-test-client.mjs'

const indicatorId = '102027642461313070'
const versions = await api('GET', `/indicators/${indicatorId}/versions`)
const versionId = String(versions.find(version => version.status === 'PUBLISHED').id)
const detail = await api('GET', `/indicator-versions/${versionId}`)
const numerator = await api('GET', `/factor-versions/${detail.formula.root.left.factorVersionId}`)
const denominator = await api('GET', `/factor-versions/${detail.formula.root.right.factorVersionId}`)
assert.equal(detail.formulaDefinition.status, 'READY')
assert.equal(detail.formulaDefinition.factors.length, 2)
assert.match(detail.formulaDefinition.expression, /÷/)
assert.ok(detail.formulaDefinition.factors.every(factor => detail.formulaDefinition.expression.includes(factor.factorName)))
assert.ok(detail.formulaDefinition.rules.some(rule => rule.includes('百分比')))
assert.ok(detail.formulaDefinition.rules.some(rule => rule.includes('分母为 0')))
const evidence = resolve('.tmp/indicator-formula-definition')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-readable-formula-'))
const debugPort = 41821
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label) { for (let i = 0; i < 300; i++) { if (await predicate()) return; await delay(100) } throw new Error(`${label} timed out`) }
async function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function fixtures() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    const respond = (data, status = 200) => new Response(JSON.stringify({ code: status === 200 ? 'OK' : 'INTERNAL_ERROR', message: status === 200 ? '' : '版本定义读取失败，请稍后重试', data }), { status, headers: { 'Content-Type': 'application/json' } })
    if (path === '/api/v1/indicators/90000') return respond({ id: '90000', code: 'FORMULA_DISPLAY_TEST', name: '公式显示与版本切换测试', status: 'PUBLISHED' })
    if (path === '/api/v1/indicators/90000/versions') return respond([1, 2, 3, 4, 5, 6, 7].map(n => ({ id: String(90000 + n), versionNo: n, status: 'PUBLISHED' })))
    if (path === '/api/v1/indicators/90000/scenarios') return respond({ records: [], total: 0 })
    if (/\/9000[1-7]\/(policy-references)$/.test(path) || /\/by-indicator-version\/9000[1-7]$/.test(path)) return respond([])
    if (path === '/api/v1/factor-versions/9999') return respond(null, 404)
    if (/^\/api\/v1\/indicator-versions\/9000[1-7]$/.test(path)) {
      const version = Number(path.slice(-1))
      if (version === 1 && window.__holdFirst) await new Promise(resolve => { window.__releaseFirst = resolve })
      if (version === 4) return respond(null, 500)
      if (version === 7) return respond({ id:'90007',versionNo:7,status:'PUBLISHED',
        formula:{root:{nodeType:'BINARY',operator:'DIV',left:{nodeType:'BINARY',operator:'SUB',left:{nodeType:'FACTOR_REF',factorVersionId:'11'},right:{nodeType:'FACTOR_REF',factorVersionId:'12'}},right:{nodeType:'FACTOR_REF',factorVersionId:'11'}}},
        formulaDefinition:{status:'READY',expression:'((【总人次】 - 【未转科人次】) ÷ 【总人次】)',displayExpression:'((【总人次】 - 【未转科人次】) ÷ 【总人次】) × 100（单位：%）',rules:[],
          factors:[{factorVersionId:'11',factorName:'总人次'},{factorVersionId:'12',factorName:'未转科人次'}],warnings:[]} })
      if (version === 6) return respond({ id: '90006', versionNo: 6, status: 'PUBLISHED',
        formula: { root: { nodeType: 'FUNCTION', functionCode: 'MAX' } },
        formulaDefinition: { status: 'READY', expression: '最大值(【分子】，【分母】)', displayExpression: '最大值(【分子】，【分母】)', rules: [],
          factors: [{ factorVersionId: '11', factorName: '分子' }, { factorVersionId: '12', factorName: '分母' }], warnings: [] } })
      if (version === 5) return respond({ id: '90005', versionNo: 5, status: 'PUBLISHED',
        formula: { root: { nodeType: 'BINARY', operator: 'DIV', left: { nodeType: 'FACTOR_REF', factorVersionId: '11' }, right: { nodeType: 'FACTOR_REF', factorVersionId: '12' } }, display: { format: 'PERCENT', multiplier: '1' } },
        formulaDefinition: { status: 'READY', expression: '(【分子】 ÷ 【分母】)', displayExpression: '(【分子】 ÷ 【分母】)（单位：%）',
          rules: ['除法 【分子】 ÷ 【分母】：分母为 0 时返回 0', '展示值保留 2 位小数，四舍五入'],
          factors: [{ factorVersionId: '11', factorName: '分子' }, { factorVersionId: '12', factorName: '分母' }], warnings: [] } })
      return respond({ id: String(90000 + version), versionNo: version, status: 'PUBLISHED', formula: { root: { nodeType: 'CONST', value: String(version) } },
        formulaDefinition: version === 3 ? { status: 'UNAVAILABLE', warnings: ['该版本尚未配置指标公式'] } : {
          status: 'READY', expression: `版本${version}业务公式`, displayExpression: `版本${version}业务公式`, rules: ['保留 2 位小数'], factors: [], warnings: []
        } })
    }
    return realFetch(input, options)
  }
}
async function screenshot(name) { await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixtures.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:5173/indicator/view/${indicatorId}?versionId=${versionId}` })
  await waitFor(() => evaluate(`!!document.querySelector('.formula-expression')`), 'Real formula')
  assert.equal(await evaluate(`document.querySelector('.formula-expression').getAttribute('aria-label')`), detail.formulaDefinition.displayExpression)
  const nameFor = node => detail.formulaDefinition.factors.find(factor => String(factor.factorVersionId) === String(node.factorVersionId)).factorName
  assert.equal(await evaluate(`document.querySelector('.formula-numerator').textContent`), nameFor(detail.formula.root.left))
  assert.equal(await evaluate(`document.querySelector('.formula-denominator').textContent`), nameFor(detail.formula.root.right))
  assert.equal(await evaluate(`document.querySelector('.formula-suffix').textContent`), detail.formulaDefinition.displayExpression.slice(detail.formulaDefinition.expression.length).trim())
  assert.equal(await evaluate(`document.querySelector('.formula-technical').open`), false)
  assert.match(await evaluate(`document.querySelector('.formula-notes').textContent`), /分母为 0.*保留 2 位小数/)
  assert.equal(await evaluate(`!!document.querySelector('.formula-factors,.formula-rules')`), false)
  const numeratorPath = `/factor/edit/${numerator.factorId}`
  const denominatorPath = `/factor/edit/${denominator.factorId}`
  assert.equal(await evaluate(`document.querySelectorAll('.formula-factor-link').length`), 2)
  const factorStyle = await evaluate(`(()=>{const button=document.querySelector('.formula-factor-link'),style=getComputedStyle(button);return {color:style.color,parentColor:getComputedStyle(button.parentElement).color,border:style.borderBottomWidth,decoration:style.textDecorationLine}})()`)
  assert.equal(factorStyle.color, factorStyle.parentColor)
  assert.equal(factorStyle.border, '0px')
  assert.equal(factorStyle.decoration, 'none')
  assert.doesNotMatch(await evaluate(`document.querySelector('.formula-expression').textContent`), /nodeType|factorVersionId/)
  await screenshot('real-desktop.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await evaluate(`document.querySelector('.formula-definition').scrollIntoView({block:'start'})`)
  const size = await evaluate(`(()=>{const el=document.querySelector('.formula-expression');const r=el.getBoundingClientRect();return {client:el.clientWidth,scroll:el.scrollWidth,left:r.left,right:r.right}})()`)
  assert.ok(size.scroll <= size.client + 1 && size.right <= 391 && size.left >= 0, JSON.stringify(size))
  await screenshot('real-mobile.png')
  await evaluate(`document.querySelector('.formula-technical summary').click()`)
  assert.equal(await evaluate(`document.querySelector('.formula-technical').open`), true)
  assert.equal(await evaluate(`!!document.querySelector('.formula-factors,.formula-rules')`), false)
  assert.equal(await evaluate(`document.querySelector('.formula-technical .json-code-preview').textContent`), JSON.stringify(detail.formula, null, 2))
  const tokenColors = await evaluate(`(()=>{const el=document.querySelector('.formula-technical');return {key:getComputedStyle(el.querySelector('.json-token--key')).color,string:getComputedStyle(el.querySelector('.json-token--string')).color,plain:getComputedStyle(el.querySelector('code')).color}})()`)
  assert.notEqual(tokenColors.key, tokenColors.string)
  assert.notEqual(tokenColors.key, tokenColors.plain)
  await evaluate(`document.querySelector('.formula-technical').scrollIntoView({block:'start'})`)
  const jsonBounds = await evaluate(`document.querySelector('.formula-technical .json-code-preview').getBoundingClientRect().toJSON()`)
  assert.ok(jsonBounds.left >= 0 && jsonBounds.right <= 391, JSON.stringify(jsonBounds))
  await screenshot('formula-json-mobile.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await evaluate(`document.querySelector('.formula-technical').scrollIntoView({block:'start'})`)
  await screenshot('formula-json-desktop.png')
  await evaluate(`document.querySelector('.formula-numerator button').click()`)
  await waitFor(() => evaluate(`location.pathname===${JSON.stringify(numeratorPath)} && document.querySelector('.factor-editor .saved-summary')?.textContent.includes(${JSON.stringify(String(numerator.id))})`), 'Numerator editor navigation')
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('factorVersionId')`), String(numerator.id))
  assert.ok(await evaluate(`document.querySelector('.factor-editor h1').textContent.includes(${JSON.stringify(nameFor(detail.formula.root.left))})`))
  await screenshot('factor-editor.png')
  await evaluate(`history.back()`)
  await waitFor(() => evaluate(`!!document.querySelector('.formula-denominator button')`), 'Return to indicator')
  await evaluate(`document.querySelector('.formula-denominator button').click()`)
  await waitFor(() => evaluate(`location.pathname===${JSON.stringify(denominatorPath)} && document.querySelector('.factor-editor .saved-summary')?.textContent.includes(${JSON.stringify(String(denominator.id))})`), 'Denominator editor navigation')
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('factorVersionId')`), String(denominator.id))
  assert.ok(await evaluate(`document.querySelector('.factor-editor h1').textContent.includes(${JSON.stringify(nameFor(detail.formula.root.right))})`))
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/indicator/view/90000?versionId=90002' })
  await waitFor(() => evaluate(`document.querySelector('.formula-expression')?.textContent==='版本2业务公式'`), 'Explicit version selection')
  assert.equal(await evaluate(`!!document.querySelector('.formula-fraction')`), false)
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__formulaPage.selectVersion({id:'90007',versionNo:7,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`document.querySelector('.formula-numerator').textContent`),'总人次 - 未转科人次')
  assert.equal(await evaluate(`document.querySelector('.formula-denominator').textContent`),'总人次')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.formula-numerator button'),b=>b.textContent)`),['总人次','未转科人次'])
  assert.equal(await evaluate(`document.querySelectorAll('.formula-factor-link').length`),3)
  assert.ok(await evaluate(`document.querySelector('.formula-numerator').getBoundingClientRect().bottom<=document.querySelector('.formula-denominator').getBoundingClientRect().top`))
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__formulaPage.selectVersion({id:'90002',versionNo:2,status:'PUBLISHED'})`)
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__formulaPage.openFactorEditor('9999')`)
  assert.equal(await evaluate(`location.pathname`), '/indicator/view/90000')
  assert.equal(await evaluate(`window.__formulaPage.factorNavigationPending`), '')
  assert.ok(await evaluate(`!!document.querySelector('.el-message--error')`))
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__formulaPage.selectVersion({id:'90006',versionNo:6,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`document.querySelector('.formula-expression').textContent`), '最大值(【分子】，【分母】)')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.formula-factor-link'),button=>button.textContent)`), ['【分子】', '【分母】'])
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__formulaPage.selectVersion({id:'90005',versionNo:5,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`document.querySelector('.formula-suffix').textContent`), '（单位：%）')
  assert.match(await evaluate(`document.querySelector('.formula-notes').textContent`), /分母为 0 时返回 0/)
  await evaluate(`document.querySelector('.formula-technical summary').click();window.__formulaPage.selectVersion({id:'90002',versionNo:2,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`document.querySelector('.formula-technical').open`), false)
  await evaluate(`window.__formulaPage=document.querySelector('.indicator-detail-page').__vueParentComponent.setupState;window.__holdFirst=true;void window.__formulaPage.selectVersion({id:'90001',versionNo:1,status:'PUBLISHED'})`)
  await waitFor(() => evaluate(`!!window.__releaseFirst`), 'Held version request')
  await evaluate(`window.__formulaPage.selectVersion({id:'90002',versionNo:2,status:'PUBLISHED'})`)
  await evaluate(`window.__releaseFirst()`)
  await delay(300)
  assert.equal(await evaluate(`document.querySelector('.formula-expression').textContent`), '版本2业务公式')
  await evaluate(`window.__formulaPage.selectVersion({id:'90003',versionNo:3,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`!!document.querySelector('.formula-expression')`), false)
  assert.match(await evaluate(`document.querySelector('.formula-definition').textContent`), /尚未配置指标公式/)
  await evaluate(`window.__formulaPage.selectVersion({id:'90004',versionNo:4,status:'PUBLISHED'})`)
  assert.equal(await evaluate(`!!document.querySelector('.formula-expression')`), false)
  assert.match(await evaluate(`document.querySelector('.formula-definition').textContent`), /读取失败/)
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, indicatorId, versionId, formulaDefinition: detail.formulaDefinition, size, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, indicatorId, versionId, size, evidence }))
} catch (error) { if (socket?.readyState === WebSocket.OPEN) await screenshot('failure.png'); throw error }
finally { socket?.close(); chrome.kill() }
