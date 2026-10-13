import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5173'
const profile = await mkdtemp(join(tmpdir(), 'idmp-lineage-batch-'))
const port = 41939, pending = new Map(), errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await pause(100)
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
  await until(async () => {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page')
      return !!target
    } catch { return false }
  }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails)
    const request = pending.get(data.id)
    if (request) {
      pending.delete(data.id)
      data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result)
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: appUrl + '/__lineage-batch-test__' })
  await until(() => evaluate(`document.readyState === 'complete'`), 'page ready')
  await evaluate(`(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js');
    const source = await (await fetch('/src/idmp/features/analysis/DrillExplorer.vue')).text();
    const { createRouter, createMemoryHistory, RouterView } = await import(source.match(/from "([^\"]*vue-router[^\"]*)"/)[1]);
    const { default: ElementPlus } = await import('/node_modules/.vite/deps/element-plus.js');
    const { default: Drill } = await import('/src/idmp/features/analysis/DrillExplorer.vue');
    const { default: Center } = await import('/src/idmp/views/CalculationTaskCenter.vue');
    const { scrollBehavior } = await import('/src/router/scrollBehavior.js');
    document.querySelector('#app')?.__vue_app__?.unmount();
    window.__lineageCalls = [];
    const originalFetch = window.fetch.bind(window);
    const response = data => new Response(JSON.stringify({ code: 'OK', data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const batches = { ONE: '102027642463173260', TWO: '102027642463173261' };
    window.fetch = async (input, init = {}) => {
      const url = String(input), path = new URL(url, location.origin).pathname;
      if (!path.startsWith('/api/v1/')) return originalFetch(input, init);
      window.__lineageCalls.push({ path, method: init.method || 'GET' });
      if (path.endsWith('/drill/search')) return response({ context: {}, summary: {}, columns: [], records: [], breadcrumb: [], nextLevels: [], pageInfo: { total: 0 } });
      if (path.includes('/analysis/results/') && path.endsWith('/factors')) {
        const resultId = path.split('/')[5];
        if (resultId === 'ERROR') return new Response(JSON.stringify({ code: 'COMMON-50000', message: '追溯加载失败，请重试' }), { status: 500 });
        const data = { context: { resultId, calculationBatchId: batches[resultId] || null }, factors: [{ factorName: '男性出院病案人次', factorVersionId: '102027642463117005', versionNo: 1, factorKind: 'SOURCE', resultMatched: true, result: { value: 15 } }] };
        if (resultId === 'SLOW') return new Promise(resolve => { window.__releaseTrace = () => resolve(response({ ...data, context: { resultId, calculationBatchId: batches.ONE } })); });
        const json = JSON.stringify({ code: 'OK', data });
        return new Response(batches[resultId] ? json.replace('"' + batches[resultId] + '"', batches[resultId]) : json, { status: 200 });
      }
      if (path.includes('/calc/batches/')) return response({ batchId: path.split('/').at(-1), batchType: 'FULL', status: 'SUCCEEDED', targets: Array.from({ length: 8 }, (_, index) => ({ targetId: String(index + 1), targetKey: 'TARGET_' + index, status: 'SUCCEEDED', nodes: [{ nodeId: String(index + 11), nodeCode: 'FACTOR:1', nodeType: 'FACTOR', nodeName: '男性出院病案人次', dependencies: [], status: 'SUCCEEDED' }] })) });
      return response({ records: [] });
    };
    window.__traceResult = ref('ONE');
    window.__traceComponent = ref();
    const TracePage = { render: () => h(Drill, { ref: window.__traceComponent, resultId: window.__traceResult.value, source: 'live', embedded: true }) };
    window.__traceRouter = createRouter({ history: createMemoryHistory(), scrollBehavior, routes: [{ path: '/trace', component: TracePage }, { path: '/calc', component: Center }] });
    await window.__traceRouter.push('/trace');
    await window.__traceRouter.isReady();
    document.body.innerHTML = '<main id="lineage-test" style="max-width:1200px;margin:auto;padding:16px;box-sizing:border-box"></main>';
    createApp({ render: () => h(RouterView) }).use(window.__traceRouter).use(ElementPlus).mount('#lineage-test');
  })()`)
  await until(() => evaluate(`!!window.__traceComponent.value`), 'trace component mounted')
  await evaluate(`window.__traceComponent.value.$.setupState.showFactorTrace()`)
  await until(() => evaluate(`document.querySelector('[aria-label="所属计算批次"]')?.textContent.includes('102027642463173260')`), 'batch from trace context')
  assert.equal(await evaluate(`document.querySelector('.factor-trace-batch strong').textContent`), '102027642463173260')
  assert.ok(await evaluate(`document.querySelector('.trace-name').textContent.includes('102027642463117005')`))

  await mkdir('.tmp/lineage-batch-navigation', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await pause(150)
    assert.equal(await evaluate(`document.querySelector('.factor-trace-batch').scrollWidth <= document.querySelector('.factor-trace-batch').clientWidth + 1`), true)
    const boxes = await evaluate(`Array.from(document.querySelectorAll('.factor-trace-batch strong,.factor-trace-batch button')).map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; })`)
    for (const box of boxes) assert.ok(box.left >= 0 && box.right <= viewport.width, JSON.stringify(box))
    await writeFile('.tmp/lineage-batch-navigation/' + (viewport.mobile ? 'mobile' : 'desktop') + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  }

  await evaluate(`window.__traceResult.value = 'SLOW'`)
  await until(() => evaluate(`typeof window.__releaseTrace === 'function'`), 'delayed trace requested')
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="所属计算批次"]')`), false)
  await evaluate(`window.__traceResult.value = 'TWO'`)
  await until(() => evaluate(`document.querySelector('.factor-trace-batch strong')?.textContent === '102027642463173261'`), 'new batch replaces old batch')
  await evaluate(`window.__releaseTrace()`)
  await pause(200)
  assert.equal(await evaluate(`document.querySelector('.factor-trace-batch strong').textContent`), '102027642463173261')

  for (const resultId of ['MISSING', 'ERROR']) {
    await evaluate(`window.__traceResult.value = '${resultId}'`)
    await until(() => evaluate(`!window.__traceComponent.value.$.setupState.factorTraceLoading`), 'trace ' + resultId)
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="所属计算批次"]')`), false)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === '查看计算批次')`), false)
  }
  await evaluate(`window.__traceResult.value = 'TWO'`)
  await until(() => evaluate(`!!document.querySelector('[aria-label="所属计算批次"]')`), 'trace restored')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '查看计算批次').click()`)
  await until(() => evaluate(`document.querySelector('.calc-task-page')?.textContent.includes('102027642463173261') && window.__lineageCalls.some(call => call.path === '/api/v1/calc/batches/102027642463173261')`), 'batch loaded by destination page')
  assert.equal(await evaluate(`window.__traceRouter.currentRoute.value.fullPath`), '/calc?batchId=102027642463173261#batch-overview')
  assert.equal(await evaluate(`document.querySelector('input[placeholder="输入完整批次 ID"]').value`), '102027642463173261')
  await until(() => evaluate(`window.scrollY > 0 && Math.abs(document.querySelector('#batch-overview').getBoundingClientRect().top - 72) < 2`), 'mobile scroll to overview')
  await writeFile('.tmp/lineage-batch-navigation/batch-overview-mobile.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 700, mobile: false, deviceScaleFactor: 1 })
  await evaluate(`window.__traceRouter.push('/trace')`)
  await until(() => evaluate(`!!window.__traceComponent.value`), 'trace remounted')
  await evaluate(`window.__traceComponent.value.$.setupState.showFactorTrace()`)
  await until(() => evaluate(`!!document.querySelector('.factor-trace-batch')`), 'trace entry restored')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '查看计算批次').click()`)
  await until(() => evaluate(`window.scrollY > 0 && Math.abs(document.querySelector('#batch-overview')?.getBoundingClientRect().top - 72) < 2`), 'desktop scroll to overview')
  await writeFile('.tmp/lineage-batch-navigation/batch-overview-desktop.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  assert.equal(await evaluate(`window.__lineageCalls.some(call => call.method !== 'GET' && !call.path.endsWith('/drill/search'))`), false)
  assert.deepEqual(errors, [])
  console.log('PASS: exact batch ID from result lineage; desktop/mobile layout and scroll to batch overview; loading, missing, failure and stale-response safety; click navigates to and automatically loads the matching calculation batch. APIs mocked; no server writes.')
} finally {
  socket?.close()
  chrome.kill()
}
