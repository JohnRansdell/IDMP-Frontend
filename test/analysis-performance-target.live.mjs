import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const folder = '.tmp/analysis-performance-target-20261023'
await mkdir(folder, { recursive: true })
const resources = JSON.parse(await readFile('.tmp/full-system-audit-20261023/resources.json', 'utf8'))
const checks = []
async function api(path) {
  const response = await fetch(`${origin}/api/v1${path}`)
  const payload = parseJsonPreservingLargeIntegers(await response.text())
  assert.ok(response.ok && payload.code === 'OK', `${path}: ${payload.message}`)
  return payload.data
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function snapshot(indicatorId, versionId, granularity = 'MONTHLY') {
  await page.goto(`${origin}/analysis?indicator=${indicatorId}&indicatorVersionId=${versionId}&granularity=${granularity}&periodStart=2026-01-01&periodEnd=2026-01-31`)
  await page.waitForFunction(() => {
    let component = document.querySelector('.indicator-analysis')?.__vueParentComponent
    while (component && component.type.__name !== 'IndicatorAnalysis') component = component.parent
    return component?.setupState.trendBackendAnalysis && !component.setupState.analysisLoading
  }, undefined, { timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
  return page.locator('.indicator-analysis').evaluate(node => {
    let component = node.__vueParentComponent
    while (component && component.type.__name !== 'IndicatorAnalysis') component = component.parent
    const state = component.setupState
    let chartComponent = node.querySelector('.idmp-chart')?.__vueParentComponent
    while (chartComponent && chartComponent.type.__name !== 'IdmpChart') chartComponent = chartComponent.parent
    const chart = chartComponent?.setupState.chart
    const rendered = chart ? {
      targetY: state.currentProfile.markLineValue == null ? null : chart.convertToPixel({ yAxisIndex: 0 }, state.currentProfile.markLineValue),
      redLines: chart.getZr().storage.getDisplayList().filter(item => item.style?.stroke === '#b4232c').map(item => ({ type: item.type, shape: item.shape }))
    } : null
    return JSON.parse(JSON.stringify({ profile: state.currentProfile, option: state.trendOption,
      analysis: state.trendBackendAnalysis, overview: state.backendAnalysis, rows: state.trendTableRows, rendered }))
  })
}
try {
  const versionId = '102027642460761114'
  const version = await api(`/indicator-versions/${versionId}`)
  const target = await api(`/indicator-versions/${versionId}/performance-target`)
  assert.equal(Number(target.targetValue), 0.003)
  const configured = await snapshot(version.indicatorId, versionId)
  assert.equal(configured.analysis.performanceTarget.targetValue, target.targetValue)
  assert.equal(configured.profile.targetLabel, `目标值：${target.targetDisplayValue}`)
  const coordinate = Number(target.targetValue) * (configured.profile.unit === '%' ? 100 : 1)
  assert.equal(configured.option.series[0].markLine.data[0].yAxis, coordinate)
  assert.equal(configured.option.series[0].markLine.label.formatter, '目标值：0.30%')
  assert.ok(configured.rendered?.redLines.some(line => Math.abs(line.shape.y1 - configured.rendered.targetY) <= 1),
    `Rendered target line must match axis coordinates: ${JSON.stringify(configured.rendered)}`)
  assert.ok(configured.rows.some(row => row.label === '2026-01'))
  assert.ok((await page.locator('main').innerText()).includes('目标值：0.30%'))
  await page.screenshot({ path: `${folder}/configured-mortality.png`, fullPage: true })
  checks.push({ name: 'real mortality uses persisted 0.30% target with chart-axis coordinates', passed: true, target, configured })

  const emptyVersionId = resources.arithmetic.version.id
  const emptyTarget = await api(`/indicator-versions/${emptyVersionId}/performance-target`)
  assert.equal(emptyTarget.targetValue, null)
  const empty = await snapshot(resources.arithmetic.indicator.id, emptyVersionId, 'STATIC')
  assert.equal(empty.profile.targetLabel, '目标值未配置')
  assert.equal(empty.profile.markLineValue, null)
  assert.equal(empty.option.series[0].markLine, undefined)
  await page.screenshot({ path: `${folder}/unconfigured-target.png`, fullPage: true })
  checks.push({ name: 'real unconfigured indicator has no fabricated zero target line', passed: true, emptyTarget, empty })
  assert.deepEqual(errors, [])
  console.log('PASS real persisted mortality target; PASS real unconfigured target; PASS no runtime errors')
} finally {
  await writeFile(`${folder}/results.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
