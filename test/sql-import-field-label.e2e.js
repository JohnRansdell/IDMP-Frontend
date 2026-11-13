import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = Number(process.env.SQL_IMPORT_PORT || 5173)
const debugPort = 41812
const profile = await mkdtemp(join(tmpdir(), 'idmp-sql-fields-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) } throw new Error('Browser condition timed out') }
async function send(method, params = {}) {
  return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function mockBackend() {
  localStorage.setItem('idmp_access_token', 'sql-fields-fixture')
  window.__sqlQueryRequests = []
  const realFetch = fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.includes('/api/v1/')) return realFetch(input, init)
    if (/\/factor-versions\/[^/]+\/query$/.test(url.pathname)) window.__sqlQueryRequests.push({ path: url.pathname, body: JSON.parse(init.body) })
    const data = url.pathname.endsWith('/auth/me') ? { user: { id: '1', username: 'tester' }, roles: ['SYSTEM_ADMIN'], permissions: [], menus: [] } : []
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/indicator/import/sql` })
  await waitFor(() => evaluate(`!!document.querySelector('.sql-import-page')`))
  const time = { physicalTable: 'vmq_basicinformationzy', sqlAlias: 'b', columnName: 'In_Date', fieldReference: 'b.In_Date', columnType: 'datetime', comment: '入院时间', recommended: true }
  const department = { physicalTable: 'vmq_basicinformationzy', sqlAlias: 'b', columnName: 'out_dept_code', fieldReference: 'b.out_dept_code', columnType: 'varchar', comment: '出院科室编码' }
  const task = { importId: '100', status: 'AWAITING_METADATA', scope: 'FACTORS_AND_INDICATOR', preview: { valid: true, tables: [], factors: [{ key: 'total', suggestedCode: 'TOTAL', suggestedName: '入院人次', groupingSupported: true, timeFieldOptions: [time], dimensionFieldOptions: [department], dsl: { definitionType: 'SQL', calculationMode: 'TEMPORAL', periodColumn: 'b.In_Date' } }], formula: { template: { root: { nodeType: 'FACTOR_REF', factorKey: 'total' } } } } }
  await evaluate(`(() => { let c=document.querySelector('.sql-import-page').__vueParentComponent; while(c&&c.type.__name!=='SqlIndicatorImport')c=c.parent;window.__sqlFields=c.setupState;window.__sqlFields.accept(${JSON.stringify(task)});window.__sqlFields.factorMetadata[0].calculationMode='TEMPORAL';window.__sqlFields.indicator.dimensionGrain=['科室'];window.__sqlFields.factorMetadata[0].dimensionBindings={'科室':'b.out_dept_code'} })()`)
  await waitFor(() => evaluate(`!!document.querySelector('.sql-grouping .factor-bindings .el-select')`))
  await mkdir('.tmp/sql-import-field-labels', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1100, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await delay(300)
    const labels = await evaluate(`({time:document.querySelector('.time-field-control .el-select').textContent,dimension:document.querySelector('.sql-grouping .factor-bindings .el-select').textContent,timeValue:window.__sqlFields.factorMetadata[0].timeField,dimensionValue:window.__sqlFields.factorMetadata[0].dimensionBindings['科室']})`)
    assert.match(labels.time, /vmq_basicinformationzy\.In_Date/)
    assert.match(labels.dimension, /vmq_basicinformationzy\.out_dept_code/)
    assert.doesNotMatch(labels.time, /\bb\.In_Date/)
    assert.doesNotMatch(labels.dimension, /\bb\.out_dept_code/)
    assert.equal(labels.timeValue, 'b.In_Date')
    assert.equal(labels.dimensionValue, 'b.out_dept_code')
    await evaluate(`document.querySelector('.time-field-control').scrollIntoView({block:'center',behavior:'instant'})`)
    await writeFile(`.tmp/sql-import-field-labels/${viewport.mobile ? 'mobile' : 'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  const chineseTask = { ...task, importId: '101', preview: { ...task.preview,
    factors: ['四级手术患者', '全部手术患者'].map((cte, index) => ({
      ...task.preview.factors[0], key: `stat___________${index || ''}`,
      suggestedName: `${cte}.患者数`, outputAlias: `stat___________${index || ''}`,
      dsl: { ...task.preview.factors[0].dsl, importSource: { type: 'SQL', cte, column: '患者数' } },
    })), formula: { template: { root: { nodeType: 'FACTOR_REF', factorKey: 'stat___________' } } },
  } }
  await evaluate(`(() => { window.__sqlFields.factorMetadata=[]; window.__sqlFields.accept(${JSON.stringify(chineseTask)}) })()`)
  await waitFor(() => evaluate(`document.querySelector('.factor-name')?.textContent==='四级手术患者.患者数'`))
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width === 390, deviceScaleFactor: 1 })
    const names = await evaluate(`({titles:[...document.querySelectorAll('.factor-name')].map(x=>x.textContent),sources:[...document.querySelectorAll('.factor > small')].map(x=>x.textContent),tabs:[...document.querySelectorAll('.el-tabs__item')].map(x=>x.textContent)})`)
    assert.deepEqual(names.titles, ['四级手术患者.患者数', '全部手术患者.患者数'])
    assert.deepEqual(names.sources, ['CTE 输出：四级手术患者.患者数', 'CTE 输出：全部手术患者.患者数'])
    assert.deepEqual(names.tabs, [...names.titles, '指标公式'])
    await evaluate(`document.querySelector('.factor-name').scrollIntoView({block:'center',behavior:'instant'})`)
    await writeFile(`.tmp/sql-import-field-labels/factor-names-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`(() => { const input=document.querySelector('.factor-fields input'); input.value='四级手术患者人数'; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await waitFor(() => evaluate(`document.querySelector('.factor-name')?.textContent==='四级手术患者人数'`))
  const renamed = await evaluate(`({tab:document.querySelector('.el-tabs__item').textContent,key:window.__sqlFields.metadataPayload().factors[0].key,ref:window.__sqlFields.preview.formula.template.root.factorKey})`)
  assert.equal(renamed.tab, '四级手术患者人数')
  assert.equal(renamed.key, 'stat___________')
  assert.equal(renamed.ref, 'stat___________')
  const published = { ...chineseTask, status: 'SUCCEEDED', metadata: {
    factors: chineseTask.preview.factors.map((draft, index) => ({ key: draft.key,
      code: `FACTOR_${index}`, name: index === 0 ? '四级手术患者人数' : '全部手术患者人数',
      calculationMode: 'TEMPORAL', timeField: 'b.In_Date',
      parameters: index === 0 ? [{ code: 'minAge', displayName: '最低年龄', type: 'INTEGER' }] : [], })),
  }, result: { indicatorVersionId: '102027642465828673', factors: chineseTask.preview.factors.map((draft, index) => ({
    factorCode: `FACTOR_${index}`, factorName: index === 0 ? '四级手术患者人数' : '全部手术患者人数',
    factorVersionId: `10202764246582865${index}`, status: 'PUBLISHED',
  })) } }
  await evaluate(`window.__sqlFields.factorMetadata=[]; window.__sqlFields.accept(${JSON.stringify(published)})`)
  await waitFor(() => evaluate(`document.querySelector('.factor-query-actions .el-select')?.textContent.includes('四级手术患者人数')`))
  const choices = await evaluate(`window.__sqlFields.publishedFactors.map(factor=>({label:factor.factorName,value:factor.factorVersionId}))`)
  assert.deepEqual(choices, [
    { label: '四级手术患者人数', value: '102027642465828650' },
    { label: '全部手术患者人数', value: '102027642465828651' },
  ])
  await evaluate(`window.__sqlFields.trialPeriod=['2026-01-01','2026-01-31']; window.__sqlFields.runtimeParameterValues.minAge=65; window.__sqlFields.runRuntimeQuery('FACTOR')`)
  const firstQuery = await evaluate(`window.__sqlQueryRequests.at(-1)`)
  assert.match(firstQuery.path, /102027642465828650\/query$/)
  assert.deepEqual(firstQuery.body.parameters, { minAge: 65 })
  await evaluate(`window.__sqlFields.selectedFactorVersionId='102027642465828651'`)
  await waitFor(() => evaluate(`document.querySelector('.factor-query-actions .el-select')?.textContent.includes('全部手术患者人数')`))
  await evaluate(`window.__sqlFields.runRuntimeQuery('FACTOR')`)
  const secondQuery = await evaluate(`window.__sqlQueryRequests.at(-1)`)
  assert.match(secondQuery.path, /102027642465828651\/query$/)
  assert.equal(secondQuery.body.parameters, undefined)
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width === 390, deviceScaleFactor: 1 })
    await evaluate(`document.querySelector('.factor-query-actions').scrollIntoView({block:'center',behavior:'instant'})`)
    assert.doesNotMatch(await evaluate(`document.querySelector('.factor-query-actions').textContent`), /stat_+/)
    await writeFile(`.tmp/sql-import-field-labels/published-factor-${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  assert.deepEqual(errors, [])
  console.log('PASS: SQL source and published factor selectors display business names on desktop/mobile and preserve backend references')
} finally { socket?.close(); chrome.kill() }
