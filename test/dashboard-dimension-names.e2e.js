import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

// A component integration check with isolated API fixtures, never live writes.
const appPort = 41865
const debugPort = 41866
const profile = await mkdtemp(join(tmpdir(), 'idmp-department-names-'))
const server = spawn(process.execPath, [join(process.cwd(), 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let chrome, socket, sequence = 0
const pending = new Map()
async function waitFor(predicate, label) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await pause(200) }
  throw new Error(`Timed out: ${label}`)
}
function send(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const readLabels = id => evaluate(`(()=>{const dom=document.querySelector('#${id} .idmp-chart');const chart=dom?.__vueParentComponent;return chart?.props.option?.series?.[0]?.data?.map(row=>row.name)})()`)
const clickSlice = id => evaluate(`(()=>{const owner=document.querySelector('#${id} .idmp-chart').__vueParentComponent;const point=owner.props.option.series[0].data[0];owner.emit('chart-click',{name:point.name,dataIndex:0,data:point});})()`)

try {
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}/`)).ok } catch { return false } }, 'Vite server')
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions',
    '--disable-background-networking', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--in-process-gpu', '--disable-features=Vulkan', 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' })
  let target
  await waitFor(async () => { try { target = (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json())).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result)
  })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,options={})=>{
      const url=String(input?.url||input);
      if(!url.includes('/api/v1/'))return originalFetch(input,options);
      const data=window.__departmentDrillHandler?window.__departmentDrillHandler(url,options):{};
      return new Response(JSON.stringify({code:'OK',data}),{status:200,headers:{'Content-Type':'application/json'}});
    };
  ` })
  await send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` })
  await waitFor(() => evaluate(`!!document.querySelector('#app')`), 'app shell')
  await evaluate(`(async()=>{
    const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:BindingWidget}=await import('/src/idmp/features/dashboard/components/BindingWidget.vue');
    const {normalizeDepartmentDataset}=await import('/src/idmp/features/dashboard/dimensionNames.js');
    const {createFieldCatalog}=await import('/src/idmp/features/dashboard/fieldCatalog.js');
    window.__departmentCharts=await import('/node_modules/.vite/deps/echarts.js');
    const path={pathCode:'CUSTOM_TCM_DEPT_DOCTOR',maxLevel:'DOCTOR',levels:[
      {levelCode:'ROOT',levelName:'全院'},
      {levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室',memberKeyFieldCode:'科室',displayFieldCode:'科室名称'},
      {levelCode:'DOCTOR',levelName:'医生',dimensionFieldCode:'医生',memberKeyFieldCode:'医生',displayFieldCode:'医生名称'}]};
    window.__departmentRequests=[];
    window.__departmentDrillHandler=(url,options)=>{
      if(!url.includes('/drill/search'))return {};
      const payload=JSON.parse(options.body);window.__departmentRequests.push(payload);
      const records=payload.currentLevel==='ROOT'?[{resultId:'root',levelCode:'ROOT',dimensionKey:'hospital',dimensionName:'医院'}]
        :payload.currentLevel==='DEPT'?[{resultId:'dept',levelCode:'DEPT',dimensionKey:'791',dimensionName:'791',dimensions:{科室:'791',科室名称:'血管外科'},numerator:12,denominator:60,displayValue:'20%'}]
        :[{resultId:'doctor',levelCode:'DOCTOR',dimensionKey:'D1',dimensionName:'D1',dimensions:{医生:'D1',医生名称:'王医生'},numerator:12,denominator:60,displayValue:'20%'}];
      return {context:{resultId:'root',snapshotId:'snapshot',indicatorVersionId:'version',pathCode:path.pathCode,currentLevel:payload.currentLevel,parentKeys:payload.parentKeys},
        records,nextLevels:payload.currentLevel==='DEPT'?['DOCTOR']:[],pageInfo:{pageNum:payload.pageNum,pageSize:payload.pageSize,total:1}};
    };
    window.fetch=async(input,options={})=>new Response(JSON.stringify({code:'OK',data:window.__departmentDrillHandler(String(input?.url||input),options)}),{status:200,headers:{'Content-Type':'application/json'}});
    const rows=[{科室:'791',value:12}];
    const named=normalizeDepartmentDataset({id:'backend',rows,fields:createFieldCatalog(rows)},{paths:[path],names:new Map([['791','血管外科']])});
    const widget=id=>({id,type:'chart',chartKind:'pie',sourceCode:'fixture',config:{dataBinding:{dataset:'backend',dimensions:[{field:'科室'}],measures:[{field:'value',aggregation:'sum'}],series:[],sort:[]},interaction:{clickAction:'drill'}}});
    document.querySelector('#app')?.__vue_app__?.unmount();
    document.body.innerHTML='<main id="department-test" style="display:flex;gap:16px;padding:20px"></main>';
    window.__comparisonActions=[];
    const app=createApp({render:()=>h('div',{style:'display:grid;grid-template-columns:560px 560px;gap:16px'},[
      h('section',{id:'viewer',style:'width:560px;height:450px'},[h(BindingWidget,{widget:widget('viewer'),title:'中药费用比例构成',interactive:true})]),
      h('section',{id:'preview',style:'width:560px;height:450px'},[h(BindingWidget,{widget:widget('preview'),title:'中药费用比例构成 · 编辑预览',designer:true})]),
      h('section',{id:'zero-bar',style:'width:560px;height:450px'},[h(BindingWidget,{widget:{...widget('zero-bar'),chartKind:'bar'},title:'全零科室对比',designer:true})]),
      h('section',{id:'summary-bar',style:'width:560px;height:450px'},[h(BindingWidget,{widget:{...widget('summary-bar'),chartKind:'bar'},title:'只有汇总值的科室对比',designer:true,onAction:action=>window.__comparisonActions.push(action)})])])});
    app.provide('dashboardBindingDatasets',widget=>[widget.id==='zero-bar'?{...named,rows:named.rows.map(row=>({...row,value:0}))}:widget.id==='summary-bar'?{...named,rows:[],comparisonAvailability:{status:'SUMMARY_ONLY'}}:named]);
    app.provide('dashboardSupportsBackendDrill',()=>true);
    app.provide('dashboardResolveWidgetDrill',async()=>({resultId:'root',indicatorVersionId:'version',path,configuredPaths:[path]}));
    app.use(ElementPlus).mount('#department-test');
  })()`)
  await waitFor(async () => (await readLabels('viewer'))?.[0] === '血管外科' && (await readLabels('preview'))?.[0] === '血管外科', 'viewer and preview labels')
  assert.deepEqual(await readLabels('viewer'), ['血管外科'])
  assert.deepEqual(await readLabels('preview'), ['血管外科'])
  await waitFor(()=>evaluate(`document.querySelector('#zero-bar .binding-zero-notice')?.innerText.includes('均为 0')`),'all-zero comparison is displayed')
  assert.equal(await evaluate(`document.querySelector('#zero-bar .idmp-chart').__vueParentComponent.props.option.series[0].data[0].value`),0)
  assert.ok(await evaluate(`document.querySelector('#summary-bar').innerText.includes('当前仅有指标汇总结果')`))
  await evaluate(`Array.from(document.querySelectorAll('#summary-bar button')).find(button=>button.textContent==='改为指标卡').click()`)
  assert.deepEqual(await evaluate(`window.__comparisonActions`),['kpi'])
  await clickSlice('viewer')
  await waitFor(async () => (await readLabels('viewer'))?.[0] === '王医生', 'doctor drill labels')
  await evaluate(`Array.from(document.querySelectorAll('#viewer .backend-chart-drill__path button')).find(button=>button.textContent==='全部科室').click()`)
  await waitFor(async () => (await readLabels('viewer'))?.[0] === '血管外科', 'return to department labels')
  await evaluate(`document.querySelector('#viewer .backend-chart-drill__path button').click()`)
  await waitFor(async () => !(await evaluate(`!!document.querySelector('#viewer .backend-chart-drill')`)) && (await readLabels('viewer'))?.[0] === '血管外科', 'return to original chart labels')
  const requests = await evaluate(`window.__departmentRequests`)
  assert.ok(requests.every(request => request.pathCode === 'CUSTOM_TCM_DEPT_DOCTOR'))
  assert.deepEqual(requests.find(request => request.currentLevel === 'DOCTOR').parentKeys, { 科室: '791' })
  console.log(JSON.stringify({ passed: true, fixture: true, viewer: await readLabels('viewer'), editorPreview: await readLabels('preview'), drillLevels: requests.map(request => request.currentLevel), rawParentCode: '791' }))
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) console.error(await evaluate(`({text:document.body.innerText,requests:window.__departmentRequests,charts:[...document.querySelectorAll('.idmp-chart')].map(el=>({canvas:!!el.querySelector('canvas'),component:el.__vueParentComponent?.type.__name,option:el.__vueParentComponent?.props.option?.series?.[0]?.data}))})`).catch(() => null))
  throw error
} finally {
  socket?.close()
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser closed')) }
  chrome?.kill()
  server.kill()
  await pause(1000)
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
