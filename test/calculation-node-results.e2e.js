import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-node-results-'))
const port = 41941, pending = new Map(), errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { if (await predicate()) return; await pause(100) }
  throw new Error('Timeout: ' + label)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function selectNode(id) {
  await evaluate(`document.querySelector('[data-node-id="${id}"]').click()`)
  await until(() => evaluate(`document.querySelector('.node-heading')?.textContent.includes(window.__nodeFixture.value[0].nodes.find(node => node.nodeId === '${id}').nodeName)`), 'node ' + id)
}
async function closeDrawer() {
  await evaluate(`Array.from(document.querySelectorAll('.el-drawer button')).find(button => button.textContent.trim() === '关闭').click()`)
  await until(() => evaluate(`!document.querySelector('.node-details')`), 'drawer closed')
}

try {
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails)
    const request = pending.get(data.id)
    if (request) { pending.delete(data.id); data.error ? request.reject(new Error(data.error.message)) : request.resolve(data.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: (process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5173') + '/__node-results-test__' })
  await until(() => evaluate(`document.readyState === 'complete'`), 'page ready')
  await evaluate(`(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js');
    const { default: ElementPlus } = await import('/node_modules/.vite/deps/element-plus.js');
    const { default: Panel } = await import('/src/idmp/components/CalculationTargetsPanel.vue');
    document.querySelector('#app')?.__vue_app__?.unmount();
    window.__nodeFixture = ref([{ targetId: '102027642463173860', targetCode: 'BASE', status: 'ACTIVE', grain: ['科室','病种'], periodType: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-02-01', nodes: [
      { nodeId: '1', nodeCode: 'A', nodeType: 'FACTOR', nodeName: '入院总人次', status: 'SUCCEEDED', attemptNo: 1, dependencies: [], resultSummary: { status: 'AVAILABLE', rowCount: '1', singleResult: { value: 0 } } },
      { nodeId: '2', nodeCode: 'B', nodeType: 'DERIVED_FACTOR', nodeName: '转科人次', status: 'SUCCEEDED', attemptNo: 1, dependencies: ['A'], resultSummary: { status: 'AVAILABLE', rowCount: '21' } },
      { nodeId: '3', nodeCode: 'F', nodeType: 'FORMULA', nodeName: '转科比例', status: 'SUCCEEDED', attemptNo: 1, dependencies: ['A','B'], resultSummary: { status: 'AVAILABLE', rowCount: '1', singleResult: { value: 0.15, displayValue: '15%' } } },
      { nodeId: '4', nodeCode: 'Q', nodeType: 'QUALITY_CHECK', nodeName: '质量校验', status: 'SUCCEEDED', attemptNo: 1, dependencies: ['F'], resultSummary: { status: 'QUALITY', conclusion: 'PASS' } },
      { nodeId: '5', nodeCode: 'X', nodeType: 'FACTOR', nodeName: '失败因子', status: 'FAILED', attemptNo: 2, dependencies: [], resultSummary: { status: 'AVAILABLE', rowCount: '1', singleResult: { value: 999 } } }
    ] }]);
    window.__nodeCalls = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(String(input), location.origin);
      const matched = url.pathname.includes('/calc/nodes/') && url.pathname.endsWith('/results') ? [null, url.pathname.split('/').at(-2)] : null;
      if (!matched) return originalFetch(input, init);
      window.__nodeCalls.push({ node: matched[1], page: url.searchParams.get('pageNum'), method: init.method || 'GET' });
      if (window.__nodeFailure) return new Response(JSON.stringify({ code: 'ERROR', message: '节点结果暂不可用，请重试' }), { status: 500 });
      const id = matched[1], page = Number(url.searchParams.get('pageNum'));
      const many = id === '2';
      const records = many ? Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({ resultId: String(100 + (page-1)*20+index), dimensions: { '科室': '科室' + ((page-1)*20+index+1), '病种': '病种A' }, value: (page-1)*20+index+1, outcomeStatus: 'CALCULATED' })) : [{ resultId: '102027642463173862', dimensions: {}, value: id === '3' ? 0.15 : 0, displayValue: id === '3' ? '15%' : null, numeratorValue: 15, denominatorValue: 100, outcomeStatus: 'CALCULATED' }];
      const data = { nodeId: id, targetId: window.__nodeFixture.value[0].targetId, attemptNo: 1, dimensionFields: many ? ['科室','病种'] : [], summary: { status: 'AVAILABLE', rowCount: many ? '21' : '1', singleResult: many ? null : records[0] }, results: { records, total: many ? '21' : '1', pageNum: page, pageSize: 20, pages: many ? 2 : 1 } };
      const response = () => new Response(JSON.stringify({ code: 'OK', data }), { status: 200 });
      if (window.__delayNode === id) return new Promise(resolve => { window.__releaseNode = () => resolve(response()); });
      return response();
    };
    document.body.innerHTML = '<main id="node-test" style="max-width:1200px;margin:auto;padding:16px;box-sizing:border-box"></main>';
    createApp({ render: () => h(Panel, { targets: window.__nodeFixture.value }) }).use(ElementPlus).mount('#node-test');
  })()`)
  await evaluate(`document.querySelector('.el-collapse-item__header').click()`)
  await until(() => evaluate(`document.querySelectorAll('.dag-node').length === 5`), 'graph rendered')
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.dag-node__result')).map(el => el.textContent)`), ['0', '共 21 条结果', '15%', '已通过', '本次执行无结果'])
  assert.deepEqual(await evaluate(`window.__nodeCalls`), [])
  await selectNode('2')
  await until(() => evaluate(`document.querySelector('.node-results .el-table__body tbody')?.children.length === 20`), 'first page')
  assert.equal(await evaluate(`window.__nodeCalls.length`), 1)
  await evaluate(`document.querySelector('.node-results .btn-next').click()`)
  await until(() => evaluate(`document.querySelector('.node-results').textContent.includes('科室21')`), 'second page')
  assert.equal(await evaluate(`window.__nodeCalls.at(-1).page`), '2')
  assert.equal(await evaluate(`document.querySelector('.node-results .el-table__body tbody').children.length`), 1)
  await closeDrawer()
  await selectNode('3')
  await until(() => evaluate(`document.querySelector('.node-results .el-table')?.textContent.includes('15%')`), 'formula values')
  for (const text of ['分子', '分母', '15%', '100']) assert.ok(await evaluate(`document.querySelector('.node-results').textContent.includes('${text}')`))
  await closeDrawer()
  const requests = await evaluate(`window.__nodeCalls.length`)
  await selectNode('4')
  assert.ok(await evaluate(`document.querySelector('.node-results').textContent.includes('已通过')`))
  assert.equal(await evaluate(`window.__nodeCalls.length`), requests)
  await closeDrawer()
  await selectNode('5')
  assert.ok(await evaluate(`document.querySelector('.node-results').textContent.includes('本次执行无结果')`))
  assert.equal(await evaluate(`document.querySelector('.node-results').textContent.includes('999')`), false)
  assert.equal(await evaluate(`window.__nodeCalls.length`), requests)
  await closeDrawer()

  await evaluate(`window.__delayNode = '1'`)
  await selectNode('1')
  await until(() => evaluate(`typeof window.__releaseNode === 'function'`), 'delayed result')
  await closeDrawer()
  await selectNode('2')
  await until(() => evaluate(`document.querySelector('.node-results').textContent.includes('科室1')`), 'new node results')
  await evaluate(`window.__releaseNode()`); await pause(150)
  assert.ok(await evaluate(`document.querySelector('.node-results').textContent.includes('科室1')`))
  await closeDrawer()
  await evaluate(`window.__delayNode = ''; window.__nodeFailure = true`)
  await selectNode('1')
  await until(() => evaluate(`document.querySelector('.node-results').textContent.includes('节点结果读取失败')`), 'read error')
  await evaluate(`window.__nodeFailure = false; Array.from(document.querySelectorAll('.node-results button')).find(button => button.textContent.trim() === '重试').click()`)
  await until(() => evaluate(`!!document.querySelector('.node-results .el-table')`), 'retry succeeds')
  await evaluate(`window.__nodeFixture.value[0].nodes[0].attemptNo = 2`)
  await until(() => evaluate(`document.querySelector('.node-results').textContent.includes('节点执行状态已变化')`), 'mismatched attempt rejected')
  await closeDrawer()
  await selectNode('2')
  await until(() => evaluate(`!!document.querySelector('.node-results .el-table')`), 'group rows restored')
  await mkdir('.tmp/calculation-node-results', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 }); await pause(150)
    assert.equal(await evaluate(`document.querySelector('.el-drawer').scrollWidth <= document.querySelector('.el-drawer').clientWidth + 1`), true)
    await writeFile('.tmp/calculation-node-results/' + (viewport.mobile ? 'mobile' : 'desktop') + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
  assert.deepEqual(errors, [])
  assert.ok((await evaluate(`window.__nodeCalls`)).every(call => call.method === 'GET'))
  console.log('PASS: DAG scalar/count/quality/failed summaries; lazy group pagination; formula numerator/denominator; stale and mismatched attempt protection; friendly failure/retry; desktop/mobile. APIs mocked; no server writes.')
} finally { socket?.close(); chrome.kill() }
