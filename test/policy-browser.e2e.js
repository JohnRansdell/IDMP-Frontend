import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { api } from './system-test-client.mjs'

const evidence = resolve('.tmp/policy-browser'), tag = `BROWSER_${Date.now()}`
await mkdir(evidence, { recursive: true })
const fixture = join(evidence, '政策验收.txt')
const text = `政策文件浏览器验收\n${tag}\n文件内容应正确显示，重复选择同一文件应秒传。`
await writeFile(fixture, text)
const live = JSON.parse(await readFile('.tmp/policy-live/result.json', 'utf8'))
const profile = await mkdtemp(join(tmpdir(), 'idmp-policy-'))
const debugPort = 41819
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, id = 0
const pending = new Map(), errors = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 300; attempt++) { if (await predicate()) return; await delay(100) }
  throw new Error(`${label} timed out`)
}
async function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function click(label, scope = 'document') {
  assert.equal(await evaluate(`(()=>{const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true})()`), true, label)
}
async function screenshot(name) { await writeFile(join(evidence, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
async function selectFile() {
  const root = await send('DOM.getDocument')
  const input = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: 'input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [fixture] })
}
async function noMessageError() { assert.equal(await evaluate(`document.querySelector('.el-message--error')?.textContent||''`), '') }
try {
  let target
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(page => page.type === 'page'); return !!target } catch { return false } }, 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    const request = pending.get(message.id)
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result) }
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__policyCalls=[];const f=window.fetch.bind(window);window.fetch=async(...args)=>{const r=await f(...args);window.__policyCalls.push({url:String(args[0]),method:args[1]?.method||'GET',status:r.status});return r}` })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/policies' })
  await waitFor(() => evaluate(`!!document.querySelector('.policy-page')&&!document.querySelector('.el-loading-mask')`), 'Policy page')
  await evaluate(`window.__policy=document.querySelector('.policy-page').__vueParentComponent.setupState`)
  await click('新建政策文件')
  await evaluate(`Object.assign(window.__policy.metadata,{name:'政策浏览器验收 ${tag}',code:'${tag}',category:'QUALITY',issuingOrganization:'测试机构'})`)
  await click('保存')
  await waitFor(() => evaluate(`!!window.__policy.detail?.policyFile?.id&&!window.__policy.saving`), 'Saved metadata')
  await click('上传新版本')
  await selectFile()
  await waitFor(() => evaluate(`!!window.__policy.uploaded&&!window.__policy.uploading`), 'First upload')
  assert.equal(await evaluate(`window.__policy.uploadState`), '上传完成')
  await evaluate(`window.__policy.versionForm.issueDate='2026-10-04'`)
  await click('保存草稿')
  await waitFor(() => evaluate(`window.__policy.detail?.versions?.length===1&&!window.__policy.saving`), 'Draft version')
  await click('发布')
  await waitFor(() => evaluate(`!!document.querySelector('.el-message-box')`), 'Publish confirmation')
  await click('确定', `document.querySelector('.el-message-box')`)
  await waitFor(() => evaluate(`window.__policy.detail.versions[0].publicationStatus==='PUBLISHED'&&!window.__policy.saving`), 'Published version')
  await delay(3500)
  await noMessageError()
  await click('查看文件')
  await waitFor(() => evaluate(`document.querySelector('.policy-viewer pre')?.textContent.includes('${tag}')`), 'Protected text preview')
  assert.equal(await evaluate(`document.querySelector('.policy-viewer pre').textContent`), text)
  await screenshot('text-desktop.png')
  await evaluate(`window.__policy.viewerId=''`)
  await click('上传新版本')
  const uploadCount = await evaluate(`window.__policyCalls.filter(r=>r.url.endsWith('/file-objects/upload')).length`)
  await selectFile()
  await waitFor(() => evaluate(`window.__policy.uploadState==='秒传完成'`), 'Instant upload')
  assert.equal(await evaluate(`window.__policyCalls.filter(r=>r.url.endsWith('/file-objects/upload')).length`), uploadCount, 'Instant upload must not transfer multipart bytes')
  await screenshot('instant-desktop.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 })
  await screenshot('upload-mobile.png')
  const overflow = await evaluate(`Array.from(document.querySelectorAll('.el-dialog')).filter(el=>el.getBoundingClientRect().width>0).map(el=>({width:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}))`)
  assert.ok(overflow.every(item => item.scroll <= item.width + 2 && item.left >= 0 && item.right <= 391), JSON.stringify(overflow))
  await evaluate(`window.__policy.versionVisible=false;window.__policy.detailVisible=false`)
  await delay(500)
  await screenshot('list-mobile.png')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  await delay(500)
  await screenshot('list-desktop.png')
  const own = await evaluate(`({policyId:window.__policy.detail.policyFile.id,versionId:window.__policy.detail.versions[0].id})`)
  for (const [kind, file] of [['pdf', live.pdfFile], ['docx', live.docxFile]]) {
    const detail = await api('POST', `/meta/policy-files/${own.policyId}/versions`, { issueDate: '2026-10-04', fileObjectId: file.id, contentHash: file.sha256 })
    const version = detail.versions.find(version => version.fileObjectId === file.id)
    await evaluate(`window.__policy.viewerId='${version.id}'`)
    await waitFor(() => evaluate(kind === 'pdf' ? `!!document.querySelector('.policy-viewer iframe')?.src.startsWith('blob:')` : `document.querySelector('.policy-viewer')?.textContent.includes('此文件格式需下载查看')`), `${kind} preview`)
    await delay(1200)
    await screenshot(`${kind}-desktop.png`)
    await evaluate(`window.__policy.viewerId=''`)
    await delay(500)
  }
  const reference = await api('POST', `/mappings/indicator-versions/${live.indicatorVersionId}/policy-references`, { policyFileVersionId: own.versionId, relationRole: 'SOURCE', citationText: '浏览器关联查看验收' })
  try {
    await send('Page.navigate', { url: `http://127.0.0.1:5173/indicator/view/${live.indicatorId}?versionId=${live.indicatorVersionId}` })
    await waitFor(() => evaluate(`!!document.querySelector('.policy-reference-form')`), 'Published indicator detail')
    await evaluate(`document.querySelector('.policy-reference-form .el-select__wrapper').click()`)
    await waitFor(() => evaluate(`Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(el=>el.textContent.includes('${tag}'))`), 'Policy picker names')
    await evaluate(`document.querySelector('.policy-reference-form .el-select__wrapper').click()`)
    await click('查看', `document.querySelector('.policy-reference-form').previousElementSibling`)
    await waitFor(() => evaluate(`document.querySelector('.policy-viewer pre')?.textContent.includes('${tag}')`), 'Indicator policy preview')
    await screenshot('indicator-reference.png')
  } finally { await api('POST', `/mappings/policy-references/${reference.id}/invalidate`, { resourceVersion: reference.resourceVersion }) }
  assert.deepEqual(errors, [])
  const result = { passed: true, tag, ...own, evidence, overflow, errors, requests: await evaluate(`window.__policyCalls`) }
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure.png')
    await writeFile(join(evidence, 'failure.json'), JSON.stringify(await evaluate(`({url:location.href,text:document.body.innerText,requests:window.__policyCalls})`), null, 2))
  }
  throw error
} finally { socket?.close(); chrome.kill() }
