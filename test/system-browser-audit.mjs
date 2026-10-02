import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { check, evidence, finish, pause, save } from './system-test-client.mjs'

const profile = await mkdtemp(join(tmpdir(), 'idmp-system-browser-'))
const port = 41748
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pending = new Map()
let socket, sequence = 0, events = [], routeStart = 0
async function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails))
  return value.result.value
}
const paths = process.env.IDMP_BROWSER_PATHS ? JSON.parse(process.env.IDMP_BROWSER_PATHS) : ['/dashboard', '/dashboard?id=1189225114584501123', '/dashboard?id=8185872850794987969', '/indicator', '/indicator/edit', '/indicator/view/102027642461313070', '/indicator/edit/102027642461313070', '/indicator/import/sql', '/indicator/recycle-bin', '/factor', '/factor/edit', '/factor/edit/102027642461312818', '/factor/recycle-bin', '/factor/templates', '/factor/templates/new', '/scenarios', '/mapping', '/analysis?indicator=TRANSFER_48H_GRAIN_DRILL_20261001&indicatorVersionId=102027642461313071&trendStart=2026-01-01&trendEnd=2026-01-31', '/alerts', '/calc', '/data/sources', '/data/domains', '/data/domains/102027642460333866', '/data/value-sets', '/data/value-sets/new', '/system']
try {
  let target
  for (let i = 0; i < 100; i++) {
    try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(p => p.type === 'page') } catch {}
    if (target) break
    await pause(100)
  }
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id)
    if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
    else if (['Network.responseReceived', 'Network.loadingFailed', 'Runtime.exceptionThrown'].includes(message.method)) events.push({ at: Date.now() - routeStart, method: message.method, params: message.params })
  })
  await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await mkdir(evidence, { recursive: true })
  for (const [index, path] of paths.entries()) {
    events = []; routeStart = Date.now()
    await send('Page.navigate', { url: 'http://127.0.0.1:5173' + path })
    let state
    for (let i = 0; i < 150; i++) {
      await pause(100)
      try { state = await evaluate(`({ready:document.readyState,main:!!document.querySelector('.idmp-main'),text:document.querySelector('.idmp-main')?.innerText?.length||0,loading:[...document.querySelectorAll('.el-loading-mask')].filter(el=>el.getBoundingClientRect().height>0).length,overflow:document.documentElement.scrollWidth>innerWidth+2})`) } catch {}
      if (i > 25 && state?.ready === 'complete' && state.text > 20 && !state.loading && (!events.length || Date.now()-routeStart-events.at(-1).at > 1000)) break
    }
    const duration = Date.now()-routeStart
    const failures = events.filter(e => e.method==='Runtime.exceptionThrown' || e.method==='Network.loadingFailed' && e.params.type!=='Other' || e.method==='Network.responseReceived' && e.params.response.status>=400 && ![401].includes(e.params.response.status) && e.params.response.url.includes('/api/v1/'))
    const errors = failures.map(e=>e.method==='Network.responseReceived'?{url:e.params.response.url,status:e.params.response.status}:e.method==='Runtime.exceptionThrown'?{exception:e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text}:{error:e.params.errorText})
    await save(`browser-${index}`, {path,duration,state,errors,apiResponses:events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/api/v1/')).map(e=>({url:e.params.response.url,status:e.params.response.status,at:e.at}))})
    check(`page-${path}`,state?.main && state.text>20 && !errors.length,{duration,state,errors})
    const screenshot = await send('Page.captureScreenshot', {format:'png'})
    await writeFile(join(evidence,`page-${index}.png`),Buffer.from(screenshot.data,'base64'))
    if (path==='/factor/templates/new') {
      await evaluate(`Array.from(document.querySelectorAll('.el-form-item')).find(el=>el.querySelector('.el-form-item__label')?.innerText.trim()==='主数据域')?.querySelector('.el-select__wrapper')?.click()`); await pause(500)
      const option = await evaluate(`(() => {const el=[...document.querySelectorAll('.el-select-dropdown__item')].find(el=>el.getBoundingClientRect().height>0); if(!el)return null; const label=el.innerText;el.click();return label})()`)
      await pause(2000)
      await save('template-domain-selection',{option,events:events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/api/v1/')).map(e=>({url:e.params.response.url,status:e.params.response.status}))})
      check('template-domain-selection',option!==null&&!events.some(e=>e.method==='Network.responseReceived'&&e.params.response.url.includes('/semantic-tables')&&e.params.response.status>=400),{option})
    }
  }
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
  for (const [index,path] of ['/dashboard?id=1189225114584501123','/analysis','/indicator/import/sql','/factor/edit'].entries()) {
    await send('Page.navigate',{url:'http://127.0.0.1:5173'+path});await pause(4000)
    const state=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,main:!!document.querySelector('.idmp-main')})`)
    await save(`mobile-${index}`,{path,state})
    check(`mobile-layout-${path}`,state.main&&state.scrollWidth<=state.width+2,state)
    const shot=await send('Page.captureScreenshot',{format:'png'})
    await writeFile(join(evidence,`mobile-${index}.png`),Buffer.from(shot.data,'base64'))
  }
} finally {
  socket?.close();chrome.kill()
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})
  await finish()
}
