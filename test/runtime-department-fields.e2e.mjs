import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-runtime-department-'))
const port = 41940
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);window.__departmentReads=[];
    window.fetch=async(input,init={})=>{
      const url=new URL(String(input),location.origin);
      if(!url.pathname.startsWith('/api/v1/'))return original(input,init);
      if(url.pathname==='/api/v1/meta/departments'){
        window.__departmentReads.push(url.search);
        const page=Number(url.searchParams.get('page'));
        const records=page===1?[{code:'0101',name:'测试门诊'},{code:'21',name:'测试住院'}]:[{code:'22',name:'测试外科'}];
        return new Response(JSON.stringify({code:'OK',data:{records,total:3,pageNum:page}}),{headers:{'Content-Type':'application/json'}});
      }
      return new Response(JSON.stringify({code:'COMMON-40100',message:'未登录'}),{status:401,headers:{'Content-Type':'application/json'}});
    };
  })()`})
  await send('Page.navigate',{url:(process.env.IDMP_FRONTEND_URL||'http://127.0.0.1:5174')+'/__runtime-department-test__'})
  await until(()=>evaluate(`document.readyState==='complete' && location.protocol==='http:'`),'page ready')
  await evaluate(`(async()=>{
    const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Fields}=await import('/src/idmp/components/RuntimeParameterFields.vue');
    const {default:Filters}=await import('/src/idmp/features/analysis/ReportDimensionFilters.vue');
    const {default:Analysis}=await import('/src/idmp/views/IndicatorAnalysis.vue');
    const {buildSqlRuntimeParameterValues}=await import('/src/idmp/api/adapters/sqlImport.js');
    document.querySelector('#app')?.__vue_app__?.unmount();
    document.body.innerHTML='<main id="department-test" style="padding:20px;max-width:1100px;margin:auto"><h2>指标分析 · 查询条件</h2><div id="fields"></div></main>';
    const values=ref({patientName:'示例'});window.__departmentValues=values;
    const reportValues=ref({});window.__reportValues=reportValues;
    const reportFields=[{code:'OUT_DEPT_CODE',label:'科室维度',role:'DEPARTMENT'}];
    const declarations=['deptCode','departCode','department','patientName'].map(code=>({code,type:'STRING',displayName:code==='patientName'?'患者姓名':'科室',required:false,parameterMode:'TEMPORARY'}));
    window.__departmentPayload=()=>buildSqlRuntimeParameterValues(declarations,values.value);
    createApp({render:()=>h('section',{class:'instant-query-panel__controls',[Analysis.__scopeId]:''},[
      h(Filters,{fields:reportFields,modelValue:reportValues.value,'onUpdate:modelValue':v=>reportValues.value=v}),
      h(Fields,{declarations,departmentParameterCodes:['deptCode','departCode','department'],showMetadata:false,modelValue:values.value,'onUpdate:modelValue':v=>values.value=v})
    ])}).use(ElementPlus).mount('#fields');
  })()`)
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  const directory='.tmp/runtime-department-layout';await mkdir(directory,{recursive:true})
  for(const [index,code] of ['deptCode','departCode','department'].entries()){
    await evaluate(`document.querySelectorAll('.runtime-parameter-field .el-select__wrapper')[${index}].click()`)
    const listId = await evaluate(`document.querySelectorAll('.runtime-parameter-field .el-select input')[${index}].getAttribute('aria-controls')`)
    await until(()=>evaluate(`Array.from(document.getElementById('${listId}').querySelectorAll('.el-select-dropdown__item')).some(el=>el.offsetHeight && el.textContent.includes('测试门诊'))`),'department options')
    await evaluate(`Array.from(document.getElementById('${listId}').querySelectorAll('.el-select-dropdown__item')).find(el=>el.offsetHeight && el.textContent.includes('测试门诊')).click()`)
    await pause(300)
    assert.equal(await evaluate(`window.__departmentValues.value['${code}']`),'0101')
  }
  assert.equal((await evaluate(`window.__departmentReads`)).length,2,'Dictionary must load all pages and reuse the shared cache')
  assert.deepEqual(await evaluate(`window.__departmentPayload()`),{deptCode:'0101',departCode:'0101',department:'0101',patientName:'示例'})
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.runtime-parameter-field .el-select__selected-item')).filter(el=>el.classList.contains('el-select__placeholder')).map(el=>el.textContent.trim())`),['测试门诊','测试门诊','测试门诊'],'Selected labels must remain names after parent updates')
  const styles=await evaluate(`(()=>{const a=getComputedStyle(document.querySelector('.report-dimension-field label')),b=getComputedStyle(document.querySelector('.runtime-parameter-field label span'));return {dimension:{color:a.color,size:a.fontSize,weight:a.fontWeight},parameter:{color:b.color,size:b.fontSize,weight:b.fontWeight}}})()`)
  assert.deepEqual(styles.parameter,styles.dimension)
  for(const [width,height,label] of [[1440,1000,'desktop'],[390,844,'mobile']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await pause(300)
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'No horizontal page overflow')
    await writeFile(`${directory}/${label}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  const chosen=['长名称的历史科室编码一','0101','21','22','长名称的历史科室编码二']
  for(const width of [1440,1024,390,280]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});await pause(250)
    await evaluate(`window.__reportValues.value={}`);await pause(150)
    const initialHeight=await evaluate(`document.querySelector('.report-dimension-field .el-select__wrapper').getBoundingClientRect().height`)
    await evaluate(`window.__reportValues.value={OUT_DEPT_CODE:${JSON.stringify(chosen)}}`);await pause(300)
    const collapsed=await evaluate(`(()=>{const el=document.querySelector('.report-dimension-field .el-select__wrapper');return {height:el.getBoundingClientRect().height,text:el.innerText}})()`)
    assert.equal(collapsed.height,initialHeight,`Closed multiselect height at width ${width}`)
    assert.ok(await evaluate(`(()=>{const field=document.querySelector('.report-dimension-field').getBoundingClientRect(),control=document.querySelector('.report-dimension-field .el-select__wrapper').getBoundingClientRect();return control.right<=field.right+1})()`),'Long names must not widen the control into neighboring fields')
    assert.match(collapsed.text,/\+\s*4/)
    assert.ok(await evaluate(`(()=>{const wrapper=document.querySelector('.report-dimension-field .el-select__wrapper').getBoundingClientRect();return Array.from(document.querySelectorAll('.report-dimension-field .el-select__selection .el-tag')).every(el=>el.getBoundingClientRect().right<=wrapper.right-8)})()`),'Tags and count must fit inside the control')
    await evaluate(`document.querySelector('.report-dimension-field .el-select__wrapper').click()`);await pause(300)
    const inputSelector='.report-dimension-field .el-select input'
    await evaluate(`(()=>{const input=document.querySelector('${inputSelector}');input.value='很长的科室名称用于搜索';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause(400)
    assert.equal(await evaluate(`document.querySelector('.report-dimension-field .el-select__wrapper').getBoundingClientRect().height`),initialHeight,`Search must also stay one line at width ${width}`)
    assert.deepEqual(await evaluate(`JSON.parse(JSON.stringify(window.__reportValues.value.OUT_DEPT_CODE))`),chosen,'Collapsing must preserve all selected values')
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:10,y:10,button:'left',clickCount:1})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:10,y:10,button:'left',clickCount:1});await pause(300)
    assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'No horizontal overflow with collapsed tags')
    await writeFile(`${directory}/multiselect-${width}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  assert.deepEqual(errors,[])
  console.log('PASS: all three verified parameters select names and submit original scalar codes; full dictionary pagination, shared cache, consistent labels, one-line multiselects while searching, and desktop/mobile layout. APIs mocked.')
} finally {socket?.close();chrome.kill()}
