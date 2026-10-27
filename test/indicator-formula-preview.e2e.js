import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appPort = 41763, debugPort = 41764
const profile = await mkdtemp(join(tmpdir(), 'idmp-indicator-preview-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(100) } throw new Error(`Timed out: ${label}`) }
let socket, nextId = 0
const pending = new Map()
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) { const data = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails)); return data.result.value }
function fixture() {
  localStorage.setItem('idmp_access_token', 'indicator-preview-fixture')
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, options = {}) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    if (!path.startsWith('/api/v1/')) return originalFetch(input, options)
    if (options.method && options.method !== 'GET') throw Error('Preview acceptance must not write business data')
    const factors = [
      { id:'11', factorCode:'A', factorName:'费用总额', publicationStatus:'PUBLISHED', calculationMode:'TEMPORAL' },
      { id:'12', factorCode:'B', factorName:'出院人次', publicationStatus:'PUBLISHED', calculationMode:'TEMPORAL' }
    ]
    let data = { records:[], total:0 }
    if (path.endsWith('/auth/me')) data = { user:{ id:'1', username:'tester' }, roles:['SYSTEM_ADMIN'], permissions:[], menus:[] }
    else if (path.endsWith('/factor-versions')) data = { records:factors, total:factors.length }
    else if (/\/factor-versions\/(11|12)$/.test(path)) data = factors.find(row => path.endsWith('/' + row.id))
    return new Response(JSON.stringify({ code:'OK', data }), { status:200, headers:{ 'Content-Type':'application/json' } })
  }
}

