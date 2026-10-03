import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-breadcrumbs-'))
const debugPort = 41828
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
function mockBackend() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    if (!String(input).includes('/api/v1/')) return realFetch(input, init)
    return new Response(JSON.stringify({ code: 'OK', data: { records: [], total: 0, unreadCount: 0 } }), { headers: { 'Content-Type': 'application/json' } })
  }
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockBackend.toString()})()` })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/mapping' })
  await waitFor(() => evaluate(`document.readyState==='complete' && !!document.querySelector('.idmp-breadcrumb')`))
  const result = await evaluate(`(async () => {
    const {createApp,h,nextTick}=await import('/node_modules/.vite/deps/vue.js');
    const routerSource=await (await fetch('/src/router/index.js')).text();
    const routerModule=routerSource.match(/from "([^"]*vue-router[^\"]*)"/)[1];
    const {createRouter,createMemoryHistory}=await import(routerModule);
    const {default:ElementPlus}=await import('/node_modules/.vite/deps/element-plus.js');
    const {default:Layout}=await import('/src/idmp/layout/IdmpLayout.vue');
    const {default:appRouter}=await import('/src/router/index.js');
    const {buildPageBreadcrumbs}=await import('/src/router/breadcrumbs.js');
    document.querySelector('#app').__vue_app__?.unmount();
    const routes=appRouter.getRoutes().map(route=>({path:route.path,name:route.name,meta:route.meta,redirect:route.redirect,component:{render:()=>h('div','测试页面')}}));
    const router=createRouter({history:createMemoryHistory(),routes});
    await router.push('/mapping');await router.isReady();
    createApp(Layout).use(router).use(ElementPlus).mount('#app');
    const failures=[];let pages=0,links=0;
    for(const record of routes.filter(route=>route.meta?.breadcrumb)) {
      const path=record.path.replace(/:[^/]+/g,'1');
      await router.push(path);await nextTick();pages++;
      let items=buildPageBreadcrumbs(router.currentRoute.value);
      if(!document.querySelector('.idmp-breadcrumb [aria-current="page"]')) failures.push(path+': no current page');
      for(let index=0;index<items.length-1;index++) {
        await router.push(path);await nextTick();
        items=buildPageBreadcrumbs(router.currentRoute.value);
        const link=Array.from(document.querySelectorAll('.idmp-breadcrumb a'))[index];
        if(!link || !items[index].to) { failures.push(path+': missing parent '+index);continue; }
        const expected=router.resolve(items[index].to).path;
        link.click();await new Promise(resolve=>setTimeout(resolve,10));await nextTick();
        if(router.currentRoute.value.path!==expected && !(expected==='/data' && router.currentRoute.value.path==='/data/sources')) failures.push(path+': wrong destination '+router.currentRoute.value.path);
        links++;
      }
    }
    await router.push({path:'/analysis/drill',query:{indicator:'RATE',indicatorVersionId:'123',indicatorName:'入院转科比例',periodStart:'2026-01-01',periodEnd:'2026-02-01',resultId:'99'}});await nextTick();
    Array.from(document.querySelectorAll('.idmp-breadcrumb a')).find(link=>link.textContent==='指标分析').click();
    await new Promise(resolve=>setTimeout(resolve,10));
    return {pages,links,failures,query:router.currentRoute.value.query,path:router.currentRoute.value.path};
  })()`)
  assert.deepEqual(result.failures, [])
  assert.equal(result.path, '/analysis')
  assert.deepEqual(result.query, { indicator: 'RATE', indicatorVersionId: '123', indicatorName: '入院转科比例', periodStart: '2026-01-01', periodEnd: '2026-02-01' })
  assert.deepEqual(errors, [])
  console.log(`Breadcrumb navigation passed across ${result.pages} routes and ${result.links} ancestor links`)
} finally { socket?.close(); chrome.kill() }
