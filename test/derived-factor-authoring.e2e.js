import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appPort = 41781, debugPort = 41782
const profile = await mkdtemp(join(tmpdir(), 'idmp-derived-authoring-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(100) } throw new Error(`Timed out: ${label}`) }
let socket, nextId = 0
const pending = new Map()
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails)); return data.result.value }
function fixture() {
  localStorage.setItem('idmp_access_token', 'derived-authoring-fixture')
  const original = window.fetch.bind(window)
  const output = { valueType:'DECIMAL', semanticKind:'MEASURE', dimension:'SUM', grain:[] }
  const sources = ['药品费用', '耗材费用'].map((factorName, i) => ({ id:String(101+i), factorName, factorCode:`COST_${i}`, status:'PUBLISHED', versionNo:1, currentArtifactId:String(401+i), calculationMode:'TEMPORAL' }))
  let saved, compiled = false, published = false
  window.__requests = []
  window.fetch = async (input, init = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname.replace('/api/v1', '')
    if (!new URL(typeof input === 'string' ? input : input.url, location.href).pathname.startsWith('/api/v1/')) return original(input, init)
    const body = init.body ? JSON.parse(init.body) : null
    window.__requests.push({ path, method:init.method || 'GET', body })
    let data = []
    if (path === '/auth/me') data = { user:{id:'1',username:'tester'},roles:['SYSTEM_ADMIN'],permissions:[],menus:[] }
    else if (path === '/factor-versions') data = { records:sources,total:2,pageNum:1,pageSize:100 }
    else if (path === '/factors' && body) { saved=body; data={id:'200',draftVersionId:'201',status:'DRAFT'} }
    else if (path === '/factors/200') data={id:'200',code:saved.code,name:saved.name,draftVersionId:'201',status:published?'PUBLISHED':'DRAFT'}
    else if (path === '/factors/200/versions') data=[{id:'201',status:published?'PUBLISHED':'DRAFT',versionNo:1}]
    else if (path === '/factor-versions/201') data={id:'201',factorId:'200',dsl:saved.dsl,status:published?'PUBLISHED':compiled?'VALIDATED':'DRAFT',...(compiled?{currentArtifactId:'301'}:{})}
    else if (path === '/factor-versions/201/compile') { compiled=true;data={artifactId:'301',status:'VALID'} }
    else if (path === '/factor-versions/201/trial-period-recommendation') data={availabilityStatus:'AVAILABLE',recommendedPeriodStart:'2026-01-01T00:00:00',recommendedPeriodEnd:'2026-02-01T00:00:00'}
    else if (path === '/factor-versions/201/trial') data={batchId:'501',status:'SUCCEEDED'}
    else if (path === '/factor-versions/201/trials/501/results') data={valueDecimal:'100016070.36',status:'SUCCEEDED',qualityStatus:'PASSED'}
    else if (path === '/factor-versions/201/publish') { published=true;data={status:'PUBLISHED'} }
    else if (path.startsWith('/compile-artifacts/')) data={outputDescriptor:saved && path.endsWith('/301')?saved.dsl.output:output,logicalPlan:{},parameterSchema:{parameters:[]},resourceProfile:{calculationMode:'TEMPORAL'}}
    else if (/^\/factor-versions\/(101|102)$/.test(path)) { const item=sources.find(row=>path.endsWith('/'+row.id)); data={...item,dsl:{primaryDomain:{tableName:'vmq_basicinformationba'},calculationMode:'TEMPORAL',output}} }
    return new Response(JSON.stringify({code:'OK',data}),{status:200,headers:{'Content-Type':'application/json'}})
  }
}
async function click(label) { await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(label)}).click()`) }
async function choose(id, text) {
  await evaluate(`document.querySelector(${JSON.stringify(id)}).closest('.el-select').querySelector('.el-select__wrapper').click()`)
  await until(()=>evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.getBoundingClientRect().height && el.textContent.includes(${JSON.stringify(text)}))`),'factor option')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el=>el.getBoundingClientRect().height && el.textContent.includes(${JSON.stringify(text)})).click()`)
  await until(()=>evaluate(`!Array.from(document.querySelectorAll('.el-select-dropdown')).some(el=>el.getBoundingClientRect().height)`),'close factor picker')
}
const errors = []
try {
  await mkdir('.tmp/derived-authoring', {recursive:true})
  await until(async()=>{try{return (await fetch(`http://127.0.0.1:${appPort}`)).ok}catch{return false}},'Vite')
  let target
  await until(async()=>{try{target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(p=>p.type==='page');return !!target}catch{return false}},'Chrome')
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}))
  socket.addEventListener('message',event=>{const response=JSON.parse(event.data);if(response.method==='Runtime.exceptionThrown')errors.push(response.params.exceptionDetails.text);const request=pending.get(response.id);if(request){pending.delete(response.id);response.error?request.reject(Error(response.error.message)):request.resolve(response.result)}})
  await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${fixture.toString()})()`})
  await send('Page.navigate',{url:`http://127.0.0.1:${appPort}/factor/edit/new`})
  await until(()=>evaluate(`!!document.querySelector('.definition-kind-selector')`),'factor editor')
  await evaluate(`Array.from(document.querySelectorAll('.definition-kind-selector .el-radio-button')).find(el=>el.textContent.trim()==='复合因子').click()`)
  await until(()=>evaluate(`!!document.querySelector('#derived-left-factor')`),'simple derived form')
  await choose('#derived-left-factor','药品费用');await choose('#derived-right-factor','耗材费用')
  await until(()=>evaluate(`document.querySelector('.derived-editor .formula-preview').textContent.includes('耗材费用') && !document.querySelector('.derived-editor').textContent.includes('正在核对引用因子')`),'metadata')
  assert.equal(await evaluate(`document.querySelector('.advanced-settings').open`),false)
  for (const viewport of [{width:1440,height:1000,mobile:false},{width:390,height:844,mobile:true}]) {
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1})
    await evaluate(`document.querySelector('.derived-editor').scrollIntoView({block:'center'})`);await pause(100)
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false)
    await writeFile(`.tmp/derived-authoring/${viewport.mobile?'mobile':'desktop'}.png`,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await evaluate(`document.querySelector('input[placeholder="请输入因子名称"]').value='验收_药品耗材合计';document.querySelector('input[placeholder="请输入因子名称"]').dispatchEvent(new Event('input',{bubbles:true}))`)
  await click('保存草稿并继续')
  await until(()=>evaluate(`location.pathname==='/factor/edit/200' && !!document.querySelector('.workflow-actions')`),'saved draft without domain')
  const saved=await evaluate(`window.__requests.find(r=>r.path==='/factors'&&r.method==='POST').body.dsl`)
  assert.deepEqual(saved.primaryDomain,{})
  assert.equal(saved.output.dimension,'SUM');assert.equal(saved.output.unit,undefined)
  assert.equal(saved.expression.left.factorVersionId,'101');assert.equal(saved.expression.right.factorVersionId,'102')
  await click('编译并校验')
  await until(()=>evaluate(`!document.querySelector('.workflow-actions button').classList.contains('is-loading') && Array.from(document.querySelectorAll('.workflow-actions button')).some(el=>el.textContent.trim()==='试算并查看结果'&&!el.disabled)`),'compiled')
  await click('试算并查看结果')
  await until(()=>evaluate(`document.querySelector('.trial-results')?.textContent.includes('100016070.36')`),'trial result')
  await click('发布因子版本');await until(()=>evaluate(`!!document.querySelector('.el-message-box')`),'confirmation');await click('确认发布')
  await until(()=>evaluate(`document.querySelector('.published-next')?.textContent.includes('因子版本已发布')`),'published')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.page-toolbar button')).find(el=>el.textContent.trim()==='保存修改').disabled`),true)
  assert.equal(await evaluate(`document.querySelector('.page-toolbar').textContent.includes('技术信息')`),false)
  await click('更多')
  await until(()=>evaluate(`!!Array.from(document.querySelectorAll('.el-dropdown-menu__item')).find(el=>el.textContent.trim()==='技术信息（只读）')`),'more menu')
  await evaluate(`Array.from(document.querySelectorAll('.el-dropdown-menu__item')).find(el=>el.textContent.trim()==='技术信息（只读）').click()`)
  await until(()=>evaluate(`!!document.querySelector('.dsl-preview')?.getBoundingClientRect().height`),'readonly technical information')
  assert.deepEqual(errors,[])
  console.log('PASS: ordinary derived addition from domainless physical factors, automatic compatible metadata, desktop/mobile, save/compile/trial/publish and readonly technical information under More; mocked API only')
} catch(error) {
  if(socket?.readyState===WebSocket.OPEN) {await writeFile('.tmp/derived-authoring/failure.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64')); console.error(await evaluate(`document.body.innerText`))}
  throw error
} finally { socket?.close();chrome.kill();server.kill() }
