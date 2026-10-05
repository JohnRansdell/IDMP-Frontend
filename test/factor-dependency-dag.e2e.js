import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.DAG_FRONTEND_URL || 'http://127.0.0.1:5173'
const profile = await mkdtemp(join(tmpdir(), 'idmp-dag-frontend-'))
const port = 41935, pending = new Map(), errors = [], checks = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label, limit = 45000) {
  const end = Date.now() + limit
  while (Date.now() < end) { if (await predicate()) return; await pause(150) }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) { return new Promise((resolve,reject) => {const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))}) }
async function evaluate(expression) {const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(JSON.stringify(response.exceptionDetails));return response.result.value}
const clickText = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(text)})?.click()`)
async function select(selector, text) {
  await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});(root.querySelector('.el-select__wrapper')||root.closest('.el-select')?.querySelector('.el-select__wrapper')||root).click()})()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item=>item.offsetParent!==null&&item.textContent.includes(${JSON.stringify(text)}))`), `select ${text}`)
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item=>item.offsetParent!==null&&item.textContent.includes(${JSON.stringify(text)})).click()`)
  await until(()=>evaluate(`!Array.from(document.querySelectorAll('.el-select-dropdown')).some(item=>item.offsetParent!==null)`),`close select ${text}`)
}
function passed(name) { checks.push(name); console.log(`PASS ${name}`) }
try {
  let target
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item=>item.type==='page');return !!target}catch{return false}},'browser startup')
  socket=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result)}})
  await send('Page.enable');await send('Runtime.enable')
  await send('Page.navigate',{url:appUrl});await until(()=>evaluate(`document.readyState==='complete'`),'page ready')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const editorSource=await(await fetch('/src/idmp/views/FactorEditor.vue')).text();
    const routerModule=editorSource.match(/from "([^"]*vue-router[^\"]*)"/)[1];
    const {createRouter,createMemoryHistory}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Editor}=await import('/src/idmp/views/FactorEditor.vue');
    window.__dagRequests=[];
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{const response=await originalFetch(input,init);if(String(input).includes('/api/v1/'))window.__dagRequests.push({url:String(input),method:init.method||'GET',status:response.status,body:init.body?JSON.parse(init.body):null});return response};
    window.__mountEditor=async(path)=>{
      window.__dagApp?.unmount();
      const router=createRouter({history:createMemoryHistory(),routes:[{path:'/factor/edit/:id',component:{render:()=>null}}]});await router.push(path);await router.isReady();
      document.body.innerHTML='<main id="dag-test" style="max-width:1200px;margin:auto;padding:16px;box-sizing:border-box"></main>';
      const editor=ref();window.__dagEditor=editor;window.__dagRouter=router;
      window.__dagApp=createApp({render:()=>h(Editor,{ref:editor})}).use(router).use(ElementPlus);window.__dagApp.mount('#dag-test');
    };
    await window.__mountEditor('/factor/edit/102027642461800120?factorVersionId=102027642461800121');
  })()`)
  await until(()=>evaluate(`!!document.querySelector('[aria-label="复合因子定义"]') && !!document.querySelector('[aria-label="因子依赖关系"]') && document.querySelectorAll('.bindings__factor').length===0`),'existing derived editor')
  assert.equal(await evaluate(`document.querySelectorAll('.join-config,.measure-cards,.scope-mode').length`),0)
  await until(()=>evaluate(`document.querySelector('[aria-label="因子依赖关系"]').textContent.includes('102027642461800094')`),'dependency graph')
  passed('published derived factor renders formula instead of source-table controls and loads frozen dependencies')
  await until(()=>evaluate(`document.querySelector('[aria-label="运行参数与即时查询"]') || document.querySelector('[aria-label="因子即时查询"] input')`),'runtime params')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.runtimeDeclarations.some(item=>item.code==='patientName')`),'inherited parameter')
  await evaluate(`window.__dagEditor.value.$.setupState.trialPeriod=['2026-01-01T00:00:00','2026-01-02T00:00:00'];window.__dagEditor.value.$.setupState.runtimeValues={patientName:'张'}`)
  await clickText('即时查询')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.queryRows.length>0`),'derived query')
  assert.equal(await evaluate(`Number(window.__dagEditor.value.$.setupState.queryRows[0].factor_value)`),1)
  passed('derived query sends inherited patientName and returns exact 9/9')
  await evaluate(`window.__mountEditor('/factor/edit/new')`)
  await until(()=>evaluate(`!!document.querySelector('[aria-label="因子定义方式"]')`),'new editor')
  await evaluate(`Array.from(document.querySelectorAll('.el-radio-button')).find(item=>item.textContent==='复合因子').click()`)
  await until(()=>evaluate(`!!document.querySelector('[aria-label="复合因子定义"]')`),'derived mode')
  await evaluate(`(()=>{const inputs=document.querySelectorAll('#dag-test .el-form input');inputs[0].value='FRONTEND_DAG_'+Date.now();inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[1].value='复合因子前端联调 '+Date.now();inputs[1].dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.domains.length>0`),'data domains')
  await select('.derived-editor .definition-fields .el-select','住院就诊')
  await select('[aria-label="运算方式"]','除')
  await select('.derived-editor > .expression-node > .node-operand:nth-of-type(2) [aria-label="引用因子版本"]','102027642461800096')
  await select('.derived-editor > .expression-node > .node-operand:nth-of-type(3) [aria-label="引用因子版本"]','102027642461800094')
  await clickText('保存因子定义')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.workflow.versionId && !window.__dagEditor.value.$.setupState.loading.save`),'save derived')
  const created=await evaluate(`(()=>{const state=window.__dagEditor.value.$.setupState;return {factorId:state.workflow.factorId,versionId:state.workflow.versionId}})()`)
  const createRequest=await evaluate(`window.__dagRequests.find(item=>item.method==='POST'&&item.url.endsWith('/factors'))`)
  assert.equal(createRequest.status,200)
  assert.equal(createRequest.body.dsl.definitionKind,'DERIVED')
  assert.equal(createRequest.body.dsl.expression.left.factorVersionId,'102027642461800096')
  assert.equal(createRequest.body.dsl.filters,undefined)
  passed('UI creates and reloads derived ratio with exact upstream version IDs')
  await clickText('编译并校验')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.workflow.compiled&&!window.__dagEditor.value.$.setupState.loading.compile`),'compile')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.runtimeDeclarations.some(item=>item.code==='patientName')`),'new schema')
  await evaluate(`window.__dagEditor.value.$.setupState.trialPeriod=['2026-01-01T00:00:00','2026-01-02T00:00:00'];window.__dagEditor.value.$.setupState.runtimeValues={patientName:'张'}`)
  await clickText('试算并查看结果')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.workflow.resultsLoaded&&!window.__dagEditor.value.$.setupState.loading.trial`),'trial',65000)
  assert.equal(await evaluate(`Number(window.__dagEditor.value.$.setupState.trialRows[0].value ?? window.__dagEditor.value.$.setupState.trialRows[0].valueDecimal)`),1)
  assert.equal(await evaluate(`window.__dagEditor.value.$.setupState.canPublish`),true)
  passed('new derived factor compiles, inherits runtime schema, trials successfully and enables publishing')
  await mkdir('.tmp/frontend-dag-acceptance',{recursive:true})
  for(const width of [1440,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,mobile:width<500,deviceScaleFactor:1});await pause(300)
    assert.equal(await evaluate(`document.querySelector('.derived-editor').scrollWidth<=document.querySelector('.derived-editor').clientWidth+1`),true)
    await writeFile(`.tmp/frontend-dag-acceptance/editor-${width}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'))
  }
  passed('desktop and mobile derived formula controls fit the editor')
  await clickText('发布因子版本')
  await until(()=>evaluate(`!!document.querySelector('.el-message-box')`),'publish confirmation')
  await clickText('确认发布')
  await until(()=>evaluate(`window.__dagEditor.value.$.setupState.workflow.published`),'publish derived')
  assert.ok(await evaluate(`window.__dagRequests.some(item=>item.url.endsWith('/factor-versions/${created.versionId}/publish')&&item.status===200)`))
  passed('UI publishes validated derived version successfully')
  await evaluate(`(async()=>{
    const {requestJson}=await import('/src/idmp/api/request.js');
    const analysis=await requestJson('/analysis/indicators/102027642461800371/analysis?indicatorVersionId=102027642461800372&periodStart=2026-01-01&periodEnd=2026-01-01&granularity=DAILY&sections=OVERVIEW');
    const resultId=String(analysis.overview.resultId);
    const trace=await requestJson('/analysis/results/'+resultId+'/factors');
    const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Tree}=await import('/src/idmp/components/FactorTraceTree.vue');
    window.__dagApp.unmount();document.body.innerHTML='<main id="dag-trace" style="max-width:1200px;margin:auto;padding:16px"></main>';
    window.__dagApp=createApp({render:()=>h(Tree,{resultId,factors:trace.factors})}).use(window.__dagRouter).use(ElementPlus);window.__dagApp.mount('#dag-trace');
  })()`)
  await until(()=>evaluate(`!!document.querySelector('button[title="展开上游因子"]')`),'trace root')
  await evaluate(`document.querySelector('button[title="展开上游因子"]').click()`)
  await until(()=>evaluate(`document.querySelectorAll('.trace-children .trace-row').length>=2`),'first-level trace')
  await evaluate(`document.querySelector('.trace-children button[title="展开上游因子"]').click()`)
  await until(()=>evaluate(`document.querySelectorAll('.trace-children .trace-children .trace-row').length>=2`),'second-level trace')
  const dependencyCalls=await evaluate(`window.__dagRequests.filter(item=>item.url.includes('/factors/')&&item.url.endsWith('/dependencies'))`)
  assert.equal(dependencyCalls.length,2);assert.ok(dependencyCalls.every(item=>item.status===200))
  await evaluate(`document.querySelector('button[title="收起上游因子"]').click()`)
  assert.equal(await evaluate(`document.querySelectorAll('.trace-children').length`),0)
  passed('formal result lineage lazily expands E to C/D to source A/B and collapses')
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,mobile:false,deviceScaleFactor:1})
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Editor}=await import('/src/idmp/views/IndicatorEditor.vue');
    const source=await(await fetch('/src/idmp/views/IndicatorEditor.vue')).text();
    const {createRouter,createMemoryHistory}=await import(source.match(/from "([^"]*vue-router[^\"]*)"/)[1]);
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/indicator/new',component:{render:()=>null}}]});await router.push('/indicator/new');await router.isReady();
    window.__dagApp.unmount();document.body.innerHTML='<main id="indicator-dag-test" style="max-width:1200px;margin:auto;padding:16px"></main>';
    const editor=ref();window.__indicatorDag=editor;
    window.__dagApp=createApp({render:()=>h(Editor,{ref:editor})}).use(router).use(ElementPlus);window.__dagApp.mount('#indicator-dag-test');
  })()`)
  await until(()=>evaluate(`window.__indicatorDag.value.$.setupState.backendEditorFactors.some(item=>item.versionId==='${created.versionId}')`),'published derived selectable in ordinary indicator editor')
  await evaluate(`(async()=>{
    const state=window.__indicatorDag.value.$.setupState;
    state.numeratorFactors=[state.backendEditorFactors.find(item=>item.versionId==='102027642461800121')];
    state.denominatorFactors=[state.backendEditorFactors.find(item=>item.versionId==='102027642461800094')];
    state.indicatorDimensionGrain=['科室'];state.activeTab='formula';
    window.__dagFormula={schemaVersion:'1.0',astType:'INDICATOR_FORMULA',root:{nodeType:'FACTOR_REF',factorVersionId:'102027642461800121',nodeId:'root'},display:{format:'NUMBER',scale:4,multiplier:'1',roundingMode:'HALF_UP'}};
    await state.runDrillCapabilityPreflight(window.__dagFormula);
  })()`)
  await until(()=>evaluate(`document.querySelectorAll('.bindings__factor').length===2`),'source leaf mapping controls')
  assert.deepEqual((await evaluate(`window.__indicatorDag.value.$.setupState.dimensionBindingFactors.map(item=>item.versionId)`)).sort(),['102027642461800094','102027642461800096'])
  await select('.bindings__factor:nth-of-type(1) .el-select','out_dept_code')
  await select('.bindings__factor:nth-of-type(2) .el-select','in_dept_code')
  await evaluate(`window.__indicatorDag.value.$.setupState.runDrillCapabilityPreflight(window.__dagFormula)`)
  const bindings=await evaluate(`window.__indicatorDag.value.$.setupState.activeFactorDimensionBindings()`)
  assert.equal(Object.keys(bindings).length,2)
  assert.ok(Object.values(bindings).every(item=>item['科室']))
  const capabilityRequest=await evaluate(`window.__dagRequests.filter(item=>item.url.endsWith('/indicator-versions/drill-capabilities')).at(-1)`)
  assert.equal(capabilityRequest.status,200)
  assert.deepEqual(capabilityRequest.body.factorDimensionBindings,bindings)
  passed('ordinary indicator editor selects newly published derived versions and preserves both source-leaf bindings in real preflight requests')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const source=await(await fetch('/src/idmp/features/analysis/DrillExplorer.vue')).text();
    const {createRouter,createMemoryHistory}=await import(source.match(/from "([^"]*vue-router[^\"]*)"/)[1]);
    const {default:Drill}=await import('/src/idmp/features/analysis/DrillExplorer.vue');
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});await router.push('/');await router.isReady();
    const originalFetch=window.fetch;
    const response=data=>new Response(JSON.stringify({code:'OK',data}),{status:200});
    window.fetch=async(input,options)=>{
      const url=String(input);
      if(url.includes('/analysis/results/STALE_')&&url.endsWith('/drill/search'))return response({context:{},summary:{},columns:[],records:[],breadcrumb:[],nextLevels:[],pageInfo:{total:0}});
      if(url.endsWith('/analysis/results/STALE_1/factors')){window.__oldTraceStarted=true;return new Promise(resolve=>{window.__releaseOldTrace=()=>resolve(response({context:{resultId:'STALE_1'},factors:[{factorName:'旧结果因子',factorVersionId:'old',expandable:false}]}))})}
      if(url.endsWith('/analysis/results/STALE_2/factors'))return response({context:{resultId:'STALE_2'},factors:[{factorName:'新结果因子',factorVersionId:'new',expandable:false,resultMatched:true,result:{value:2}}]});
      if(url.endsWith('/analysis/results/STALE_3/factors'))return new Response(JSON.stringify({code:'COMMON-50000',message:'java.lang.NullPointerException at Trace.java:42'}),{status:500});
      return originalFetch(input,options);
    };
    window.__dagApp.unmount();document.body.innerHTML='<main id="drill-race"></main>';
    const resultId=ref('STALE_1'),drill=ref();window.__raceResultId=resultId;window.__raceDrill=drill;
    window.__dagApp=createApp({render:()=>h(Drill,{ref:drill,resultId:resultId.value,source:'live'})}).use(router).use(ElementPlus);window.__dagApp.mount('#drill-race');
  })()`)
  await evaluate(`window.__raceDrill.value.$.setupState.showFactorTrace()`)
  await until(()=>evaluate(`window.__oldTraceStarted===true`),'pending old trace')
  await evaluate(`window.__raceResultId.value='STALE_2'`)
  await until(()=>evaluate(`document.querySelector('#drill-race').textContent.includes('新结果因子')`),'new trace')
  await evaluate(`window.__releaseOldTrace()`);await pause(250)
  assert.equal(await evaluate(`document.querySelector('#drill-race').textContent.includes('旧结果因子')`),false)
  passed('DrillExplorer ignores stale lineage responses after switching formal result context')
  await evaluate(`window.__raceResultId.value='STALE_3'`)
  await until(()=>evaluate(`document.querySelector('#drill-race').textContent.includes('因子追溯加载失败')`),'trace error')
  assert.equal(await evaluate(`document.querySelector('#drill-race').textContent.includes('NullPointerException')`),false)
  passed('DrillExplorer reports lineage failures with readable errors instead of crashing')
  assert.deepEqual(errors,[])
  await writeFile('.tmp/frontend-dag-acceptance/summary.json',JSON.stringify({checks,created,requests:await evaluate('window.__dagRequests'),browserErrors:errors},null,2))
  console.log(JSON.stringify({passed:checks.length,created}))
} catch (error) {
  if(socket) console.error(await evaluate(`JSON.stringify({body:document.querySelector('#dag-test,#indicator-dag-test')?.textContent.slice(-1600),indicatorState:window.__indicatorDag?.value?{fields:window.__indicatorDag.value.$.setupState.customGroupingFields,factors:window.__indicatorDag.value.$.setupState.dimensionBindingFactors,status:window.__indicatorDag.value.$.setupState.drillCapability.status}:null,visibleOptions:Array.from(document.querySelectorAll('.el-select-dropdown__item')).filter(item=>item.offsetParent!==null).map(item=>item.textContent).slice(0,12),requests:window.__dagRequests?.slice(-8)})`))
  throw error
} finally {socket?.close();chrome.kill()}
