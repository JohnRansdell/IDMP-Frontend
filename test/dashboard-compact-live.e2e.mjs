import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const folder = '.tmp/dashboard-response-optimization-browser-live'
const profile = await mkdtemp(join(tmpdir(), 'idmp-dashboard-compact-'))
const port = 41752
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-extensions', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const pending = new Map()
const requests = []
let socket, sequence = 0
function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function waitForPage() {
  for (let attempt = 0; attempt < 120; attempt++) {
    await pause(250)
    if (await evaluate(`document.querySelector('.idmp-main')?.innerText.includes('住院死亡率') && ![...document.querySelectorAll('.el-loading-mask')].some(el=>el.getBoundingClientRect().height>0)`)) return
  }
  throw new Error('看板未在等待时间内完成加载')
}
try {
  await mkdir(folder, { recursive: true })
  let target
  for (let attempt = 0; attempt < 100 && !target; attempt++) {
    try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === 'page') } catch {}
    if (!target) await pause(100)
  }
  assert.ok(target, 'Chrome 调试连接未就绪')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (request) {
      clearTimeout(request.timer)
      pending.delete(message.id)
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
    } else if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/analysis/dashboards/')) {
      requests.push({ url: message.params.request.url, body: message.params.request.postData })
    }
  })
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/dashboard?id=1189225114584501123' })
  await waitForPage()
  const probe = await evaluate(`(async()=>{
    const api=await import('/src/idmp/api/modules/analysisDashboard.js');
    const data=await api.queryDashboard('1189225114584501123',{periodStart:'2026-01-01',periodEnd:'2026-01-31',granularity:'MONTHLY'},{cache:'no-store'});
    const widgets=Object.values(data.widgets);
    const large=widgets.filter(widget=>widget.rows.length===6166);
    const death=widgets.flatMap(widget=>widget.rows).find(row=>Number(row.numeratorValue)===55&&Number(row.denominatorValue)===14187);
    return {largeCount:large.length,sharedRows:large.length===2&&large[0].rows===large[1].rows,
      scopes:large.length&&large[0].rows.filter(row=>row.drillContext?.resultId&&row.drillContext?.snapshotId&&row.drillContext?.filters).length,
      value:death?.value,numerator:death?.numeratorValue,denominator:death?.denominatorValue,
      exactIds:large.length&&typeof large[0].rows[0].snapshotId==='string'};
  })()`)
  assert.equal(probe.largeCount, 2)
  assert.equal(probe.sharedRows, true)
  assert.equal(probe.scopes, 6166)
  assert.equal(probe.exactIds, true)
  assert.ok(Math.abs(Number(probe.value) - 55 / 14187) < 1e-8)
  assert.ok(requests.some(request => request.body && JSON.parse(request.body).responseFormat === 'COMPACT'))
  const views = []
  for (const [name, width, height, mobile] of [['desktop', 1440, 1000, false], ['mobile', 390, 844, true]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    await pause(1500)
    const state = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+2,
      error:/看板数据格式不完整|质量看板加载失败|当前条件暂无正式结果/.test(document.body.innerText),
      charts:[...document.querySelectorAll('canvas')].filter(canvas=>canvas.width>20&&canvas.height>20).map(canvas=>{
        const pixels=canvas.getContext('2d')?.getImageData(0,0,canvas.width,canvas.height).data;
        let colored=0;if(pixels)for(let i=0;i<pixels.length;i+=16)if(pixels[i+3]>0&&(pixels[i]<240||pixels[i+1]<240||pixels[i+2]<240))colored++;
        return {width:canvas.width,height:canvas.height,colored};})})`)
    assert.equal(state.overflow, false)
    assert.equal(state.error, false)
    assert.ok(state.charts.some(chart => chart.colored > 100), '图表画布不应为空')
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(folder, `${name}.png`), Buffer.from(screenshot.data, 'base64'))
    views.push({ name, ...state })
  }
  await writeFile(join(folder, 'summary.json'), JSON.stringify({ passed: true, probe, views, requests }, null, 2))
  console.log(JSON.stringify({ passed: true, probe, views }))
} finally {
  socket?.close()
  const stopped = new Promise(resolve => chrome.once('close', resolve))
  chrome.kill()
  await Promise.race([stopped, pause(3000)])
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
