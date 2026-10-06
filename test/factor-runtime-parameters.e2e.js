import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.DAG_FRONTEND_URL || 'http://127.0.0.1:5173'
const profile = await mkdtemp(join(tmpdir(), 'idmp-factor-runtime-'))
const port = 41936, pending = new Map(), errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide:true, stdio:'ignore' })
let socket, sequence=0
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
async function until(predicate,label) {
  const deadline=Date.now()+45000
  while(Date.now()<deadline) { if(await predicate())return;await pause(150) }
  throw new Error(`Timeout: ${label}`)
}
function send(method,params={}) {
  return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
}
async function evaluate(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
try {
  let target
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');return !!target}catch{return false}},'browser startup')
  socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}})
  await send('Page.enable');await send('Runtime.enable')
  await send('Page.navigate',{url:appUrl})
  await until(()=>evaluate(`document.readyState==='complete'`),'page ready')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const editorSource=await(await fetch('/src/idmp/views/FactorEditor.vue')).text();
    const routerModule=editorSource.match(/from "([^\"]*vue-router[^\"]*)"/)[1];
    const {createRouter,createMemoryHistory}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Editor}=await import('/src/idmp/views/FactorEditor.vue');
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      if(String(input).endsWith('/factor-versions/102027642462333442/query')){
        window.__runtimeQuery=JSON.parse(init.body);
        return new Response(JSON.stringify({code:'OK',data:{records:[{factor_value:42,dimensions:{}}]}}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      return originalFetch(input,init);
    };
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/factor/edit/:id',component:{render:()=>null}}]});
    await router.push('/factor/edit/102027642462333441?factorVersionId=102027642462333442');await router.isReady();
    document.body.innerHTML='<main id="runtime-test" style="max-width:1200px;margin:auto;padding:16px;box-sizing:border-box"></main>';
    const editor=ref();window.__runtimeEditor=editor;
    createApp({render:()=>h(Editor,{ref:editor})}).use(router).use(ElementPlus).mount('#runtime-test');
  })()`)
  await until(()=>evaluate(`window.__runtimeEditor.value.$.setupState.runtimeDeclarations.some(p=>p.code==='patientName')`),'live inherited parameters')
  assert.deepEqual(await evaluate(`window.__runtimeEditor.value.$.setupState.runtimeDeclarations.map(p=>p.code)`),['patientName'])
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.runtime-parameter-field label span')).map(el=>el.textContent)`),['patientName'])
  await evaluate(`window.__runtimeEditor.value.$.setupState.trialPeriod=['2026-01-01T00:00:00','2026-01-02T00:00:00'];window.__runtimeEditor.value.$.setupState.runtimeValues={patientName:'张'}`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='即时查询').click()`)
  await until(()=>evaluate(`!!window.__runtimeQuery && window.__runtimeEditor.value.$.setupState.queryRows.length===1`),'query without period input')
  assert.deepEqual(await evaluate(`window.__runtimeQuery`),{periodStart:'2026-01-01T00:00:00',periodEnd:'2026-01-02T00:00:00',parameters:{patientName:'张'}})
  await mkdir('.tmp/factor-runtime-browser',{recursive:true})
  for(const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('[aria-label="因子即时查询"]').scrollIntoView({block:'center',behavior:'instant'})`)
    await pause(150)
    const layout=await evaluate(`(()=>{const el=document.querySelector('.runtime-parameter-field');const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,label:el.querySelector('label span').textContent}})()`)
    assert.ok(layout.left>=0&&layout.right<=layout.width,JSON.stringify(layout))
    assert.equal(layout.label,'patientName')
    await writeFile(`.tmp/factor-runtime-browser/${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  assert.deepEqual(errors,[])
  console.log('PASS: live composite metadata hides system period; business parameters and date payload preserved; desktop/mobile verified. Query response mocked; no server writes.')
} finally {socket?.close();chrome.kill()}
