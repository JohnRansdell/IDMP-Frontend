import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.DAG_FRONTEND_URL || 'http://127.0.0.1:5173'
const profile = await mkdtemp(join(tmpdir(), 'idmp-factor-list-type-'))
const port = 41936
const pending = new Map()
const errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket
let sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const end = Date.now() + 45000
  while (Date.now() < end) { if (await predicate()) return; await pause(150) }
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
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
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
  await send('Page.navigate', { url: appUrl })
  await until(() => evaluate("document.readyState === 'complete'"), 'page ready')
  await evaluate(`(async () => {
    const { createApp, h } = await import('/node_modules/.vite/deps/vue.js');
    const moduleText = await (await fetch('/src/idmp/views/FactorManagement.vue')).text();
    const routerPath = moduleText.match(/from "([^\"]*vue-router[^\"]*)"/)[1];
    const { createRouter, createMemoryHistory } = await import(routerPath);
    const { default: ElementPlus } = await import('/node_modules/.vite/deps/element-plus.js');
    const { default: Management } = await import('/src/idmp/views/FactorManagement.vue');
    const { fetchFactors } = await import('/src/idmp/api/modules/factors.js');
    window.__factorTypePage = await fetchFactors({ page: 1, size: 100 });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/factor', component: { render: () => null } }] });
    await router.push('/factor'); await router.isReady();
    document.body.innerHTML = '<main id="factor-type-test"></main>';
    createApp({ render: () => h(Management) }).use(router).use(ElementPlus).mount('#factor-type-test');
  })()`)
  await until(() => evaluate("document.querySelector('.data-source-badge')?.textContent.trim() === '接口数据' && document.querySelectorAll('.el-table__body tbody tr').length > 0"), 'live factor list')
  const counts = await evaluate(`(() => {
    const rows = window.__factorTypePage.records;
    const expected = rows.find(row => row.id === '102027642462333441');
    return { kind: expected?.definitionKind, derived: rows.filter(row => row.definitionKind === 'DERIVED').length, source: rows.filter(row => row.definitionKind === 'SOURCE').length };
  })()`)
  assert.equal(counts.kind, 'DERIVED')
  assert.ok(counts.derived > 0 && counts.source > 0)
  console.log('PASS live API returns SOURCE and DERIVED, including SQL composite factor')
  for (const [label, expected] of [['复合因子', counts.derived], ['原子因子', counts.source]]) {
    await evaluate("document.querySelector('[aria-label=\"按因子类型筛选\"]').closest('.el-select').querySelector('.el-select__wrapper').click()")
    await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(item => item.offsetParent !== null && item.textContent.trim() === ${JSON.stringify(label)})`), 'type options')
    await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(item => item.offsetParent !== null && item.textContent.trim() === ${JSON.stringify(label)}).click()`)
    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === '查询').click()")
    await until(() => evaluate(`document.querySelector('.pagination-row > span')?.textContent.trim() === '共 ${expected} 条'`), 'filtered total')
    const types = await evaluate("Array.from(document.querySelectorAll('.el-table__body tbody tr')).map(row => row.querySelectorAll('td')[3].textContent.trim())")
    assert.ok(types.length > 0)
    assert.ok(types.every(type => type === label), JSON.stringify(types))
    if (label === '复合因子') assert.ok(await evaluate("document.querySelector('.el-table__body').textContent.includes('中药费用合计（SQL导入1791270897300）')"))
    console.log(`PASS ${label} filter displays ${expected} matching live factors`)
  }
  assert.deepEqual(errors, [])
} finally {
  socket?.close()
  chrome.kill()
}
