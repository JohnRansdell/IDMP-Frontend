import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const evidence = resolve('.tmp/policy-file-relations-browser')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-policy-relations-'))
const port = 41949
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pending = new Map(), errors = []
const pause = ms => new Promise(done => setTimeout(done, ms))
async function until(predicate, label) {
  const end = Date.now() + 30000
  while (Date.now() < end) { if (await predicate()) return; await pause(100) }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function click(label, scope = 'document') {
  assert.equal(await evaluate(`(() => { const b = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!b) return false; b.click(); return true })()`), true, label)
}
async function screenshot(name) {
  await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
try {
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); return !!target } catch { return false } }, 'Chrome startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(done => socket.addEventListener('open', done, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('idmp_access_token', 'mock-policy-relations');
    const originalFetch = window.fetch.bind(window);
    window.__relationCalls = []; window.__relationConflict = false;
    const policy = { id: '501', name: '医疗质量管理办法', status: 'PUBLISHED', currentPublishedVersionId: '701' };
    const targetPolicy = { id: '502', name: '医疗质量管理规范', status: 'PUBLISHED' };
    const version = { id: '701', policyFileId: '501', versionNo: 'V2', publicationStatus: 'PUBLISHED' };
    const targetVersion = { id: '702', policyFileId: '502', versionNo: 'V1', publicationStatus: 'PUBLISHED' };
    let relations = [{ id: '102027642463697111', sourceVersionId: '701', targetVersionId: '702', resourceVersion: 3, relationType: 'REPLACES', description: '新版办法替代旧版规范' }];
    window.fetch = async (input, init = {}) => {
      const url = new URL(String(input), location.href), path = url.pathname, method = init.method || 'GET';
      if (!path.startsWith('/api/v1/')) return originalFetch(input, init);
      const reply = (data, status = 200, message = '') => new Response(JSON.stringify({ code: status === 200 ? 'OK' : 'COMMON-40900', data, message }), { status, headers: { 'Content-Type': 'application/json' } });
      if (path === '/api/v1/auth/me') return reply({ user: { id: '1', username: '验收管理员' }, roles: ['SYSTEM_ADMIN'], apiRules: [{ action: '*', resourcePattern: '/api/v1/**' }] });
      if (path.endsWith('/upload-options')) return reply({ extensions: ['txt'], maxBytes: 10485760 });
      if (path === '/api/v1/meta/policy-files') return reply({ records: [policy], total: 1 });
      if (path === '/api/v1/meta/policy-files/501') return reply({ policyFile: policy, versions: [version] });
      if (path === '/api/v1/meta/policy-files/502') return reply({ policyFile: targetPolicy, versions: [targetVersion] });
      if (path === '/api/v1/meta/policy-file-versions/701') return reply(version);
      if (path === '/api/v1/meta/policy-file-versions/702') return reply(targetVersion);
      if (path.endsWith('/701/relations')) { window.__relationCalls.push({ method, path }); return reply(relations); }
      if (path.startsWith('/api/v1/meta/policy-file-relations/') && method === 'DELETE') {
        window.__relationCalls.push({ method, path, version: url.searchParams.get('resourceVersion') });
        if (window.__relationConflict) return reply(null, 409, '政策文件关系已被修改，请刷新后重试');
        relations = []; return reply(null);
      }
      return reply({ unreadCount: 0, records: [], total: 0 });
    };
  ` })
  await send('Page.navigate', { url: `${process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'}/policies` })
  await until(() => evaluate(`document.querySelector('.policy-page')?.textContent.includes('医疗质量管理办法')`), 'policy list')
  await click('查看', "document.querySelector('.policy-page')")
  await until(() => evaluate(`document.querySelector('.el-drawer')?.textContent.includes('解除关联')`), 'relation row')
  await pause(350)
  await screenshot('desktop.png')
  await click('解除关联', "document.querySelector('.el-drawer')")
  await until(() => evaluate(`!!document.querySelector('.el-message-box')`), 'confirmation')
  assert.match(await evaluate(`document.querySelector('.el-message-box').textContent`), /医疗质量管理办法.*V2.*医疗质量管理规范.*V1.*替代/)
  await screenshot('confirmation.png')
  await click('取消', "document.querySelector('.el-message-box')")
  await pause(350)
  assert.equal(await evaluate(`window.__relationCalls.filter(c => c.method === 'DELETE').length`), 0)
  await evaluate('window.__relationConflict = true')
  await click('解除关联', "document.querySelector('.el-drawer')")
  await click('确定', "document.querySelector('.el-message-box')")
  await until(() => evaluate(`document.querySelector('.el-message--error')?.textContent.includes('政策文件关系已被修改，请刷新后重试')`), 'backend error message')
  await until(() => evaluate(`!document.querySelector('.el-message-box__wrapper') || getComputedStyle(document.querySelector('.el-message-box__wrapper')).display === 'none'`), 'closed confirmation')
  assert.equal(await evaluate(`document.querySelector('.el-drawer').textContent.includes('新版办法替代旧版规范')`), true)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await pause(350)
  assert.equal(await evaluate(`(() => { const b = [...document.querySelector('.el-drawer').querySelectorAll('button')].find(b => b.textContent.trim() === '解除关联'); const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth })()`), true)
  await screenshot('mobile.png')
  await evaluate('window.__relationConflict = false')
  await click('解除关联', "document.querySelector('.el-drawer')")
  await click('确定', "document.querySelector('.el-message-box')")
  await until(() => evaluate(`document.querySelector('.el-drawer')?.textContent.includes('暂无文件关系')`), 'relation list reload')
  const calls = await evaluate('window.__relationCalls')
  assert.deepEqual(calls.filter(c => c.method === 'DELETE').map(c => c.version), ['3', '3'])
  assert.equal(errors.length, 0)
  await writeFile(join(evidence, 'verified.json'), JSON.stringify({ passed: true, calls, errors, mocked: true }, null, 2))
  console.log('PASS: policy relationship confirmation, cancellation, conflict message, retry, versioned DELETE, refreshed list, desktop/mobile. APIs mocked; no server writes.')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure.png')
    console.error(await evaluate(`JSON.stringify({ calls: window.__relationCalls, messages: [...document.querySelectorAll('.el-message')].map(e => e.textContent), confirmation: document.querySelector('.el-message-box')?.textContent })`))
  }
  throw error
} finally { socket?.close(); chrome.kill() }
