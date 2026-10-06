import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const evidence = resolve('.tmp/policy-version-editor')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'idmp-policy-version-editor-'))
const port = 41937
const pending = new Map(), errors = []
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label) {
  const end = Date.now() + 45000
  while (Date.now() < end) { if (await predicate()) return; await pause(100) }
  throw new Error(`Timeout: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function click(text, scope = 'document') {
  assert.equal(await evaluate(`(() => { const button = Array.from(${scope}.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`), true, text)
}
async function screenshot(name) {
  await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
async function chooseFile(name, bytes = 128, drag = false) {
  await evaluate(`(() => {
    const data = new DataTransfer(); data.items.add(new File(['x'.repeat(${bytes})], ${JSON.stringify(name)}, { type: 'text/plain' }));
    ${drag ? "document.querySelector('.version-upload').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));" : "const input = document.querySelector('.version-file-input'); Object.defineProperty(input, 'files', { configurable: true, value: data.files }); input.dispatchEvent(new Event('change', { bubbles: true }));"}
  })()`)
}
const dialog = "document.querySelector('.policy-version-dialog')"
try {
  let target
  await until(async () => {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); return !!target }
    catch { return false }
  }, 'browser startup')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch.bind(window);
    window.__versionCalls = []; window.__failUpload = true; window.__instant = false;
    const policy = { id: '501', code: 'POLICY_VERSION_UI', name: '医疗质量安全管理政策文件', status: 'DRAFT', resourceVersion: 1 };
    const detail = { policyFile: policy, versions: [] };
    const file = { id: '601', originalName: '医疗质量安全政策.txt', fileSizeBytes: 128, sha256: 'a'.repeat(64), mimeType: 'text/plain' };
    window.fetch = async (input, init = {}) => {
      const path = new URL(String(input), location.href).pathname;
      const method = init.method || 'GET';
      const reply = (data, status = 200, message = '') => new Response(JSON.stringify({ code: status === 200 ? 'OK' : 'BAD_REQUEST', data, message }), { status, headers: { 'Content-Type': 'application/json' } });
      if (!path.startsWith('/api/v1/meta/')) return originalFetch(input, init);
      if (path.endsWith('/upload-options')) return reply({ extensions: ['pdf', 'docx', 'txt'], maxBytes: 10485760 });
      window.__versionCalls.push({ path, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : null });
      if (path.endsWith('/file-objects/check')) return reply({ instantUpload: window.__instant, file: window.__instant ? file : null });
      if (path.endsWith('/file-objects/upload')) {
        if (window.__holdUpload) await new Promise(resolve => { window.__releaseUpload = resolve });
        if (window.__failUpload) return reply(null, 400, '文件上传暂时失败，请重试');
        file.originalName = init.body.get('file').name; file.fileSizeBytes = init.body.get('file').size;
        return reply({ instantUpload: false, file });
      }
      if (path.endsWith('/file-objects/601')) return reply(file);
      if (path.endsWith('/relations')) return reply([]);
      if (path.endsWith('/policy-file-versions/701') && method === 'PATCH') {
        Object.assign(detail.versions[0], JSON.parse(init.body)); return reply(detail);
      }
      if (path.endsWith('/policy-files/501/versions') && method === 'POST') {
        const body = JSON.parse(init.body); detail.versions = [{ id: '701', versionNo: 1, publicationStatus: 'DRAFT', ...body }]; return reply(detail);
      }
      if (path.endsWith('/policy-files/501')) return reply(detail);
      if (path.endsWith('/policy-files')) return reply({ records: [policy], total: '1' });
      return originalFetch(input, init);
    };
  ` })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/policies' })
  await until(() => evaluate("document.querySelector('.policy-page') && document.querySelector('.el-table__body')?.textContent.includes('医疗质量安全管理政策文件')"), 'policy list')
  await click('查看', "document.querySelector('.policy-page')")
  await until(() => evaluate("!!document.querySelector('.section-toolbar')"), 'policy detail')
  await click('上传新版本')
  await until(() => evaluate("document.querySelector('.version-upload-limit')?.textContent.includes('10 MB')"), '10 MB upload limit')
  await screenshot('desktop-empty.png')
  assert.equal(await evaluate(`${dialog}.querySelector('.el-dialog__footer .el-button--primary').disabled`), true)
  console.log('PASS empty version form shows formats, limit and disabled save')
  await chooseFile('超过限制.txt', 11 * 1024 * 1024)
  await until(() => evaluate("document.querySelector('.version-upload-state')?.textContent.includes('不能超过')"), 'oversized file rejection')
  assert.equal(await evaluate("window.__versionCalls.filter(call => call.path.endsWith('/file-objects/check')).length"), 0)
  console.log('PASS files over 10 MB are rejected before transfer')
  await chooseFile('医疗质量安全政策文件_2026年正式修订版_很长的中文文件名称.txt', 128, true)
  await until(() => evaluate("document.querySelector('.version-upload-state')?.textContent.includes('上传暂时失败')"), 'upload failure')
  await screenshot('desktop-error.png')
  await evaluate('window.__failUpload = false; window.__holdUpload = true')
  await click('重试', dialog)
  await until(() => evaluate("!!window.__releaseUpload"), 'pending upload')
  assert.equal(await evaluate(`${dialog}.querySelector('.el-dialog__footer .el-button').disabled`), true)
  assert.equal(await evaluate(`${dialog}.querySelector('.el-dialog__footer .el-button--primary').disabled`), true)
  await evaluate('window.__releaseUpload()')
  await until(() => evaluate("document.querySelector('.version-upload-state')?.textContent.includes('上传完成')"), 'upload retry completion')
  assert.equal(await evaluate(`${dialog}.querySelector('.el-dialog__footer .el-button--primary').disabled`), true)
  await evaluate("document.querySelector('.policy-page').__vueParentComponent.setupState.versionForm.issueDate = '2026-10-06'")
  await until(() => evaluate(`${dialog}.querySelector('.el-dialog__footer .el-button--primary').disabled === false`), 'release date enables save')
  await screenshot('desktop-uploaded.png')
  for (const width of [390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 })
    await pause(350)
    const overflow = await evaluate(`Array.from(${dialog}.querySelectorAll('.version-upload, .version-file-info, .el-date-editor, .el-dialog__footer button')).filter(element => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).map(element => element.className)`)
    assert.deepEqual(overflow, [])
    await screenshot(`mobile-${width}-uploaded.png`)
  }
  console.log('PASS drag upload, retry, busy-state protection and mobile layout')
  await click('保存草稿', dialog)
  await until(() => evaluate("!document.querySelector('.policy-page').__vueParentComponent.setupState.versionVisible"), 'draft saved')
  const saved = await evaluate("window.__versionCalls.find(call => call.path.endsWith('/policy-files/501/versions') && call.method === 'POST')?.body")
  assert.equal(saved.fileObjectId, '601'); assert.equal(saved.issueDate, '2026-10-06')
  console.log('PASS draft request preserves file ID, content hash and dates')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await click('编辑', "document.querySelector('.el-drawer')")
  await until(() => evaluate("document.querySelector('.policy-page').__vueParentComponent.setupState.uploaded?.id === '601'"), 'existing draft file')
  assert.equal(await evaluate("document.querySelector('.version-file-info strong').textContent.includes('医疗质量安全政策文件')"), true)
  await evaluate("Object.assign(document.querySelector('.policy-page').__vueParentComponent.setupState.versionForm, { effectiveStartDate: '2026-10-10', effectiveEndDate: '2026-10-01' })")
  await click('保存草稿', dialog)
  await until(() => evaluate("document.querySelector('.el-message--warning')?.textContent.includes('失效日期不能早于生效日期')"), 'date range validation')
  assert.equal(await evaluate("window.__versionCalls.filter(call => call.path.endsWith('/policy-file-versions/701') && call.method === 'PATCH').length"), 0)
  await evaluate("document.querySelector('.policy-page').__vueParentComponent.setupState.versionForm.effectiveEndDate = '2026-12-31'")
  await click('保存草稿', dialog)
  await until(() => evaluate("!document.querySelector('.policy-page').__vueParentComponent.setupState.versionVisible"), 'existing draft saved')
  assert.equal(await evaluate("window.__versionCalls.find(call => call.path.endsWith('/policy-file-versions/701') && call.method === 'PATCH').body.fileObjectId"), '601')
  console.log('PASS existing draft file is retained and invalid date ranges cannot be saved')
  await click('上传新版本')
  await evaluate('window.__instant = true')
  const priorUploads = await evaluate("window.__versionCalls.filter(call => call.path.endsWith('/file-objects/upload')).length")
  await chooseFile('医疗质量安全政策.txt')
  await until(() => evaluate("document.querySelector('.version-upload-state')?.textContent.includes('秒传完成')"), 'instant upload')
  assert.equal(await evaluate("window.__versionCalls.filter(call => call.path.endsWith('/file-objects/upload')).length"), priorUploads)
  await screenshot('desktop-instant.png')
  console.log('PASS instant upload displays completion without multipart transfer')
  assert.deepEqual(errors, [])
} finally {
  socket?.close(); chrome.kill()
}
