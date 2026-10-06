import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'idmp-calc-center-'))
const port = 41937
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
  await until(async () => {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')
      return Boolean(target)
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
  await send('Page.navigate', { url: (process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5173') + '/__calculation-task-center-test__' })
  await until(() => evaluate(`document.readyState === 'complete'`), 'page ready')
  await evaluate(`(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js');
    const source = await (await fetch('/src/idmp/views/CalculationTaskCenter.vue')).text();
    const routerModule = source.match(/from "([^\"]*vue-router[^\"]*)"/)[1];
    const { createRouter, createMemoryHistory } = await import(routerModule);
    const { default: ElementPlus } = await import('/node_modules/.vite/deps/element-plus.js');
    const { default: Center } = await import('/src/idmp/views/CalculationTaskCenter.vue');
    document.querySelector('#app')?.__vue_app__?.unmount();
    const taskId = '102027642461312817', batchId = '102027642461312818';
    window.__calcCalls = [];
    window.__owners = [
      { id: '102027642461312900', name: '入院转科比例', code: 'TRANSFER_RATE' },
      { id: '102027642461312901', name: '住院死亡率', code: 'MORTALITY_RATE' }
    ];
    window.__factor = { id: '102027642461312902', name: '同期入院总人次', code: 'ADMISSIONS' };
    window.__versions = [
      { id: '102027642461312903', indicatorId: window.__owners[0].id, versionNo: 3, status: 'DRAFT', currentArtifactId: '9' },
      { id: '102027642461312904', indicatorId: window.__owners[0].id, versionNo: 2, status: 'PUBLISHED', currentArtifactId: '8' },
      { id: '102027642461312905', indicatorId: window.__owners[0].id, versionNo: 4, status: 'DRAFT', currentArtifactId: null },
      { id: '102027642461312906', indicatorId: window.__owners[0].id, versionNo: 1, status: 'ARCHIVED', currentArtifactId: '7' }
    ];
    window.__factorVersion = { id: '102027642461312907', factorId: window.__factor.id, versionNo: 1, status: 'PUBLISHED', currentArtifactId: '6', dsl: { calculationMode: 'TEMPORAL' } };
    window.__calcTask = { taskId, batchId, taskType: 'INDICATOR_CALC', status: 'RUNNING', progress: 42 };
    window.__calcBatch = { batchId, taskId, batchType: 'FULL', status: 'RUNNING', targetCount: 1,
      succeededCount: 0, failedCount: 1, targets: [{ targetId: '1', targetKey: 'BASE', ownerType: 'FACTOR', ownerVersionId: '3', nodes: [
        { nodeId: '2', nodeCode: 'FACTOR:3', nodeType: 'FACTOR', status: 'SUCCEEDED' }
      ] }, { targetId: '9', targetKey: 'BASE', ownerType: 'INDICATOR', ownerVersionId: '7', nodes: [
        { nodeId: '4', ownerType: 'FACTOR', ownerVersionId: '5', nodeCode: 'FACTOR:5', nodeType: 'DERIVED_FACTOR', status: 'FAILED' },
        { nodeId: '6', ownerType: 'INDICATOR', ownerVersionId: '7', nodeCode: 'FORMULA:7', nodeType: 'FORMULA', status: 'QUEUED' },
        { nodeId: '8', ownerType: 'INDICATOR', ownerVersionId: '7', nodeCode: 'QUALITY:7', nodeType: 'QUALITY_CHECK', status: 'QUEUED' }
      ] }] };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/api/v1/')) {
        window.__calcCalls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
        const parsed = new URL(url, location.origin), path = parsed.pathname;
        let data;
        if (url.endsWith('/async-tasks/' + taskId)) data = window.__calcTask;
        else if (url.endsWith('/calc/batches/' + batchId)) data = window.__calcBatch;
        else if (path === '/api/v1/indicators' || path === '/api/v1/factors') {
          const rows = path.endsWith('/indicators') ? window.__owners : [window.__factor];
          data = { records: rows.filter(row => (!parsed.searchParams.get('name') || row.name.includes(parsed.searchParams.get('name'))) && (!parsed.searchParams.get('code') || row.code.includes(parsed.searchParams.get('code')))) };
        } else if (path === '/api/v1/indicators/' + window.__owners[0].id) data = window.__owners[0];
        else if (path === '/api/v1/indicators/' + window.__owners[0].id + '/versions') {
          if (window.__failVersions) return new Response(JSON.stringify({ code: 'ERROR', message: '版本加载失败' }), { status: 500 });
          data = window.__versions;
        } else if (path === '/api/v1/indicators/' + window.__owners[1].id + '/versions') {
          if (window.__delayVersions) await new Promise(resolve => { window.__resolveVersions = resolve; });
          data = [{ id: '102027642461312908', indicatorId: window.__owners[1].id, versionNo: 1, status: 'PUBLISHED', currentArtifactId: '10' }];
        } else if (path === '/api/v1/factors/' + window.__factor.id + '/versions') data = [window.__factorVersion];
        else if (path.startsWith('/api/v1/indicator-versions/')) data = window.__versions.find(v => path.endsWith('/' + v.id));
        else if (path === '/api/v1/factor-versions/' + window.__factorVersion.id) data = window.__factorVersion;
        else if (path === '/api/v1/indicators/' + window.__owners[0].id + '/scenarios') {
          if (window.__delayScenes) await new Promise(resolve => { window.__resolveScenes = resolve; });
          data = [{ scenarioVersionId: '102027642461312909', scenarioName: '质量安全' }];
        } else if (path === '/api/v1/calc/batches' && init.method === 'POST') {
          data = { taskId, batchId, taskType: 'INDICATOR_CALC', status: 'QUEUED' };
        } else data = [];
        return new Response(JSON.stringify({ code: 'OK', data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/test-calc', component: { render: () => null } }] });
    await router.push('/test-calc?batchId=' + batchId + '&ownerVersionId=' + window.__versions[0].id + '&scenarioVersionId=102027642461312909');
    await router.isReady();
    document.body.innerHTML = '<main id="calc-test" style="max-width:1400px;margin:auto;padding:16px;box-sizing:border-box"></main>';
    window.__calcCenter = ref();
    window.__calcState = () => window.__calcCenter.value.$.setupState;
    createApp({ render: () => h(Center, { ref: window.__calcCenter }) }).use(router).use(ElementPlus).mount('#calc-test');
  })()`)
  await until(() => evaluate(`!!window.__calcCenter.value.$.setupState.batchDetail`), 'batch loaded')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '查询任务').click()`)
  await until(() => evaluate(`!!window.__calcCenter.value.$.setupState.taskDetail`), 'task loaded')
  const text = await evaluate(`document.querySelector('.calc-task-page').innerText`)
  assert.doesNotMatch(text, /GET \/|POST \/|真实接口|不透明字符串|DAG|taskId|batchId|Worker|INDICATOR_CALC/)
  for (const label of ['因子版本', '指标版本', '因子计算', '公式计算', '复合因子计算', '质量校验', '运行中', '已成功', '失败', '排队中', '42%']) {
    assert.ok(text.includes(label), label)
  }
  assert.ok(text.includes('102027642461312817'))
  assert.ok(text.includes('102027642461312818'))
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.status-row')).map(el => el.innerText)`), ['状态\n运行中', '状态\n运行中'])
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.el-table button')).map(b => b.disabled)`), [true, false, true, true])
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '取消已查批次').disabled`), false)
  await evaluate(`window.__calcBatch.status = 'SUCCEEDED'; Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '刷新当前状态').click()`)
  await until(() => evaluate(`!window.__calcCenter.value.$.setupState.batchLoading && !window.__calcCenter.value.$.setupState.taskLoading`), 'refresh complete')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '取消已查批次').disabled`), true)
  const calls = await evaluate(`window.__calcCalls`)
  const calculationCalls = calls.filter(call => /\/(calc|async-tasks)\//.test(call.url))
  assert.ok(calculationCalls.length >= 4)
  assert.ok(calculationCalls.every(call => call.method.toUpperCase() === 'GET'), JSON.stringify(calculationCalls))
  await until(() => evaluate(`window.__calcState().createForm.ownerVersionId === '102027642461312903'`), 'route version restored')
  assert.equal(await evaluate(`window.__calcState().createForm.ownerId`), '102027642461312900')
  assert.equal(await evaluate(`window.__calcState().createForm.scenarioVersionId`), '102027642461312909')
  assert.equal(await evaluate(`document.querySelector('.owner-select input').value || document.querySelector('.owner-select').innerText`), '入院转科比例 · TRANSFER_RATE')
  assert.equal(await evaluate(`document.querySelector('.create-card .mono-input') !== null`), false)
  await evaluate(`window.__calcState().createForm.batchType = 'FULL'`)
  await until(() => evaluate(`window.__calcState().createForm.ownerVersionId === '102027642461312904'`), 'published default for full calculation')
  assert.equal(await evaluate(`window.__calcState().createForm.scenarioVersionId`), '')
  assert.deepEqual(await evaluate(`window.__calcState().versionOptions.map(v => [v.versionNo, window.__calcState().isVersionEligible(v)])`), [[4, false], [3, false], [2, true], [1, false]])
  await evaluate(`document.querySelector('.owner-version-select .el-select__wrapper').click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('V3') && el.classList.contains('is-disabled'))`), 'draft option disabled')
  await evaluate(`document.querySelector('.owner-version-select .el-select__wrapper').click(); window.__calcState().createForm.batchType = 'TRIAL'`)
  await pause(100)
  assert.deepEqual(await evaluate(`window.__calcState().versionOptions.map(v => [v.versionNo, window.__calcState().isVersionEligible(v)])`), [[4, false], [3, true], [2, true], [1, false]])
  await evaluate(`window.__calcState().searchOwners('MORTALITY')`)
  await until(() => evaluate(`!window.__calcState().ownerOptionsLoading`), 'code search')
  assert.ok((await evaluate(`window.__calcState().ownerOptions.map(o => o.id)`)).includes('102027642461312901'))
  await evaluate(`window.__delayVersions = true; window.__calcState().createForm.ownerId = '102027642461312901'; window.__calcState().handleOwnerChange()`)
  await until(() => evaluate(`typeof window.__resolveVersions === 'function'`), 'slow version request started')
  assert.equal(await evaluate(`window.__calcState().createForm.ownerVersionId`), '')
  await evaluate(`window.__calcState().createForm.ownerId = '102027642461312900'; window.__calcState().handleOwnerChange()`)
  await until(() => evaluate(`window.__calcState().createForm.ownerVersionId === '102027642461312904'`), 'newer selection loaded')
  await evaluate(`window.__resolveVersions()`)
  await pause(150)
  assert.equal(await evaluate(`window.__calcState().createForm.ownerVersionId`), '102027642461312904')
  await evaluate(`window.__delayScenes = true; window.__calcState().loadSceneOptions(); void 0`)
  await until(() => evaluate(`typeof window.__resolveScenes === 'function'`), 'slow scenes request started')
  await evaluate(`window.__calcState().createForm.ownerType = 'FACTOR'; window.__calcState().handleOwnerTypeChange()`)
  await until(() => evaluate(`!window.__calcState().ownerOptionsLoading`), 'factor options loaded')
  await evaluate(`window.__resolveScenes(); document.querySelector('.owner-select .el-select__wrapper').click()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.trim() === '同期入院总人次 · ADMISSIONS')`), 'factor dropdown option')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.trim() === '同期入院总人次 · ADMISSIONS').click()`)
  await until(() => evaluate(`window.__calcState().createForm.ownerVersionId === '102027642461312907'`), 'factor version loaded')
  assert.deepEqual(await evaluate(`Array.from(window.__calcState().sceneOptions)`), [])
  assert.equal(await evaluate(`window.__calcState().createForm.scenarioVersionId`), '')
  await evaluate(`window.__calcState().createForm.ownerType = 'INDICATOR'; window.__calcState().handleOwnerTypeChange()`)
  await until(() => evaluate(`!window.__calcState().ownerOptionsLoading`), 'indicator options loaded')
  await evaluate(`window.__failVersions = true; window.__calcState().createForm.ownerId = '102027642461312900'; window.__calcState().handleOwnerChange()`)
  await until(() => evaluate(`!!window.__calcState().versionOptionsError`), 'version error displayed')
  assert.equal(await evaluate(`document.querySelector('.create-card button.el-button--primary:not(.is-link)').disabled`), true)
  await evaluate(`window.__failVersions = false; window.__calcState().loadOwnerVersions()`)
  await until(() => evaluate(`window.__calcState().createForm.ownerVersionId === '102027642461312904'`), 'version retry recovered')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '确认并创建批次').click()`)
  await until(() => evaluate(`!!document.querySelector('.el-message-box')`), 'creation confirmation')
  assert.ok((await evaluate(`document.querySelector('.el-message-box').innerText`)).includes('入院转科比例'))
  await evaluate(`Array.from(document.querySelectorAll('.el-message-box button')).find(b => b.textContent.trim() === '确认创建').click()`)
  await until(() => evaluate(`window.__calcCalls.some(call => call.url.endsWith('/calc/batches') && call.method === 'POST') && !window.__calcState().createBusy`), 'mock batch created')
  const creation = (await evaluate(`window.__calcCalls`)).find(call => call.url.endsWith('/calc/batches') && call.method === 'POST')
  assert.deepEqual(creation.body, { ownerType: 'INDICATOR', ownerVersionId: '102027642461312904', batchType: 'TRIAL', periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' })
  await until(() => evaluate(`document.querySelectorAll('.el-message').length === 0`), 'notification dismissal')
  await mkdir('.tmp/calculation-task-center-browser', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000, mobile: false }, { width: 390, height: 844, mobile: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 })
    await pause(150)
    const layout = await evaluate(`Array.from(document.querySelectorAll('.query-card,.create-card,.detail-card')).map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; })`)
    for (const box of layout) assert.ok(box.left >= 0 && box.right <= box.width, JSON.stringify(box))
    await writeFile('.tmp/calculation-task-center-browser/' + (viewport.mobile ? 'mobile' : 'desktop') + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  }
  assert.deepEqual(errors, [])
  console.log('PASS: task display; searchable indicator/factor selection; route preselection; version eligibility/defaults; stale versions/scenes ignored; error retry; batch payload; desktop/mobile verified. APIs mocked; no server writes.')
} finally {
  socket?.close()
  chrome.kill()
}
