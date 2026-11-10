import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-runtime-label-'))
const port = 41938
const pending = new Map(), errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await pause(150)
  }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
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
  await until(async () => { try { target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'); return !!target } catch { return false } }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const data=JSON.parse(event.data)
    if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails)
    const request=pending.get(data.id)
    if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', {url:(process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5173')+'/__runtime-label-test__'})
  await until(()=>evaluate(`document.readyState==='complete' && location.protocol==='http:'`), 'page ready')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Fields}=await import('/src/idmp/components/RuntimeParameterFields.vue');
    document.body.innerHTML='<main id="label-test" style="padding:16px;box-sizing:border-box;max-width:100%"></main>';
    const values=ref({});window.__labelValues=values;
    createApp({render:()=>h(Fields,{declarations:[{code:'deptCode',type:'STRING',required:true},{code:'limit',type:'STRING',displayName:'年龄下限'}],modelValue:values.value,'onUpdate:modelValue':value=>{values.value=value},showMetadata:false})}).use(ElementPlus).mount('#label-test');
  })()`)
  await until(()=>evaluate(`document.querySelectorAll('.runtime-parameter-field input').length===2`),'fields rendered')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.runtime-parameter-field label span')).map(el=>el.textContent)`),['科室编码*','年龄下限'])
  await evaluate(`(()=>{const input=document.querySelector('.runtime-parameter-field input');input.value='D001';input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await until(()=>evaluate(`window.__labelValues.value.deptCode==='D001'`),'parameter value update')
  assert.deepEqual(await evaluate(`JSON.parse(JSON.stringify(window.__labelValues.value))`),{deptCode:'D001'})
  await mkdir('.tmp/runtime-parameter-label-browser',{recursive:true})
  for(const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await pause(150)
    const boxes=await evaluate(`Array.from(document.querySelectorAll('.runtime-parameter-field')).map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})`)
    assert.ok(boxes.every(box=>box.left>=0 && box.right<=box.width),JSON.stringify(boxes))
    await writeFile('.tmp/runtime-parameter-label-browser/'+(viewport.mobile?'mobile':'desktop')+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  assert.deepEqual(errors,[])
  console.log('PASS: Chinese runtime labels, unchanged deptCode update key, desktop/mobile layout. No server writes.')
} finally {socket?.close();chrome.kill()}
