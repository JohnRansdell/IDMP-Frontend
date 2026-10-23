import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const folder = `.tmp/dashboard-memory-20261023${process.env.IDMP_MEMORY_RUN ? `/${process.env.IDMP_MEMORY_RUN}` : ''}`
const rounds = Number(process.env.IDMP_MEMORY_ROUNDS || 20)
const dashboardPath = `/dashboard?id=${process.env.IDMP_DASHBOARD_ID || '5716154056296841437'}`
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: Number(process.env.IDMP_DPR || 1), reducedMotion: 'reduce' })
const page = await context.newPage()
const session = await context.newCDPSession(page)
const browserSession = await browser.newBrowserCDPSession()
await session.send('Performance.enable')
const requests = [], samples = [], errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('crash', () => errors.push('page crashed'))
const limit = async (promise, label) => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 20000) })]) }
  finally { clearTimeout(timer) }
}
page.on('response', response => {
  if (!response.url().includes('/api/v1/')) return
  requests.push({ url: response.url().replace(origin, ''), method: response.request().method(), status: response.status(), body: response.request().postData() })
})
async function sample(label) {
  const before = await session.send('Runtime.getHeapUsage')
  await session.send('HeapProfiler.collectGarbage')
  const heap = await session.send('Runtime.getHeapUsage')
  const dom = await session.send('Memory.getDOMCounters')
  const state = await limit(page.evaluate(() => {
    let component = document.querySelector('.idmp-dashboard')?.__vueParentComponent
    if (!component) component = [...document.querySelectorAll('main *')].map(node => node.__vueParentComponent).find(item => item?.type.__name === 'Dashboard')
    while (component && component.type.__name !== 'Dashboard') component = component.parent
    const state = component?.setupState
    const datasets = Object.entries(state?.remoteWidgetDatasets || {}).map(([id, data]) => ({ id, rows: data.rows?.length, fields: data.fields?.length }))
    return {
      title: document.querySelector('main')?.innerText.slice(0, 150),
      canvas: [...document.querySelectorAll('canvas')].map(node => ({ width: node.width, height: node.height, pixelsBytes: node.width * node.height * 4 })),
      visibleNodes: document.querySelectorAll('*').length,
      dashboard: state ? { status: state.dashboardStatus, name: state.currentDashboardName, datasets,
        sources: state.catalogIndicatorSources?.length, sourcesBytes: JSON.stringify(state.catalogIndicatorSources || []).length,
        uniqueSources: new Set((state.catalogIndicatorSources || []).map(source => source.code)).size,
        catalogLoading: state.indicatorCatalogLoading, catalogError: state.indicatorCatalogError,
        queryCache: state.remoteDashboardQueryCache?.size,
        queryCacheRows: [...(state.remoteDashboardQueryCache?.values() || [])].map(entry => Object.values(entry.result.widgets || {}).reduce((sum, widget) => sum + (widget.rows?.length || 0), 0)),
        versionRequests: state.dashboardIndicatorVersionRequests?.size, hydrationRequests: state.indicatorHydrationRequests?.size,
        queryBytes: JSON.stringify(state.dashboardQueryResult || {}).length,
        schemaBytes: JSON.stringify(state.dashboardSchema || {}).length,
        historyLength: state.dashboardHistory?.length,
        filterOptions: Object.values(state.remoteFilterOptions || {}).map(items => items.length)
      } : null
    }
  }), label)
  const processes = (await browserSession.send('SystemInfo.getProcessInfo')).processInfo
  const processMemory = process.env.IDMP_OS_MEMORY ? JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-Process | Where-Object { $_.Id -in @(${processes.map(item => Number(item.id)).join(',')}) } | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`], { encoding: 'utf8' })) : []
  const record = { label, before, heap, dom, state, requests: requests.length, processes, processMemory }
  samples.push(record)
  await writeFile(`${folder}/partial-dpr-${process.env.IDMP_DPR || 1}.json`, JSON.stringify({ samples, requests, errors }, null, 2))
  console.log(JSON.stringify(record))
}
async function settleDashboard() {
  await page.waitForFunction(() => {
    let component = [...document.querySelectorAll('main *')].map(node => node.__vueParentComponent).find(item => item?.type.__name === 'Dashboard')
    return component?.setupState.dashboardStatus === 'ready' && !component.setupState.remoteQueryLoading
      && !component.setupState.indicatorCatalogLoading && component.setupState.catalogIndicatorSources.length > 0
  }, undefined, { timeout: 120000 })
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function navigate(path) {
  await page.locator('main').evaluate((node, path) => node.__vueParentComponent.proxy.$router.push(path), path)
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
}
try {
  await sample('blank')
  await page.goto(`${origin}/indicator`)
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  await sample('indicator-baseline')
  await navigate(dashboardPath)
  await settleDashboard()
  await sample('isolated-first-load')
  await page.screenshot({ path: `${folder}/isolated-first-load.png`, fullPage: true })
  for (let index = 0; index < rounds; index++) {
    await page.locator('main').evaluate(async (node, index) => {
      let component = [...node.querySelectorAll('*')].map(element => element.__vueParentComponent).find(item => item?.type.__name === 'Dashboard')
      while (component && component.type.__name !== 'Dashboard') component = component.parent
      await component.setupState.applyRemotePeriodSelection({ type: 'MONTHLY', month: `2026-${String(index % 3 + 1).padStart(2, '0')}` })
    }, index)
    await settleDashboard()
    await sample(`period-change-${index + 1}`)
  }
  for (let index = 0; index < rounds; index++) {
    await navigate('/indicator')
    await sample(`leave-${index + 1}`)
    await navigate(dashboardPath)
    await settleDashboard()
    await sample(`return-${index + 1}`)
  }
  const started = Date.now()
  await page.getByTestId('dashboard-period-type').click({ timeout: 5000 })
  await page.getByRole('option', { name: '季度', exact: true }).waitFor({ state: 'visible', timeout: 5000 })
  await page.keyboard.press('Escape')
  const interactionMs = Date.now() - started
  const dashboardSamples = samples.filter(sample => sample.state.dashboard)
  for (const sample of dashboardSamples) {
    assert.equal(sample.state.dashboard.catalogError, '')
    assert.equal(sample.state.dashboard.catalogLoading, false)
    assert.equal(sample.state.dashboard.sources, dashboardSamples[0].state.dashboard.sources)
    assert.equal(sample.state.dashboard.uniqueSources, sample.state.dashboard.sources)
  }
  const tail = samples.filter(sample => sample.label.startsWith('return-')).slice(-10)
  assert.ok(Math.max(...tail.map(sample => sample.heap.usedSize)) - Math.min(...tail.map(sample => sample.heap.usedSize)) < 10 * 1024 * 1024, 'retained heap must stabilize across the last return cycles')
  assert.ok(Math.max(...tail.map(sample => sample.dom.nodes)) - Math.min(...tail.map(sample => sample.dom.nodes)) < 100, 'DOM nodes must not accumulate on each return')
  assert.deepEqual(errors, [])
  const catalogPages = requests.filter(request => /\/indicators\?page=\d+&size=100$/.test(request.url)).map(request => Number(new URL(request.url, origin).searchParams.get('page')))
  const pagesPerLoad = Math.max(...catalogPages)
  assert.ok(catalogPages.length <= (rounds + 2) * pagesPerLoad, 'catalog requests must remain bounded by initialization and activations')
  assert.ok(catalogPages.every((page, index) => page === index % pagesPerLoad + 1), 'catalog page numbers must advance without repeating a full list')
  await page.screenshot({ path: `${folder}/isolated-final-dpr-${process.env.IDMP_DPR || 1}.png`, fullPage: true })
  const responses = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/v1/')).map(entry => ({ url: entry.name, encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize, duration: entry.duration })))
  await writeFile(`${folder}/results-dpr-${process.env.IDMP_DPR || 1}.json`, JSON.stringify({ samples, requests, responses, errors, interactionMs, rounds }, null, 2))
  console.log(JSON.stringify({ passed: true, interactionMs, rounds, catalogSources: dashboardSamples[0].state.dashboard.sources }))
} finally {
  await writeFile(`${folder}/partial-dpr-${process.env.IDMP_DPR || 1}.json`, JSON.stringify({ samples, requests, errors }, null, 2))
  await browser.close()
}
