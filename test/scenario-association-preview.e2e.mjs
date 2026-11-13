import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-scenario-preview-'))
// Run against the local Vite server; all API requests below use fixtures.
const port = 41948
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

const TARGET='102027642463173253', OTHER='102027642458358230'
const directory='.tmp/scenario-association-preview'
async function click(text, root='document') {
  await evaluate(`(()=>{const button=Array.from((${root}).querySelectorAll('button')).find(el=>el.getClientRects().length && el.textContent.trim()==='${text}');if(!button)throw new Error('Button missing: ${text}');button.click()})()`)
}
const rowRoot=name=>`Array.from(document.querySelectorAll('.association-row')).find(row=>row.textContent.includes('${name}'))`
async function ready(){await until(()=>evaluate(`!!document.querySelector('.association-card') && !document.querySelector('.association-card [role="status"]')`),'association states')}
async function snapshot(name,width=1440,height=1150){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await pause(350)
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'No horizontal page overflow')
  await writeFile(`${directory}/${name}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
}
try{
  let target
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page');return !!target}catch{return false}},'browser')
  socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}})
  await send('Page.enable');await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument',{source:String.raw`(()=>{
    const TARGET='${TARGET}',OTHER='${OTHER}',clone=value=>JSON.parse(JSON.stringify(value));
    const masters=[{id:'801',name:'医疗质量监测',status:'PUBLISHED',currentPublishedVersionId:'901'},
      {id:'802',name:'住院服务分析',status:'PUBLISHED',currentPublishedVersionId:'903'},
      {id:'803',name:'专项评审',status:'DRAFT'},
      {id:'804',name:'运营效率分析',status:'PUBLISHED',currentPublishedVersionId:'906'},
      {id:'805',name:'单指标示例',status:'PUBLISHED',currentPublishedVersionId:'908'}];
    const binding=(id,n=0)=>({indicatorVersionId:id,displayOrder:n,required:false,periodType:'QUARTERLY',organizationScopeDsl:{nodeType:'TRUE'},dimensionGrain:['科室'],reportRequirementText:'保留原上报要求',mappingOriginType:'MANUAL'});
    const versions={};
    const add=(id,scene,status,items,no=1)=>versions[id]={id,scenarioId:scene,versionNo:no,publicationStatus:status,resourceVersion:2,defaultPeriodType:'MONTHLY',defaultParameters:{},defaultDataSourcePriority:{},indicators:items};
    add('901','801','PUBLISHED',[binding(OTHER)]);
    add('903','802','PUBLISHED',[binding(TARGET),binding(OTHER,1)]);
    add('905','803','DRAFT',[binding(TARGET),binding(OTHER,1)]);
    add('906','804','PUBLISHED',[binding(TARGET),binding(OTHER,1)]);add('907','804','DRAFT',[binding(OTHER)],2);
    add('908','805','PUBLISHED',[binding(TARGET)]);
    const calls=[];let next=10001;window.__scenarioFixture={masters,versions,calls};
    const original=window.fetch.bind(window),response=(data,status=200,message='success')=>new Response(JSON.stringify({code:status===200?'OK':'COMMON-'+status+'00',data,message}),{status,headers:{'Content-Type':'application/json'}});
    const detail=id=>{const version=clone(versions[id]);version.indicators=version.indicators.map(row=>({...row,indicatorId:row.indicatorVersionId===TARGET?'100':'101',indicatorName:row.indicatorVersionId===TARGET?'住院服务质量（交互预览）':'服务效率示例',indicatorVersionNo:1}));return {scenario:clone(masters.find(row=>row.id===version.scenarioId)),version}};
    window.fetch=async(input,init={})=>{
      const url=new URL(String(input),location.origin),path=url.pathname.replace('/api/v1',''),method=init.method||'GET',body=init.body?JSON.parse(init.body):{};
      if(!url.pathname.startsWith('/api/v1/'))return original(input,init);
      calls.push({path,method,body:clone(body)});
      if(path==='/auth/refresh')return response(null,401);
      if(path==='/auth/me')return response({user:{id:'1',username:'preview',roles:['ADMIN']},roles:['ADMIN'],menus:[],apiRules:[]});
      if(path==='/indicators/100')return response({id:'100',name:'住院服务质量（交互预览）',status:'PUBLISHED',description:'用于验证场景关联交互的本地模拟指标'});
      if(path==='/indicators/100/versions')return response([{id:TARGET,versionNo:1,status:'PUBLISHED'}]);
      if(path==='/indicator-versions/'+TARGET)return response({id:TARGET,indicatorId:'100',status:'PUBLISHED',versionNo:1,formula:{schemaVersion:'1.0',astType:'INDICATOR_FORMULA',root:{nodeType:'FACTOR_REF',factorVersionId:'11'}}});
      if(path==='/factor-versions/11')return response({id:'11',factorId:'12',factorName:'出院人次',dsl:{calculationMode:'TEMPORAL',output:{valueType:'DECIMAL'}}});
      if(path==='/indicator-versions')return response({records:[{id:TARGET,indicatorId:'100',indicatorName:'住院服务质量（交互预览）',versionNo:1,publicationStatus:'PUBLISHED'},{id:OTHER,indicatorId:'101',indicatorName:'服务效率示例',versionNo:1,publicationStatus:'PUBLISHED'}],total:2,pageNum:1,pages:1});
      if(path==='/scenarios')return response({records:clone(masters),total:masters.length,pageNum:1,pages:1});
      const sceneVersions=path.match(/^\/scenarios\/([^/]+)\/versions$/);
      if(sceneVersions){
        if(method==='POST'){
          const base=versions[body.copyFromVersionId];if(!base)return response(null,404);
          const id=String(next++);versions[id]={...clone(base),id,publicationStatus:'DRAFT',versionNo:base.versionNo+1,resourceVersion:0};return response(detail(id));
        }
        return response(Object.values(versions).filter(row=>row.scenarioId===sceneVersions[1]).map(row=>({id:row.id,versionNo:row.versionNo,publicationStatus:row.publicationStatus})));
      }
      const match=path.match(/^\/scenario-versions\/([^/]+)(?:\/(indicators|validate|publish))?$/);
      if(match){
        const id=match[1],v=versions[id];if(!v)return response(null,404);
        if(method==='GET')return response(detail(id));
        if(match[2]==='validate'){v.resourceVersion++;return response({valid:v.indicators.length>0,resourceVersion:v.resourceVersion});}
        if(body.resourceVersion!==v.resourceVersion)return response(null,409,'资源版本冲突');
        if(match[2]==='indicators'){if(!body.indicators.length)return response(null,400,'至少一个指标');v.indicators=clone(body.indicators);v.resourceVersion++;return response(detail(id));}
        if(match[2]==='publish'){v.publicationStatus='PUBLISHED';v.resourceVersion++;const master=masters.find(row=>row.id===v.scenarioId);master.currentPublishedVersionId=id;master.status='PUBLISHED';return response(detail(id));}
        Object.assign(v,body,{resourceVersion:v.resourceVersion+1});const master=masters.find(row=>row.id===v.scenarioId);if(body.name)master.name=body.name;return response(detail(id));
      }
      return response([]);
    };
  })()`})
  await send('Page.navigate',{url:(process.env.IDMP_FRONTEND_URL||'http://127.0.0.1:5186')+'/__scenario-preview-test__'})
  await until(()=>evaluate(`document.readyState==='complete' && location.protocol==='http:'`),'page')
  await evaluate(`(async()=>{
    const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
    const source=await(await fetch('/src/idmp/views/IndicatorDetail.vue')).text();
    const routerModule=source.match(/from "([^\\"]*vue-router[^\\"]*)"/)[1];
    const {createRouter,createMemoryHistory,RouterView}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Detail}=await import('/src/idmp/views/IndicatorDetail.vue');
    const {default:Scene}=await import('/src/idmp/views/ScenarioEditor.vue');
    const {setAccessToken}=await import('/src/idmp/api/request.js');const session=await import('/src/idmp/auth/session.js');
    const {createAccessDirective}=await import('/src/idmp/auth/accessDirective.js');
    document.querySelector('#app')?.__vue_app__?.unmount();setAccessToken('preview-fixture');await session.hydrateCurrentUser();
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/indicator/detail/:id',name:'IndicatorDetail',component:Detail},{path:'/scenarios/:scenarioId/edit',name:'ScenarioEditor',component:Scene},{path:'/scenarios',name:'ScenarioList',component:{render:()=>null}}]});
    await router.push('/indicator/detail/100');await router.isReady();window.__previewRouter=router;
    document.body.innerHTML='<main id="scenario-preview-test" style="max-width:1240px;padding:24px;margin:auto"></main>';
    const app=createApp({render:()=>h(RouterView)});app.config.globalProperties.$can=session.canRequest;app.directive('access',createAccessDirective(session.canRequest));app.directive('query-enter',{});app.use(router).use(ElementPlus).mount('#scenario-preview-test');
  })()`)
  await mkdir(directory,{recursive:true});await ready()
  const writes=()=>evaluate(`window.__scenarioFixture.calls.filter(call=>['POST','PUT','PATCH','DELETE'].includes(call.method) && call.path!=='/auth/refresh')`)
  assert.deepEqual(await writes(),[])
  await snapshot('01-indicator-scenes')
  await click('加入场景');await pause(300)
  assert.ok((await evaluate(`document.querySelector('.el-dialog').innerText`)).includes('无需选择草稿版本'))
  await snapshot('02-join-scenes')
  await evaluate(`Array.from(document.querySelectorAll('.scenario-choice')).find(row=>row.textContent.includes('医疗质量监测')).querySelector('input[type=checkbox]').click()`);await pause(100)
  const confirmJoin=await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim().startsWith('确认加入')).textContent.trim()`)
  await click(confirmJoin);await ready();await pause(400)
  await until(()=>evaluate(`!document.querySelector('.el-dialog')?.getClientRects().length`),'join dialog closed')
  let submitted=await writes();assert.deepEqual(submitted.map(call=>call.method),['POST','PUT'])
  assert.equal(submitted[0].body.copyFromVersionId,'901')
  assert.equal(submitted[1].body.indicators[0].periodType,'QUARTERLY')
  assert.ok(await evaluate(`!window.__scenarioFixture.versions['901'].indicators.some(row=>row.indicatorVersionId==='${TARGET}')`))
  await snapshot('03-pending-changes')
  await snapshot('04-mobile-scenes',390,1000)
  await snapshot('05-desktop-scenes',1440,1150)
  await click('撤销加入',rowRoot('医疗质量监测'));await pause(250);await click('确认',"document.querySelector('.el-message-box')");await ready();await pause(300)
  await until(()=>evaluate(`!Array.from(document.querySelectorAll('.association-row')).some(row=>row.textContent.includes('医疗质量监测'))`),'undo addition')
  await click('撤销移出',rowRoot('运营效率分析'));await pause(250);await click('确认',"document.querySelector('.el-message-box')");await ready();await pause(300)
  const restored=await evaluate(`window.__scenarioFixture.versions['907'].indicators.find(row=>row.indicatorVersionId==='${TARGET}')`)
  assert.equal(restored.periodType,'QUARTERLY')
  submitted=await writes();const beforeLast=submitted.length
  await click('移出场景',rowRoot('单指标示例'));await pause(150)
  assert.ok((await evaluate(`document.querySelector('.association-card').innerText`)).includes('最后一个指标'))
  assert.equal((await writes()).length,beforeLast)
  await click('移出场景',rowRoot('住院服务分析'));await pause(250);await click('确认',"document.querySelector('.el-message-box')");await ready();await pause(350)
  await click('查看变更',rowRoot('住院服务分析'))
  await until(()=>evaluate(`!!document.querySelector('.scenario-tabs') && document.querySelector('.scenario-change-summary')?.innerText.includes('移出 1 个指标')`),'scene change summary')
  const beforeReview=(await writes()).length
  await click('发布变更');await pause(300)
  assert.equal((await writes()).length,beforeReview,'Reviewing must not publish or save')
  assert.ok((await evaluate(`document.querySelector('.el-dialog').innerText`)).includes('其他人员保存的变更'))
  await snapshot('06-publication-review')
  await click('返回核对');await pause(350)
  assert.equal((await writes()).length,beforeReview)
  await click('发布变更');await pause(250);await click('确认发布');await pause(500)
  await until(()=>evaluate(`document.querySelector('.scenario-editor')?.innerText.includes('已发布版本')`),'published')
  submitted=await writes()
  assert.equal(submitted.filter(call=>call.path.endsWith('/publish')).length,1)
  assert.ok(submitted.slice(-4).map(call=>call.method).join(',')==='PATCH,PUT,POST,POST')
  const active=await evaluate(`(()=>{const f=window.__scenarioFixture,scene=f.masters.find(row=>row.id==='802');return JSON.parse(JSON.stringify(f.versions[scene.currentPublishedVersionId]))})()`)
  assert.ok(!active.indicators.some(row=>row.indicatorVersionId===TARGET))
  assert.ok(await evaluate(`window.__scenarioFixture.versions['903'].indicators.some(row=>row.indicatorVersionId==='${TARGET}')`),'Historical published snapshot must remain')
  await snapshot('07-published-scene')
  assert.deepEqual(errors,[])
  await writeFile(`${directory}/summary.json`,JSON.stringify({checks:['exact published indicator version','automatic draft copy','pending vs active','undo addition/removal','preserved period and scope','last binding guard without writes','read-only publication review','single explicit publication','historical snapshot retained','desktop and mobile'],writes:submitted,errors},null,2))
  console.log('PASS: complete scenario association preview flow, automatic draft, undo, last-binding guard, review/cancel/publish, immutable history and responsive layouts. All APIs mocked; no server writes.')
}finally{socket?.close();chrome.kill()}
