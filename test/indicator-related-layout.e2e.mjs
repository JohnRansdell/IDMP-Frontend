import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-indicator-related-'))
// Run against the local Vite server; all API requests below use fixtures.
const port = 41939
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
const baseline = process.env.IDMP_LAYOUT_BASELINE === '1'
const evidence = '.tmp/indicator-related-layout'
try {
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}))
  socket.addEventListener('message', event => {
    const data=JSON.parse(event.data)
    if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails)
    const request=pending.get(data.id)
    if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__relatedCalls=[];window.__relatedEmpty=false;
    const original=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      const url=new URL(String(input),location.origin),path=url.pathname.replace('/api/v1','');
      if(!url.pathname.startsWith('/api/v1/'))return original(input,init);
      const method=init.method||'GET';window.__relatedCalls.push({path,method,body:init.body?JSON.parse(init.body):undefined});
      let data=[];
      if(path==='/auth/refresh') return new Response(JSON.stringify({code:'COMMON-40100',message:'登录已过期'}),{status:401,headers:{'Content-Type':'application/json'}});
      if(path==='/auth/me')data={user:{id:'1',username:'layout-fixture',roles:['ADMIN']},roles:['ADMIN'],menus:[],apiRules:[]};
      else if(path==='/indicators/1')data={id:'1',name:'住院患者医疗质量指标',status:'PUBLISHED',currentPublishedVersionId:'2'};
      else if(path==='/indicators/1/versions')data=[{id:'2',indicatorId:'1',versionNo:1,status:'PUBLISHED'}];
      else if(path==='/indicator-versions/2')data={id:'2',indicatorId:'1',versionNo:1,status:'PUBLISHED',formula:{root:{nodeType:'CONST',value:1}}};
      else if(path==='/indicators/1/scenarios')data={records:[],total:0};
      else if(path==='/mappings/indicator-versions/2/policy-references') {
        if(method==='POST')data={};
        else data=window.__relatedEmpty?[]:[{id:'9',policyFileVersionId:'8',policyFileName:'国家医疗质量安全改进目标与住院患者诊疗服务管理实施细则（试行）'.repeat(2),relationRole:'SOURCE',resourceVersion:0}];
      }
      else if(path==='/mappings/by-indicator-version/2')data=window.__relatedEmpty?[]:[{id:'3',name:'住院患者医疗质量与医疗服务能力评价指标对应关系'.repeat(3),mappingType:'完全一致',comparability:'可直接比较'}];
      else if(path==='/meta/policy-file-versions/published')data={records:[{id:'8',policyFileName:'国家医疗质量安全改进目标与住院患者诊疗服务管理实施细则',versionNo:1}],total:1};
      return new Response(JSON.stringify({code:'OK',data}),{status:200,headers:{'Content-Type':'application/json'}});
    };
  })()`})
  await send('Page.navigate',{url:(process.env.IDMP_FRONTEND_URL||'http://127.0.0.1:5174')+'/__indicator-related-layout__'})
  await until(()=>evaluate(`document.readyState==='complete' && location.protocol==='http:'`),'page ready')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const viewSource=await(await fetch('/src/idmp/views/IndicatorDetail.vue')).text();
    const routerModule=viewSource.match(/from "([^\\"]*vue-router[^\\"]*)"/)[1];
    const {createRouter,createMemoryHistory}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Detail}=await import('/src/idmp/views/IndicatorDetail.vue');
    const {setAccessToken}=await import('/src/idmp/api/request.js');
    const session=await import('/src/idmp/auth/session.js');
    const {createAccessDirective}=await import('/src/idmp/auth/accessDirective.js');
    document.querySelector('#app')?.__vue_app__?.unmount();
    setAccessToken('layout-fixture');await session.hydrateCurrentUser();
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/indicator/detail/:id',name:'IndicatorDetail',component:{render:()=>null}},{path:'/mapping/:id',name:'IndicatorMappingDetail',component:{render:()=>null}}]});
    await router.push('/indicator/detail/1');await router.isReady();window.__relatedRouter=router;
    document.body.innerHTML='<main id="related-layout-test" style="padding:24px;max-width:1200px;margin:auto"></main>';
    const detail=ref();window.__relatedDetail=detail;window.__relatedState=()=>detail.value.$.setupState;
    const app=createApp({render:()=>h(Detail,{ref:detail})});app.config.globalProperties.$can=session.canRequest;
    app.directive('access',createAccessDirective(session.canRequest));app.use(router).use(ElementPlus).mount('#related-layout-test');
  })()`)
  await until(()=>evaluate(`window.__relatedState()?.policyReferences.length===1 && window.__relatedState()?.mappingReferences.length===1`),'related records')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()==='更多关联').click()`)
  await until(()=>evaluate(`!!document.querySelector('.el-drawer .policy-card')`),'drawer open')
  await mkdir(evidence,{recursive:true})
  const metrics=[]
  for(const viewport of [{width:1440,height:1080,mobile:false},{width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await pause(400)
    await evaluate(`document.querySelector('.el-drawer__body').scrollTop=0`)
    const result=await evaluate(`(()=>{
      const drawer=document.querySelector('.el-drawer'),body=drawer.querySelector('.el-drawer__body');
      const cards=Array.from(drawer.querySelectorAll('.policy-card,.version-mapping-links')).map(card=>{
        const rect=card.getBoundingClientRect(),title=card.querySelector('h2,h3').getBoundingClientRect();
        return {left:rect.left,right:rect.right,width:rect.width,titleInset:title.left-rect.left,titleTop:title.top-rect.top,padding:parseFloat(getComputedStyle(card).paddingLeft)};
      });
      return {width:innerWidth,bodyWidth:body.clientWidth,bodyScroll:body.scrollWidth,cards};
    })()`)
    metrics.push(result)
    if(!baseline){
      assert.equal(result.cards.length,2)
      assert.ok(result.cards.every(card=>card.padding>=14 && card.titleInset>=14 && card.titleTop>=14),JSON.stringify(result))
      assert.ok(result.bodyScroll<=result.bodyWidth+1,JSON.stringify(result))
      assert.ok(result.cards.every(card=>card.left>=0 && card.right<=result.width+1),JSON.stringify(result))
    }
    await writeFile(`${evidence}/${baseline?'before':'after'}-${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    await evaluate(`document.querySelector('.el-drawer__body').scrollTop=document.querySelector('.el-drawer__body').scrollHeight`);await pause(150)
    await writeFile(`${evidence}/${baseline?'before':'after'}-${viewport.mobile?'mobile':'desktop'}-bottom.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  if(!baseline){
    const tableScroll = await evaluate(`Array.from(document.querySelectorAll('.related-table .el-scrollbar__wrap')).map(wrap=>{wrap.scrollLeft=wrap.scrollWidth;return {left:wrap.scrollLeft,width:wrap.clientWidth,total:wrap.scrollWidth}})`)
    assert.equal(tableScroll.length,2)
    assert.ok(tableScroll.every(wrap=>wrap.total>wrap.width && wrap.left>0),'Narrow tables must scroll horizontally to reveal actions')
    await evaluate(`document.querySelector('.version-mapping-links .el-table__body button').click()`)
    await until(()=>evaluate(`window.__relatedRouter.currentRoute.value.name==='IndicatorMappingDetail'`),'mapping navigation')
    assert.equal(await evaluate(`window.__relatedRouter.currentRoute.value.params.id`),'3')
    await evaluate(`window.__relatedState().policyReferenceForm.policyFileVersionId='8'`)
    await evaluate(`document.querySelector('.policy-reference-editor input[placeholder="政策出处（可选）"]').value='第三章';document.querySelector('.policy-reference-editor input[placeholder="政策出处（可选）"]').dispatchEvent(new Event('input',{bubbles:true}))`)
    await pause(100)
    await evaluate(`document.querySelector('.related-form-actions button').click()`)
    await until(()=>evaluate(`window.__relatedCalls.some(call=>call.method==='POST' && call.path==='/mappings/indicator-versions/2/policy-references')`),'add reference')
    const writes=await evaluate(`window.__relatedCalls.filter(call=>call.method==='POST' && call.path.startsWith('/mappings/'))`)
    assert.equal(writes.length,1)
    assert.equal(writes[0].body.policyFileVersionId,'8')
    assert.equal(writes[0].body.relationRole,'SOURCE')
    assert.equal(writes[0].body.citationLocation,'第三章')
    await evaluate(`window.__relatedEmpty=true;Promise.all([window.__relatedState().loadPolicyReferences('2'),window.__relatedState().loadMappingReferences('2')])`)
    assert.ok((await evaluate(`document.querySelector('.el-drawer').innerText`)).includes('暂无有效政策引用'))
    assert.ok((await evaluate(`document.querySelector('.el-drawer').innerText`)).includes('暂无有效映射'))
    await writeFile(`${evidence}/after-empty-mobile.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await writeFile(`${evidence}/${baseline?'before':'after'}-metrics.json`,JSON.stringify({metrics,errors},null,2))
  assert.deepEqual(errors,[])
  console.log(baseline?'BASELINE captured':'PASS: related drawer spacing, separate cards, long names, desktop/mobile, empty states, unchanged policy reference submission. APIs mocked; no server writes.')
} finally {socket?.close();chrome.kill()}
