import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { api } from './system-test-client.mjs'

const indicatorId = process.env.PDF_INDICATOR_ID || '102027642461313070'
const versions = await api('GET', `/indicators/${indicatorId}/versions`)
const published = (Array.isArray(versions) ? versions : versions.records || []).find(item => (item.publicationStatus || item.status) === 'PUBLISHED')
assert.ok(published, 'Published acceptance version is required')
const versionId = String(published.id)
const port = Number(process.env.PDF_APP_PORT || 5173), debugPort = 41815
const evidence = resolve('.tmp/analysis-pdf-live')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-analysis-pdf-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label = 'browser condition') { for (let i = 0; i < 600; i++) { if (await predicate()) return; await delay(100) } throw new Error(`${label} timed out`) }
async function send(method, params = {}) {
  return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
function trackBrowser() {
  const realFetch = window.fetch.bind(window)
  window.__pdfRequests = []
  window.__pdfBlobs = []
  window.__pdfDownloads = []
  const create = URL.createObjectURL.bind(URL)
  URL.createObjectURL = blob => { window.__pdfBlobs.push(blob); return create(blob) }
  const click = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__pdfDownloads.push(this.download); return click.call(this) }
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    const started = performance.now()
    const response = await realFetch(input, init)
    const report = url.includes('/export/pdf') ? JSON.parse(init.body) : null
    window.__pdfRequests.push({ url, method: init.method || 'GET', status: response.status, ms: Math.round(performance.now() - started), report })
    return response
  }
}
async function exportReport(label) {
  const before = await evaluate(`window.__pdfBlobs.length`)
  const beforeExport = await evaluate(`window.__pdfRequests.filter(r=>r.report).length`)
  const calculationCount = `window.__pdfRequests.filter(r=>{const p=new URL(r.url,location.href).pathname;return p.endsWith('/query')||p.endsWith('/analysis')}).length`
  const beforeQuery = await evaluate(calculationCount)
  await evaluate(`(() => {const button=Array.from(document.querySelectorAll('.instant-query-export button')).find(el=>el.textContent.trim()==='导出PDF');button.click();button.click()})()`)
  await waitFor(async () => {
    const failure = await evaluate(`document.querySelector('.el-message--error')?.textContent`)
    if (failure) throw new Error(`${label}: ${failure}`)
    return evaluate(`window.__pdfBlobs.length>${before}`)
  }, `PDF download ${label}`)
  const encoded = await evaluate(`new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(window.__pdfBlobs.at(-1))})`)
  const bytes = Buffer.from(encoded, 'base64')
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  const request = await evaluate(`window.__pdfRequests.filter(r=>r.report).at(-1)`)
  assert.equal(request.status, 200)
  assert.equal(request.report.indicatorVersionId, versionId)
  assert.equal(await evaluate(`window.__pdfRequests.filter(r=>r.report).length`), beforeExport + 1, 'Repeated clicks must not duplicate exports')
  assert.ok(request.ms < 5000, `Slow PDF response: ${request.ms} ms`)
  assert.equal(await evaluate(calculationCount), beforeQuery, 'Export must not trigger another calculation')
  assert.match(await evaluate(`window.__pdfDownloads.at(-1)`), /分析报告.*\.pdf$/)
  await writeFile(join(evidence, `${label}.pdf`), bytes)
  await writeFile(join(evidence, `${label}.json`), JSON.stringify(request, null, 2))
  return request
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
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidence })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${trackBrowser.toString()})()` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/analysis?indicator=${indicatorId}&indicatorVersionId=${versionId}` })
  await waitFor(() => evaluate(`!!document.querySelector('.indicator-analysis')`))
  await evaluate(`(() => {let c=document.querySelector('.indicator-analysis').__vueParentComponent;while(c&&c.type.__name!=='IndicatorAnalysis')c=c.parent;window.__analysisPdf=c.setupState})()`)
  await waitFor(() => evaluate(`window.__analysisPdf.canExportPdf&&window.__analysisPdf.trendTableRows.length>0`), 'real formal analysis')
  const formal = await exportReport('formal-desktop')
  assert.ok(formal.report.sections[1].chartPng?.startsWith('data:image/png;base64,'))
  assert.ok(formal.report.sections[2].rows.length > 0, 'Department ranks should be present')
  const pixels = await evaluate(`new Promise(resolve=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;let nonwhite=0;for(let i=0;i<p.length;i+=4)if(p[i]<240||p[i+1]<240||p[i+2]<240)nonwhite++;resolve({width:c.width,height:c.height,nonwhite})};image.src=window.__pdfRequests.filter(r=>r.report).at(-1).report.sections[1].chartPng})`)
  assert.ok(pixels.nonwhite > 5000, 'Chart image must not be blank')
  await writeFile(join(evidence, 'chart.png'), Buffer.from(formal.report.sections[1].chartPng.split(',')[1], 'base64'))
  await writeFile(join(evidence, 'desktop.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate(`window.__analysisPdf.reportPeriodRange=['2025-12-04','2026-02-12'];window.__analysisPdf.indicatorRuntimeParameterValues={patientName:'张'};window.__analysisPdf.applyReportPeriod()`)
  await waitFor(() => evaluate(`window.__analysisPdf.canExportPdf&&window.__analysisPdf.rangeSummary?.status==='READY'`), 'patient-name instant summary')
  const instant = await exportReport('instant-desktop')
  assert.equal(instant.report.sections[0].rows[0][1], '0.68%')
  assert.equal(instant.report.sections[0].rows.find(row=>row[0]==='分子')[1], '15')
  assert.equal(instant.report.sections[0].rows.find(row=>row[0]==='分母')[1], '2,207')
  assert.match(instant.report.metadata.find(item=>item.label==='运行参数').value, /张/)
  assert.match(instant.report.metadata.find(item=>item.label==='报告期').value, /2025-12-04.*2026-02-12/)
  await evaluate(`window.__analysisPdf.trendGrainDraft={科室:'未应用测试值'};window.__analysisPdf.trendPeriodDraft=['2020-01-01','2020-02-01'];window.__analysisPdf.scenarioComparisonPeriodRange=['2020-01-01','2020-02-01'];window.__analysisPdf.activeTab='rank'`)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  const mobile = await exportReport('rank-mobile')
  assert.doesNotMatch(JSON.stringify(mobile.report.metadata), /未应用测试值|2020-01-01/)
  const title = await evaluate(`(()=>{const r=document.querySelector('.page-heading h1').getBoundingClientRect();return {width:r.width,height:r.height}})()`)
  assert.ok(title.width > 250 && title.height < 200, `Mobile title must fit: ${JSON.stringify(title)}`)
  await writeFile(join(evidence, 'mobile.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await evaluate(`window.__analysisPdf.activeTab='drill'`)
  await waitFor(() => evaluate(`!!window.__analysisPdf.drillExplorerRef&&!window.__analysisPdf.drillExplorerRef.getReportSnapshot().loading`), 'drill snapshot')
  const drill = await exportReport('drill-desktop')
  assert.ok(drill.report.sections.some(section=>section.title.startsWith('当前下钻结果')))
  const snapshot = await evaluate(`window.__analysisPdf.drillExplorerRef.getReportSnapshot().section`)
  const exported = drill.report.sections.filter(section=>section.title.startsWith('当前下钻结果'))
  assert.deepEqual([...exported[0].columns, ...exported.slice(1).flatMap(section=>section.columns.slice(1))], snapshot.columns)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, indicatorId, versionId, pixels, files: ['formal-desktop.pdf','instant-desktop.pdf','rank-mobile.pdf','drill-desktop.pdf'], evidence }))
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({messages:Array.from(document.querySelectorAll('.el-message')).map(el=>el.textContent),canExport:window.__analysisPdf?.canExportPdf,drill:window.__analysisPdf?.drillExplorerRef?.getReportSnapshot(),requests:window.__pdfRequests.filter(r=>r.report)})`), null, 2))
  }
  throw error
} finally { socket?.close(); chrome.kill() }
