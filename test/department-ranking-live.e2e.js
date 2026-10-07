import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const indicatorId = '102027642462358147', versionId = '102027642462358159'
const folder = '.tmp/department-ranking-fix-20261007'
await mkdir(folder, { recursive: true })
const params = new URLSearchParams({ indicatorVersionId: versionId, periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY', sections: 'DEPARTMENT_COMPARISON' })
const analysis = await api('GET', `/analysis/indicators/${indicatorId}/analysis?${params}`)
await writeFile(`${folder}/response.json`, JSON.stringify(analysis, null, 2))
const ranking = analysis.departmentComparison
assert.equal(ranking.length, 53)
assert.equal(new Set(ranking.map(row => row.departmentCode)).size, 53)
assert.ok(ranking.every(row => row.departmentName && row.snapshotId && row.resultId))
const truth = await db('SOURCE', "SELECT JSON_OBJECT('code',out_dept_code,'name',MAX(out_dept_name),'n',SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),'d',SUM(drug_cost)) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' GROUP BY out_dept_code")
for (const row of ranking) {
  const expected = truth.find(item => item.code === row.departmentCode)
  assert.ok(expected, `Unknown department ${row.departmentCode}`)
  assert.equal(row.departmentName, expected.name)
  assert.ok(Math.abs(Number(row.numeratorValue) - Number(expected.n)) < 0.0001)
  assert.ok(Math.abs(Number(row.denominatorValue) - Number(expected.d)) < 0.0001)
  if (Number(expected.d) !== 0) assert.ok(Math.abs(Number(row.value) - Number(expected.n) / Number(expected.d)) < 1e-8)
}
for (let index = 1; index < ranking.length; index++) assert.ok(Number(ranking[index - 1].value) >= Number(ranking[index].value))
const filtered = await api('GET', `/analysis/indicators/${indicatorId}/analysis?${params}&filter.${encodeURIComponent('病种')}=C20.x00`)
assert.deepEqual(filtered.departmentComparison, [], 'Filtered analysis must not reuse unfiltered department values')

const profile = await mkdtemp(join(tmpdir(), 'idmp-department-ranking-'))
const debugPort = 41948
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  for (let i = 0; i < 300; i++) { if (await predicate()) return; await delay(150) }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
try {
  let target
  await until(async () => {
    try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) } catch { return false }
  }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:5173/analysis?indicator=${indicatorId}&indicatorVersionId=${versionId}&trendStart=2026-01-01&trendEnd=2026-01-31` })
  await until(() => evaluate(`!!document.querySelector('.indicator-analysis')`), 'analysis page')
  await evaluate(`(() => {let c=document.querySelector('.indicator-analysis').__vueParentComponent;while(c&&c.type.__name!=='IndicatorAnalysis')c=c.parent;window.__rankAudit=c.setupState})()`)
  await until(() => evaluate(`window.__rankAudit.hasBackendAnalysisData`), 'formal analysis')
  await evaluate(`document.getElementById('tab-rank').click()`)
  await until(() => evaluate(`window.__rankAudit.rankTableData.length===53`), '53 department rows')
  const rows = await evaluate(`window.__rankAudit.rankTableData`)
  assert.equal(new Set(rows.map(row => row.departmentKey)).size, 53)
  assert.equal(rows.find(row => row.departmentCode === '14').department, truth.find(row => row.code === '14').name)
  assert.ok(rows.every(row => row.department === ranking.find(item => item.departmentCode === row.departmentCode)?.departmentName))
  await until(() => evaluate(`document.querySelectorAll('.rank-table .el-table__body tr').length===53`), 'rendered table')
  await evaluate(`document.querySelector('.rank-table').scrollIntoView({block:'start'})`)
  await delay(300)
  await writeFile(`${folder}/desktop.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await delay(500)
  assert.equal(await evaluate(`window.__rankAudit.rankTableData.length`), 53)
  await evaluate(`document.querySelector('.rank-table').scrollIntoView({block:'start'})`)
  await writeFile(`${folder}/mobile.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  assert.deepEqual(errors, [])
  await writeFile(`${folder}/summary.json`, JSON.stringify({ passed: true, departments: 53, sourceChecked: 53, browserDesktop: true, browserMobile: true, filteredScopeProtected: true }, null, 2))
  console.log('PASS 53 departments reconciled with source SQL; desktop/mobile ranking rendered; filtered scope preserved')
} finally {
  socket?.close()
  chrome.kill()
  for (const request of pending.values()) request.reject(new Error('Browser closed'))
}
