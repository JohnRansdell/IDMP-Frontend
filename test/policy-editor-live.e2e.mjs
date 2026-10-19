import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const env = await readFile('.env.local', 'utf8')
const backend = process.env.IDMP_SYSTEM_API || `${env.match(/^VITE_API_PROXY_TARGET=(.+)$/m)?.[1].trim().replace(/\/$/, '')}/api/v1`
assert.match(backend, /^https?:\/\//, 'Configure IDMP_SYSTEM_API or VITE_API_PROXY_TARGET')
const tag = `POLICY_FLOW_${Date.now()}`
const evidence = resolve('.tmp/policy-editor-live', tag)
await mkdir(evidence, { recursive: true })
const indicatorId = process.env.IDMP_POLICY_INDICATOR_ID || '102027642461313070'
const text = `政策引用真实联调\n${tag}\n第三章：本文件用于指标来源依据的上传、发布、引用、预览和失效验证。`
const filePath = join(evidence, `${tag}.txt`)
await writeFile(filePath, text)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const parse = text => JSON.parse(text, (key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) ? context.source : value)
const calls = [], checks = [], errors = []
async function api(method, path, body) {
  const response = await fetch(backend + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  const result = parse(await response.text())
  calls.push({ method, path, http: response.status, code: result.code })
  assert.ok(response.ok && ['OK', '0'].includes(result.code), `${method} ${path}: ${response.status} ${result.message}`)
  return result.data
}
function checked(name) { checks.push(name); console.log(`PASS ${name}`) }
const versions = await api('GET', `/indicators/${indicatorId}/versions`)
const latest = [...versions].sort((a, b) => Number(b.versionNo) - Number(a.versionNo))[0]
assert.equal(latest.publicationStatus || latest.status, 'PUBLISHED', 'Choose an indicator whose latest version is published')
const versionId = String(latest.id)
const baseline = await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)
const definitionBefore = await api('GET', `/indicator-versions/${versionId}`)
const appPort = 41871, debugPort = 41872
const profile = await mkdtemp(join(tmpdir(), 'idmp-policy-real-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(appPort), '--strictPort'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_BASE_URL: '/api/v1', VITE_API_PROXY_TARGET: backend.replace(/\/api\/v1\/?$/, '') } })
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) { for (let i = 0; i < 250; i++) { if (await check()) return; await delay(100) } throw new Error(`Timed out: ${label}`) }
let socket, nextId = 0, policyId, policyVersionId, fileId, ownReference, replacementVersionId, replacementReference
const pending = new Map()
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function click(label, scope = 'document') {
  assert.equal(await evaluate(`(() => { const el = Array.from(${scope}.querySelectorAll('button')).find(el => el.textContent.trim() === ${JSON.stringify(label)}); if (!el || el.disabled) return false; el.click(); return true })()`), true, `Click ${label}`)
}
async function screenshot(name) { await writeFile(join(evidence, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
async function navigate(path, selector) {
  await send('Page.navigate', { url: `http://127.0.0.1:${appPort}${path}` })
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), path)
}
async function chooseFile() {
  const document = await send('DOM.getDocument')
  const input = await send('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [filePath] })
}
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${appPort}`)).ok } catch { return false } }, 'Vite')
  let target
  await until(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')
  // Observe real fetch calls without changing any response or request.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__calls=[]; const original=window.fetch.bind(window); window.fetch=async(...args)=>{try{const r=await original(...args);window.__calls.push({url:String(args[0]),method:args[1]?.method||'GET',http:r.status});return r}catch(e){window.__calls.push({url:String(args[0]),method:args[1]?.method||'GET',error:e.message});throw e}}` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await navigate('/policies', '.policy-page')
  await evaluate(`window.__policy = document.querySelector('.policy-page').__vueParentComponent.setupState`)
  await until(() => evaluate(`!!window.__policy.uploadLimits && !window.__policy.loading`), 'policy metadata and upload limits')
  const options = await api('GET', '/meta/file-objects/upload-options')
  assert.equal(await evaluate(`window.__policy.uploadLimits.maxBytes`), options.maxBytes)
  checked(`动态上传限制 ${options.maxBytes} 字节`)
  await click('新建政策文件')
  await evaluate(`Object.assign(window.__policy.metadata, ${JSON.stringify({ name: `政策全流程联调 ${tag}`, code: tag, category: 'QUALITY', issuingOrganization: '前端联调验收', description: '自动化独立测试数据；引用验收后失效，附件及政策保留供复核。' })})`)
  await click('保存')
  await until(() => evaluate(`!!window.__policy.detail?.policyFile?.id && !window.__policy.saving`), 'policy created')
  policyId = await evaluate(`String(window.__policy.detail.policyFile.id)`)
  checked('真实浏览器创建政策主记录')
  await click('上传新版本'); await chooseFile()
  await until(() => evaluate(`!!window.__policy.uploaded && !window.__policy.uploading`), 'upload file')
  assert.equal(await evaluate(`window.__policy.uploadState`), '上传完成')
  fileId = await evaluate(`String(window.__policy.uploaded.id)`)
  checked('真实附件上传')
  await evaluate(`window.__policy.versionForm.issueDate = '2026-10-18'`)
  await click('保存草稿')
  await until(() => evaluate(`window.__policy.detail?.versions?.length === 1 && !window.__policy.saving`), 'draft saved')
  policyVersionId = await evaluate(`String(window.__policy.detail.versions[0].id)`)
  await click('发布'); await until(() => evaluate(`!!document.querySelector('.el-message-box')`), 'publish confirmation')
  await click('确定', `document.querySelector('.el-message-box')`)
  await until(() => evaluate(`window.__policy.detail.versions[0].publicationStatus === 'PUBLISHED' && !window.__policy.saving`), 'policy published')
  assert.equal(String((await api('GET', `/meta/policy-files/${policyId}`)).policyFile.currentPublishedVersionId), policyVersionId)
  checked('保存草稿、发布及后端回读')
  await click('查看文件')
  await until(() => evaluate(`document.querySelector('.policy-viewer pre')?.textContent.includes('${tag}')`), 'policy preview')
  assert.equal(await evaluate(`document.querySelector('.policy-viewer pre').textContent`), text)
  await screenshot('policy-preview')
  await evaluate(`window.__policy.viewerId = ''`)
  await click('上传新版本')
  const uploads = await evaluate(`window.__calls.filter(call => call.url.endsWith('/file-objects/upload')).length`)
  await chooseFile()
  await until(() => evaluate(`window.__policy.uploadState === '秒传完成'`), 'instant upload')
  assert.equal(await evaluate(`window.__calls.filter(call => call.url.endsWith('/file-objects/upload')).length`), uploads)
  await click('取消', `document.querySelector('.policy-version-dialog')`)
  const response = await fetch(`${backend}/meta/file-objects/${fileId}/content`, { signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200)
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(Buffer.from(text)))
  checked('TXT预览、原文哈希一致及重复上传秒传')
  calls.push(...await evaluate(`window.__calls`))
  await navigate(`/indicator/edit/${indicatorId}`, '.editor-page')
  await evaluate(`window.__editor = document.querySelector('.editor-page').__vueParentComponent.setupState`)
  await until(() => evaluate(`window.__editor.indicatorWorkflow.published && !window.__editor.editLoadState.loading`), 'published indicator loaded')
  assert.equal(await evaluate(`String(window.__editor.indicatorWorkflow.versionId)`), versionId)
  await evaluate(`window.__editor.activeTab = 'basic'`)
  await until(() => evaluate(`!!document.querySelector('.indicator-policy-sources > .el-select')`), 'policy source selector')
  await evaluate(`document.querySelector('.indicator-policy-sources > .el-select .el-select__wrapper').click()`)
  await until(() => evaluate(`!!document.querySelector('.el-select-dropdown:not([style*="display: none"])')`), 'picker opened')
  await evaluate(`(() => { const input = document.querySelector('.indicator-policy-sources > .el-select input'); input.value = '${tag}'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await until(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el => el.textContent.includes('${tag}'))`), 'search newly published policy')
  await evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).find(el => el.textContent.includes('${tag}')).click()`)
  await until(() => evaluate(`window.__editor.form.policyDrafts.length === 1`), 'pending source selected')
  await evaluate(`window.__editor.activeTab = 'policy'`)
  await until(() => evaluate(`!!document.querySelector('.indicator-policy-basis .pending-source textarea')`), 'optional basis editor')
  await evaluate(`(() => { const form = document.querySelector('.indicator-policy-basis .pending-source'); const input = form.querySelector('input'); input.value = '第三章 真实联调'; input.dispatchEvent(new Event('input', { bubbles: true })); const text = form.querySelector('textarea'); text.value = '${tag} 引用原文'; text.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await click('保存待绑定来源及依据', `document.querySelector('.indicator-policy-basis')`)
  await evaluate(`window.__editor.activeTab = 'basic'`)
  await until(() => evaluate(`document.querySelector('.indicator-policy-sources .el-table__body')?.textContent.includes('${tag}')`), 'reference saved')
  ownReference = (await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)).find(row => String(row.policyFileVersionId) === policyVersionId)
  assert.ok(ownReference)
  assert.equal(ownReference.citationLocation, '第三章 真实联调')
  assert.equal(ownReference.citationText, `${tag} 引用原文`)
  await screenshot('editor-reference')
  checked('编辑页搜索新发布政策并保存引用、出处和原文')
  await click('查看文件', `Array.from(document.querySelectorAll('.indicator-policy-sources .el-table__body tr')).find(el => el.textContent.includes('${tag}'))`)
  await until(() => evaluate(`document.querySelector('.policy-viewer pre')?.textContent.includes('${tag}')`), 'editor attachment preview')
  assert.equal(await evaluate(`document.querySelector('.policy-viewer pre').textContent`), text)
  await screenshot('editor-preview')
  checked('指标编辑页真实附件预览')
  calls.push(...await evaluate(`window.__calls`))
  await navigate(`/indicator/view/${indicatorId}?versionId=${versionId}`, '.indicator-detail-page')
  await until(() => evaluate(`document.querySelector('.policy-card .el-table__body')?.textContent.includes('${tag}')`), 'detail matches editor')
  await screenshot('detail-reference')
  checked('跨页面回读：指标详情显示同一政策引用')
  calls.push(...await evaluate(`window.__calls`))
  await navigate(`/indicator/edit/${indicatorId}`, '.editor-page')
  await evaluate(`window.__editor = document.querySelector('.editor-page').__vueParentComponent.setupState`)
  await until(() => evaluate(`window.__editor.indicatorWorkflow.published && !window.__editor.editLoadState.loading`), 'editor reload')
  await evaluate(`window.__editor.activeTab = 'basic'`)
  await until(() => evaluate(`document.querySelector('.indicator-policy-sources .el-table__body')?.textContent.includes('${tag}')`), 'reference survives reload')
  // Verify the editor retains trial controls without introducing query or batch writes.
  await evaluate(`window.__editor.activeTab = 'formula'`)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#pane-formula button')).some(el => el.textContent.trim() === '即时运行')`), false)
  checked('指标编辑保留试算流程，移除即时运行入口')
  await evaluate(`window.__editor.activeTab = 'scene'`)
  await until(() => evaluate(`!document.querySelector('#pane-scene .el-loading-mask')`), 'optional scenarios loaded')
  assert.equal(await evaluate(`document.querySelector('#pane-scene .el-alert--error')?.textContent || ''`), '')
  checked('真实关联场景列表读取')
  await evaluate(`window.__editor.activeTab = 'basic'`)
  const replacement = await api('POST', '/meta/policy-files', { code: `${tag}_R`, name: `替代来源 ${tag}`, category: 'QUALITY' })
  const replacementDraft = await api('POST', `/meta/policy-files/${replacement.policyFile.id}/versions`, { issueDate: '2026-10-18', fileObjectId: fileId, contentHash: digest(Buffer.from(text)) })
  const replacementVersion = replacementDraft.versions[0]
  replacementVersionId = String(replacementVersion.id)
  await api('POST', `/meta/policy-files/${replacement.policyFile.id}/versions/${replacementVersionId}/publish`, { resourceVersion: replacementVersion.resourceVersion })
  replacementReference = await api('POST', `/mappings/indicator-versions/${versionId}/policy-references`, { policyFileVersionId: replacementVersionId, relationRole: 'SOURCE', citationLocation: '', citationText: '' })
  await click('刷新已保存来源', `document.querySelector('.indicator-policy-sources')`)
  await until(() => evaluate(`document.querySelectorAll('.indicator-policy-sources .el-table__body tr').length >= 2`), 'replacement source loaded')
  const rowScope = `Array.from(document.querySelectorAll('.indicator-policy-sources .el-table__body tr')).find(el => el.textContent.includes('政策全流程联调 ${tag}'))`
  await click('失效', rowScope)
  await until(() => evaluate(`!!document.querySelector('.el-message-box')`), 'invalidate confirmation')
  await click('取消', `document.querySelector('.el-message-box')`)
  await until(() => evaluate(`!document.querySelector('.el-message-box') || getComputedStyle(document.querySelector('.el-message-box').closest('.el-overlay')).display === 'none'`), 'cancel dialog transition completed')
  assert.ok((await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)).some(row => String(row.id) === String(ownReference.id)))
  checked('取消失效不改变真实引用')
  await click('失效', rowScope)
  await until(() => evaluate(`!!document.querySelector('.el-message-box') && getComputedStyle(document.querySelector('.el-message-box').closest('.el-overlay')).display !== 'none'`), 'invalidate confirmation again')
  await click('确定', `document.querySelector('.el-message-box')`)
  await until(() => evaluate(`!document.querySelector('.indicator-policy-sources .el-table__body')?.textContent.includes('政策全流程联调 ${tag}') && !document.querySelector('.indicator-policy-sources .state-panel--loading')`), 'row removed')
  const after = await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)
  assert.ok(!after.some(row => String(row.id) === String(ownReference.id)))
  assert.deepEqual(after.map(row => String(row.id)).sort(), [...baseline.map(row => String(row.id)), String(replacementReference.id)].sort())
  await api('POST', `/mappings/policy-references/${replacementReference.id}/invalidate`, { resourceVersion: replacementReference.resourceVersion })
  assert.deepEqual((await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)).map(row => String(row.id)).sort(), baseline.map(row => String(row.id)).sort())
  assert.deepEqual(await api('GET', `/indicator-versions/${versionId}`), definitionBefore)
  checked('确认失效并回读：原有引用与指标版本定义保持一致')
  calls.push(...await evaluate(`window.__calls`))
  assert.deepEqual(errors, [])
  await screenshot('reference-invalidated')
  checked('浏览器无未捕获运行时异常')
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure').catch(() => {})
    await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: error.message, page: await evaluate(`({ url: location.href, text: document.body.innerText, calls: window.__calls })`).catch(() => null) }, null, 2))
  }
  throw error
} finally {
  let cleanupError = null
  try {
    // Only invalidate references to this run's newly created policy version.
    if (policyVersionId) {
      const active = await api('GET', `/mappings/indicator-versions/${versionId}/policy-references`)
      for (const reference of active.filter(row => [policyVersionId, replacementVersionId].includes(String(row.policyFileVersionId)))) await api('POST', `/mappings/policy-references/${reference.id}/invalidate`, { resourceVersion: reference.resourceVersion })
    }
  } catch (error) { cleanupError = error.message }
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ tag, backend, indicatorId, versionId, policyId, policyVersionId, fileId, referenceId: ownReference?.id, replacementVersionId, checks, calls, errors, cleanupError }, null, 2))
  socket?.close(); chrome.kill(); server.kill()
  console.log(JSON.stringify({ evidence, checks: checks.length, policyId, policyVersionId, referenceId: ownReference?.id, cleanupError }))
  if (cleanupError) throw new Error(`Reference cleanup failed: ${cleanupError}`)
}
