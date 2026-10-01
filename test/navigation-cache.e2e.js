import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const appUrl = process.env.IDMP_TEST_URL || 'http://127.0.0.1:5173'
const debugPort = 41742
const profile = await mkdtemp(join(tmpdir(), 'idmp-navigation-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-extensions', '--disable-background-networking',
  '--disable-gpu-sandbox', '--use-angle=swiftshader', '--gl=angle', '--in-process-gpu',
  `${appUrl}/dashboard?id=quality-overview-quality-safety`
], { stdio: 'ignore', windowsHide: true })

let socket
let messageId = 0
const pending = new Map()
async function waitFor(check, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const result = await check()
      if (result) return result
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting for navigation state')
}
function send(method, params = {}) {
  const id = ++messageId
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20_000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function value(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}

try {
  const target = await waitFor(async () => {
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json())
    return pages.find(page => page.type === 'page' && page.url.includes('/dashboard'))
  })
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timeout)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  await waitFor(() => value('Boolean(document.querySelector(".idmp-sidebar a[href=\\"/alerts\\"]"))'))
  await value(`window.__dashboardNode = document.querySelector('.idmp-main > *');
    window.__sidebarRemoved = 0;
    window.__sidebarObserver = new MutationObserver(() => {
      if (!document.querySelector('.idmp-sidebar')) window.__sidebarRemoved++;
    });
    window.__sidebarObserver.observe(document.querySelector('#app'), { childList: true, subtree: true });`)
  await value('document.querySelector(\'.idmp-sidebar a[href="/alerts"]\').click()')
  await waitFor(() => value('location.pathname === "/alerts"'))
  assert.equal(await value('Boolean(document.querySelector(\'.idmp-sidebar a[href="/alerts"]\'))'), true)
  await value('document.querySelector(\'.idmp-sidebar a[href="/dashboard"]\').click()')
  await waitFor(() => value('location.pathname === "/dashboard"'))
  assert.equal(await value('window.__dashboardNode === document.querySelector(".idmp-main > *")'), true)
  assert.equal(await value('window.__sidebarRemoved'), 0)
  console.log('Navigation cache smoke test passed')
} finally {
  socket?.close()
  chrome.kill()
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