const exceptions = []
const output = '.tmp/indicator-formula-preview'
try {
  await mkdir(output, { recursive:true })
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'Vite')
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return Boolean(target) } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once:true }))
  socket.addEventListener('message', event => {
    const response = JSON.parse(event.data)
    if (response.method === 'Runtime.exceptionThrown') exceptions.push(response.params.exceptionDetails.text)
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result)
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source:`(${fixture.toString()})()` })
  await send('Page.navigate', { url:`http://127.0.0.1:${appPort}/indicator/edit/new` })
  await until(() => evaluate(`!!document.querySelector('.editor-page .el-form')`), 'indicator editor')
  await evaluate(`(() => { let c=document.querySelector('.editor-page').__vueParentComponent; while(c&&c.type.__name!=='IndicatorEditor') c=c.parent; window.__editor=c.setupState; window.__editor.activeTab='formula' })()`)
  await until(() => evaluate(`document.querySelectorAll('.factor-grid .factor-item').length===2`), 'available factors')
  // Add a numerator and drag a denominator through the actual template handlers.
  await evaluate(`document.querySelector('.factor-grid .factor-item button').click()`)
  await until(() => evaluate(`document.querySelectorAll('.factor-grid .factor-item').length===1`), 'selected numerator removed from library')
  await evaluate(`document.querySelector('.factor-grid .factor-item').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); document.querySelector('[data-testid="denominator-slot"]').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))`)
  await until(() => evaluate(`window.__editor.formulaValid && document.querySelector('.formula-preview').textContent.includes('费用总额') && document.querySelector('.formula-preview').textContent.includes('出院人次')`), 'live ratio preview')
  for (const mode of ['简单比率型', '嵌套公式型']) {
    await evaluate(`Array.from(document.querySelectorAll('.formula-modes button')).find(el=>el.textContent.trim()===${JSON.stringify(mode)}).click()`)
    await pause(100)
    if (mode === '嵌套公式型') {
      await until(() => evaluate(`!!document.querySelector('.formula-preview .indicator-math')`), 'nested math preview')
      await evaluate(`(() => { const input=document.querySelector('[aria-label="展示乘数"]'); input.value='2'; input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
      await until(() => evaluate(`document.querySelector('.formula-preview .math-expression').textContent.includes('× 2')`), 'display controls update the unified preview')
      assert.equal(await evaluate(`document.querySelectorAll('.advanced-display-settings').length`), 1)
    }
    const order = await evaluate(`(() => {
      const preview=document.querySelector('.formula-preview'), builder=document.querySelector('.formula-builder'), settings=document.querySelector('.formula-preview-settings'), library=document.querySelector('.factor-library');
      const before=(a,b)=>!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
      return { count:document.querySelectorAll('.formula-preview').length, previewBeforeEditor:before(preview,builder), settingsAfterEditor:before(builder,settings), settingsBeforeLibrary:before(settings,library), settingsOutsidePreview:!preview.contains(settings) };
    })()`)
    assert.deepEqual(order, { count:1, previewBeforeEditor:true, settingsAfterEditor:true, settingsBeforeLibrary:true, settingsOutsidePreview:true })
    for (const viewport of [{ width:1440, height:1000, mobile:false }, { width:390, height:844, mobile:true }]) {
      await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor:1 })
      await evaluate(`document.querySelector('.formula-builder').scrollIntoView({block:'start',behavior:'instant'})`)
      await pause(100)
      const bounds = await evaluate(`(() => {const el=document.querySelector('.formula-preview'),r=el.getBoundingClientRect();return {position:getComputedStyle(el).position,top:r.top,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
      assert.equal(bounds.overflow, false, `${mode} ${JSON.stringify(viewport)}`)
      if (viewport.mobile) assert.equal(bounds.position, 'static')
      else {
        assert.equal(bounds.position, 'sticky')
        assert.ok(bounds.top>=56 && bounds.top<100, JSON.stringify(bounds))
        assert.ok(bounds.height<=300, JSON.stringify(bounds))
      }
      await evaluate(`document.querySelector('.formula-preview').scrollIntoView({block:'center',behavior:'instant'})`)
      await writeFile(`${output}/${mode}-${viewport.mobile?'mobile':'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format:'png' })).data, 'base64'))
    }
  }
  // Unbounded business names must remain readable without widening the page.
  await evaluate(`(() => {
    window.__editor.factorLibraryRows[0].name='超长业务因子名称'.repeat(20);
    const ref=id=>({nodeType:'FACTOR_REF',factorVersionId:id}), binary=(operator,left,right)=>({nodeType:'BINARY',operator,left,right});
    window.__editor.advancedFormulaRoot={nodeType:'FUNCTION',functionCode:'ROUND',scale:2,roundingMode:'HALF_UP',arguments:[binary('MUL',binary('DIV',binary('SUB',ref('11'),binary('ADD',ref('12'),ref('12'))),ref('12')),{nodeType:'CONST',value:'100'})]};
  })()`)
  await until(() => evaluate(`document.querySelector('.formula-preview').textContent.includes('超长业务因子名称'.repeat(20))`), 'long factor name in complex preview')
  for (const viewport of [{ width:1024, height:720, mobile:false }, { width:390, height:844, mobile:true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor:1 })
    await pause(100)
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`), false)
    if (!viewport.mobile) assert.ok(await evaluate(`document.querySelector('.formula-preview').getBoundingClientRect().height<=innerHeight*0.3+1`))
  }
  await evaluate(`window.__editor.factorLibraryRows[0].name='费用总额'`)
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.editor-tabs > .el-tabs__header [role="tab"]')).map(el=>el.textContent.trim())`), ['1 基础与政策','2 公式与试算','3 场景关联（可选）','4 发布检查'])
  assert.equal(await evaluate(`document.querySelectorAll('.workflow-overview .workflow-step').length`), 4)
  assert.equal(await evaluate(`!!document.querySelector('#tab-exclusion')`), false)
  await evaluate(`Array.from(document.querySelectorAll('#pane-formula button')).find(el=>el.textContent.trim()==='前往发布检查').click()`)
  await until(() => evaluate(`document.querySelector('#pane-publish').checkVisibility()`), 'publication checklist')
  assert.match(await evaluate(`document.querySelector('.publish-gates').textContent`), /发布前检查/)
  assert.doesNotMatch(await evaluate(`document.querySelector('#pane-publish').textContent`), /Hash|AST|编译产物|发布门禁/)
  await evaluate(`Array.from(document.querySelectorAll('.publish-gates button')).find(el=>el.textContent.trim()==='前往第 2 页校验').click()`)
  await until(() => evaluate(`window.__editor.activeTab==='formula' && document.activeElement===document.querySelector('.formula-actions')`), 'checklist link focuses formula actions')
  // Display a read-only fixture result, then verify the result link positions the actual table.
  await evaluate(`(() => {
    Object.assign(window.__editor.indicatorWorkflow,{versionId:'draft',compiled:true});
    window.__editor.indicatorTrialTargets=[{key:'test',periodType:'MONTHLY',dimensionGrain:[],total:1,records:[{periodStart:'2026-01-01T00:00:00',value:123}]}];
    window.__editor.selectedIndicatorTrialTargetKey='test';window.__editor.indicatorTrialResultsLoaded=true;
  })()`)
  for (const viewport of [{ width:1440, height:1000, mobile:false }, { width:390, height:844, mobile:true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor:1 })
    await evaluate(`document.querySelector('#tab-publish').click()`)
    await until(() => evaluate(`document.querySelector('#pane-publish').checkVisibility()`), 'publish page with results')
    assert.match(await evaluate(`document.querySelector('.publish-gates').textContent`), /已取得结果/)
    assert.doesNotMatch(await evaluate(`document.querySelector('.publish-gates').textContent`), /一致性.*通过|Hash/)
    await writeFile(`${output}/publish-${viewport.mobile?'mobile':'desktop'}.png`, Buffer.from((await send('Page.captureScreenshot', { format:'png' })).data, 'base64'))
    await evaluate(`Array.from(document.querySelectorAll('.publish-gates button')).find(el=>el.textContent.trim()==='查看试算结果').click()`)
    await until(() => evaluate(`document.activeElement===document.querySelector('.workflow-trial-results')`), 'trial result navigation')
    const resultPosition = await evaluate(`(() => { const r=document.querySelector('.workflow-trial-results').getBoundingClientRect(), p=document.querySelector('.formula-preview').getBoundingClientRect(); return {top:r.top,previewBottom:p.bottom,bottom:r.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth} })()`)
    assert.equal(resultPosition.overflow, false)
    assert.ok(resultPosition.top>=56 && resultPosition.top<resultPosition.height, JSON.stringify(resultPosition))
    if (!viewport.mobile) assert.ok(resultPosition.top>=resultPosition.previewBottom, JSON.stringify(resultPosition))
  }
  assert.deepEqual(exceptions, [])
  console.log('PASS: unified live preview, responsive layout and long formulas; four-step workflow with policy basis integrated into basic information, plain-language publication checks and direct trial-result navigation without sticky overlap; no business writes')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) await writeFile(`${output}/failure.png`, Buffer.from((await send('Page.captureScreenshot', { format:'png' })).data, 'base64'))
  throw error
} finally {
  socket?.close()
  chrome.kill()
  server.kill()
}
