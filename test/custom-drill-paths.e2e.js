import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-custom-paths-'))
const debugPort = 41827
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await delay(100) }
  throw new Error('Browser condition timed out')
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173' })
  await waitFor(() => evaluate(`document.readyState==='complete'`))
  await evaluate(`(async () => {
    const {createApp, h, ref} = await import('/node_modules/.vite/deps/vue.js');
    const {default: ElementPlus} = await import('/node_modules/.vite/deps/element-plus.js');
    const {default: Grouping} = await import('/src/idmp/components/SqlImportGroupingFields.vue');
    const paths=ref([]), factors=ref([{key:'total',name:'入院总人次',dimensionBindings:{}}]);
    window.__customPaths=paths; window.__customFactors=factors;
    document.body.innerHTML='<main id="custom-test" style="padding:20px;box-sizing:border-box;max-width:1200px;margin:auto"></main>';
    createApp({render:()=>h(Grouping,{drillPaths:paths.value,factors:factors.value,drafts:[{key:'total',dimensionFieldOptions:[{fieldReference:'b.dept_code',physicalTable:'admissions',columnName:'dept_code'}]}],catalog:[],dimensionGrain:[], 'onUpdate:drillPaths':value=>paths.value=value,'onUpdate:factors':value=>factors.value=value})}).use(ElementPlus).mount('#custom-test');
  })()`)
  await waitFor(() => evaluate(`!!document.querySelector('[aria-label="自定义业务下钻路径"]')`))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('添加路径')).click()`)
  await waitFor(() => evaluate(`document.querySelectorAll('.custom-level').length===1`))
  const setInput = async (label, value, index = 0) => evaluate(`(() => { const input=document.querySelectorAll('input[aria-label=${JSON.stringify(label)}]')[${index}]; input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
  await setInput('自定义路径名称', '科室医生下钻')
  await setInput('层级名称', '科室')
  await setInput('层级维度名称', '科室')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('添加层级')).click()`)
  await waitFor(() => evaluate(`document.querySelectorAll('.custom-level').length===2`))
  await setInput('层级名称', '医生', 1)
  await setInput('层级维度名称', '医生', 1)
  const before = await evaluate(`window.__customPaths.value[0].levels.map(level=>level.levelCode)`)
  await evaluate(`document.querySelectorAll('button[aria-label="上移层级"]')[1].click()`)
  await waitFor(() => evaluate(`window.__customPaths.value[0].levels[1].levelName==='医生'`))
  const reordered = await evaluate(`window.__customPaths.value[0].levels.map(level=>level.levelCode)`)
  assert.deepEqual(reordered, [before[0], before[2], before[1]])
  await evaluate(`document.querySelectorAll('button[aria-label="下移层级"]')[0].click()`)
  const payload = await evaluate(`(async()=>{const {serializeDrillPaths,sqlImportGroupingFields}=await import('/src/idmp/features/indicator/grouping.js');return {paths:serializeDrillPaths(window.__customPaths.value),fields:sqlImportGroupingFields(window.__customPaths.value)}})()`)
  assert.deepEqual(payload.fields, ['科室', '医生'])
  assert.equal(payload.paths[0].pathName, '科室医生下钻')
  assert.equal(payload.paths[0].maxLevel, before[2])
  await evaluate(`document.querySelector('.binding-grid .el-select').click()`)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item=>item.textContent.includes('dept_code'))`))
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item=>item.textContent.includes('dept_code')).click()`)
  await waitFor(() => evaluate(`window.__customFactors.value[0].dimensionBindings['科室']==='b.dept_code'`))
  await mkdir('.tmp/custom-drill-paths', { recursive: true })
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, mobile: width < 500, deviceScaleFactor: 1 })
    await delay(200)
    assert.equal(await evaluate(`document.querySelector('#custom-test').scrollWidth<=innerWidth`), true)
    const fields = await evaluate(`Array.from(document.querySelectorAll('.custom-level input')).map(input=>{const field=input.getBoundingClientRect(),parent=input.closest('.el-form-item').getBoundingClientRect();return {left:field.left,right:field.right,parentLeft:parent.left,parentRight:parent.right}})`)
    assert.ok(fields.every(field => field.left >= field.parentLeft && field.right <= field.parentRight + 1))
    await writeFile(`.tmp/custom-drill-paths/${width}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  await evaluate(`document.querySelector('button[aria-label="删除路径"]').click()`)
  await waitFor(() => evaluate(`window.__customPaths.value.length===0`))
  await evaluate(`(async () => {
    const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
    const {createRouter,createMemoryHistory}=await import('/node_modules/.vite/deps/vue-router.js');
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Drill}=await import('/src/idmp/features/analysis/DrillExplorer.vue');
    const paths=[{pathCode:'CUSTOM_DEPT_DOCTOR',pathName:'科室医生',maxLevel:'DOCTOR',levels:[{levelCode:'ROOT',levelName:'全院'},{levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室'},{levelCode:'DOCTOR',levelName:'医生',dimensionFieldCode:'医生'}]},
      {pathCode:'CUSTOM_DISEASE_DEPT',pathName:'病种科室',maxLevel:'DEPT',levels:[{levelCode:'ROOT',levelName:'全院'},{levelCode:'DISEASE',levelName:'病种',dimensionFieldCode:'病种'},{levelCode:'DEPT',levelName:'科室',dimensionFieldCode:'科室'}]}];
    window.__drillRequests=[];
    const realFetch=window.fetch;
    window.fetch=async (url,options)=>{
      if(!String(url).includes('/drill/search')) return realFetch(url,options);
      const request=JSON.parse(options.body);window.__drillRequests.push(request);
      const path=paths.find(path=>path.pathCode===request.pathCode),index=path.levels.findIndex(level=>level.levelCode===request.currentLevel);
      if(index<0) throw new Error('Incorrect initial custom level');
      const level=path.levels[index];
      return new Response(JSON.stringify({code:'OK',data:{context:{resultId:'21',snapshotId:'31',currentLevel:level.levelCode},summary:{displayValue:'50%',numerator:2,denominator:4},
        columns:[{field:'dimensionName',label:level.levelName}],records:[{resultId:'21',levelCode:level.levelCode,dimensionName:level.levelName,dimensionKey:index===0?'ROOT':'A'}],
        breadcrumb:path.levels.slice(0,index).map(item=>({levelCode:item.levelCode,displayValue:item.levelName,key:item.levelCode==='ROOT'?'ROOT':'A'})),
        nextLevels:path.levels[index+1]?[path.levels[index+1].levelCode]:[],pageInfo:{total:1,pageNum:1,pageSize:20}}}),{status:200});
    };
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});
    await router.push('/');await router.isReady();
    document.body.innerHTML='<main id="drill-test"></main>';
    createApp({render:()=>h(Drill,{resultId:'11',configuredPaths:paths,embedded:true})}).use(router).use(ElementPlus).mount('#drill-test');
  })()`)
  await waitFor(() => evaluate(`window.__drillRequests.length>0 && document.querySelector('.drill-breadcrumb__current')?.textContent==='全院'`))
  assert.equal((await evaluate(`window.__drillRequests.at(-1)`)).pathCode, 'CUSTOM_DEPT_DOCTOR')
  const nextLevel = async () => {
    await evaluate(`Array.from(document.querySelectorAll('#drill-test button')).find(button=>button.textContent.includes('查看下一级')).click()`)
  }
  await nextLevel()
  await waitFor(() => evaluate(`document.querySelector('.drill-breadcrumb__current')?.textContent==='科室'`))
  await nextLevel()
  await waitFor(() => evaluate(`document.querySelector('.drill-breadcrumb__current')?.textContent==='医生'`))
  assert.deepEqual((await evaluate(`window.__drillRequests.at(-1)`)).parentKeys, { 科室: 'A' })
  await evaluate(`document.querySelector('.drill-breadcrumb__item').click()`)
  await waitFor(() => evaluate(`document.querySelector('.drill-breadcrumb__current')?.textContent==='全院'`))
  await evaluate(`document.querySelector('#drill-test .el-select').click()`)
  await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item=>item.textContent==='病种科室')`))
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item=>item.textContent==='病种科室').click()`)
  await waitFor(() => evaluate(`window.__drillRequests.at(-1)?.pathCode==='CUSTOM_DISEASE_DEPT'`))
  assert.deepEqual((await evaluate(`window.__drillRequests.at(-1)`)).parentKeys, {})
  assert.deepEqual(errors, [])
  console.log('Custom path editing, mapping, desktop/mobile layout, initial root, drill-down, breadcrumb and path switching passed')
} finally { socket?.close(); chrome.kill() }
