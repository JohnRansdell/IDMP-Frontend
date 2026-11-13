import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-edit-entry-'))
// Run against the local Vite server; all API requests below use fixtures.
const port = 41941
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
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page');return !!target}catch{return false}},'browser')
  socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}})
  await send('Page.enable');await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);window.__editCalls=[];
    window.fetch=async(input,init={})=>{
      const url=new URL(String(input),location.origin),path=url.pathname.replace('/api/v1','');
      if(!url.pathname.startsWith('/api/v1/'))return original(input,init);
      window.__editCalls.push({path,method:init.method||'GET'});
      if(path==='/auth/refresh')return new Response(JSON.stringify({code:'COMMON-40100'}),{status:401,headers:{'Content-Type':'application/json'}});
      let data={records:[],total:0,pageNum:1,pages:1};
      if(path==='/auth/me')data={user:{id:'1',username:'fixture',roles:['ADMIN']},roles:['ADMIN'],menus:[],apiRules:[]};
      else if(path==='/indicators/100')data={id:'100',name:'已有指标回填验证',category:'历史分类',description:'目录摘要',definition:'原有完整定义',meaning:'原有指标意义',statisticalPeriod:'MONTHLY',dataSources:[{sourceCategory:'历史系统'}],attribute:'历史属性',unit:'例/日',direction:'旧版导向',resourceVersion:3};
      else if(path==='/indicators/100/versions')data=[{id:'701',versionNo:1},{id:'702',versionNo:2}];
      else if(path==='/indicator-versions/701')data={id:'701',indicatorId:'100',versionNo:1,status:'DRAFT',resourceVersion:2,formula:{root:{nodeType:'FACTOR_REF',factorVersionId:'11'}},dimensionGrain:['DEPT_CODE'],drillConfig:{drillPaths:[{pathCode:'ORGANIZATION',maxLevel:'DEPARTMENT',levels:[{levelCode:'HOSPITAL',levelName:'医院'},{levelCode:'DEPARTMENT',levelName:'科室',memberKeyFieldCode:'DEPT_CODE',dimensionFieldCode:'DEPT_CODE',displayFieldCode:'DEPT_NAME'}]}]}};
      else if(path==='/factor-versions')data={records:[{id:'11',factorId:'12',factorCode:'COUNT',factorName:'原有因子',status:'PUBLISHED',dsl:{calculationMode:'TEMPORAL',output:{valueType:'DECIMAL'}}}],total:1,pageNum:1,pages:1};
      else if(path.endsWith('/policy-references'))data=[];
      else if(path.includes('/scenarios'))data={records:[{id:'801',scenarioVersionId:'802',name:'原有关联场景'}],total:1,pageNum:1,pages:1};
      else if(path==='/indicator-versions/drill-capabilities')data={factorVersionIds:['11'],fieldOptions:[],dimensions:[]};
      return new Response(JSON.stringify({code:'OK',data}),{headers:{'Content-Type':'application/json'}});
    };
  })()`})
  await send('Page.navigate',{url:(process.env.IDMP_FRONTEND_URL||'http://127.0.0.1:5174')+'/__edit-entry-test__'})
  await until(()=>evaluate(`document.readyState==='complete' && location.protocol==='http:'`),'page')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const source=await(await fetch('/src/idmp/views/IndicatorEditor.vue')).text();
    const routerModule=source.match(/from "([^\\"]*vue-router[^\\"]*)"/)[1];
    const {createRouter,createMemoryHistory}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Editor}=await import('/src/idmp/views/IndicatorEditor.vue');
    const {setAccessToken}=await import('/src/idmp/api/request.js');
    const session=await import('/src/idmp/auth/session.js');
    const {createAccessDirective}=await import('/src/idmp/auth/accessDirective.js');
    document.querySelector('#app')?.__vue_app__?.unmount();sessionStorage.clear();setAccessToken('fixture');await session.hydrateCurrentUser();
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/indicator/:id/edit',name:'IndicatorEditor',component:{render:()=>null}},{path:'/scenario/:scenarioId',name:'ScenarioEditor',component:{render:()=>null}},{path:'/indicator/:id',name:'IndicatorDetail',component:{render:()=>null}}]});
    await router.push({name:'IndicatorEditor',params:{id:'100'},query:{indicatorVersionId:'701'}});await router.isReady();window.__editRouter=router;
    document.body.innerHTML='<main id="edit-entry-test" style="max-width:1200px;margin:auto;padding:20px"></main>';
    const editor=ref();window.__editState=()=>editor.value.$.setupState;
    const app=createApp({render:()=>h(Editor,{ref:editor})});app.use(router).use(ElementPlus);app.config.globalProperties.$can=session.canRequest;app.directive('access',createAccessDirective(session.canRequest));app.directive('query-enter',{});app.mount('#edit-entry-test');
  })()`)
  await until(()=>evaluate(`window.__editState()?.editLoadState.detailReady && !window.__editState()?.editLoadState.loading`),'editor ready')
  assert.equal(await evaluate(`window.__editState().indicatorWorkflow.versionId`),'701')
  const form=await evaluate(`JSON.parse(JSON.stringify(window.__editState().form))`)
  assert.equal(form.definition,'原有完整定义');assert.equal(form.significance,'原有指标意义');assert.equal(form.period,'月度')
  assert.equal(form.unit,'例/日');assert.equal(form.direction,'旧版导向');assert.deepEqual(form.sources,['历史系统'])
  assert.equal(await evaluate(`document.querySelector('.category-cascader input').value`),'历史分类')
  assert.equal(await evaluate(`window.__editState().selectedDrillPaths[0].levels[1].displayFieldCode`),'DEPT_NAME')
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await pause(300)
  const directory='.tmp/indicator-edit-entry';await mkdir(directory,{recursive:true})
  await writeFile(`${directory}/basic.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()==='管理场景关联').click()`);await pause(250)
  assert.equal(await evaluate(`window.__editState().activeTab`),'scene')
  assert.ok(await evaluate(`!!document.querySelector('.association-card')`),'Scene associations open independently of basic form validation')
  const writes=await evaluate(`window.__editCalls.filter(call=>['POST','PUT','PATCH','DELETE'].includes(call.method) && !['/auth/refresh','/indicator-versions/drill-capabilities'].includes(call.path))`)
  assert.deepEqual(writes,[])
  assert.deepEqual(errors,[])
  console.log('PASS: exact version, saved metadata/category/source selections, draft drill fields, direct scenario entry and no business writes. APIs mocked.')
} finally {socket?.close();chrome.kill()}
