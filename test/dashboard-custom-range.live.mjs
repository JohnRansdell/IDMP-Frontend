import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'

const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const base = `${origin}/api/v1`
const dashboardId = '1189225114584501123'
const evidence = '.tmp/dashboard-custom-range'
const exec = promisify(execFile)
const checks = [], requests = [], errors = []
await mkdir(evidence, { recursive: true })
const save = (name, value) => writeFile(`${evidence}/${name}.json`, JSON.stringify(value, null, 2))
function check(name, detail) { checks.push({ name, detail }); console.log(`PASS ${name}`) }
const near = (actual, expected, label, tolerance = 1e-8) => {
  assert.ok(actual !== null && Number.isFinite(Number(actual)), `${label}: missing actual value`)
  assert.ok(Math.abs(Number(actual) - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}`)
}
async function api(path, body) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000) })
  const payload = parse(await response.text())
  assert.ok(response.ok && payload.code === 'OK', `${path}: ${response.status} ${payload.message}`)
  return payload.data
}
async function sql(query, columns) {
  assert.match(query, /^SELECT\b/)
  const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`
  const { stdout } = await exec('ssh', ['lab-server', `python3 /home/tjg/idmp-deploy/inspect-departments.py SOURCE ${quote(query)}`],
    { timeout: 120000, maxBuffer: 15 * 1024 * 1024 })
  return stdout.trimEnd().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value === 'NULL' ? null : value])))
}
const codes = {
  mortality: 'dashboard-widget-1790681712300-4', table: 'dashboard-widget-1790681721550-6',
  mortalityKpi: 'dashboard-widget-1790681694636-1', tcm: 'dashboard-widget-1791875881995-2',
  transfer: 'dashboard-widget-1791798674947-4', tcmKpi: 'dashboard-widget-1791798624163-1'
}
const range = { periodStart: '2026-02-01', periodEnd: '2026-05-01', granularity: 'CUSTOM' }
const definition = await api(`/analysis/dashboards/${dashboardId}`)
const query = async (period, widgetCodes, responseFormat = 'FULL') => expandDashboardResponse(await api(`/analysis/dashboards/${dashboardId}/query`, { ...period, widgetCodes, responseFormat }))
const result = await query(range, Object.values(codes))
await save('interval-results', result)
for (const [code, widget] of Object.entries(result.widgets)) {
  assert.equal(widget.status, 'READY', `${code}: ${widget.message}`)
  assert.ok(widget.rows.length > 0)
  for (const row of widget.rows) {
    assert.equal(row.periodStart.slice(0, 10), range.periodStart)
    assert.equal(row.periodEnd.slice(0, 10), range.periodEnd)
    assert.equal(row.aggregationMethod, 'CUSTOM_RANGE_FACTOR_ROLLUP')
    assert.equal(row.resultId, null)
    assert.equal(row.snapshotId, null)
  }
  check(`interval-${code}`, { rows: widget.rows.length })
}

const source = await sql("SELECT out_dept_code,COUNT(*),SUM(out_status='4'),SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost) FROM vmq_basicinformationba WHERE out_date >= '2026-02-01' AND out_date < '2026-05-01' GROUP BY out_dept_code", ['code','discharged','deaths','chineseCost','drugCost'])
await save('source-oracle', source)
const sourceByCode = new Map(source.map(row => [row.code, row]))
for (const [key, numerator, denominator] of [['mortality','deaths','discharged'], ['table','deaths','discharged'], ['tcm','chineseCost','drugCost']]) {
  const rows = result.widgets[codes[key]].rows
  const seen = new Set()
  for (const row of rows) {
    const code = String(row.out_dept_code ?? row.OUT_DEPT_CODE ?? row['科室'])
    assert.ok(!seen.has(code), `${key}: duplicated department ${code}`)
    seen.add(code)
    const expected = sourceByCode.get(code)
    assert.ok(expected, `${key}: missing independent source row for ${code}`)
    near(row.numeratorValue, Number(expected[numerator]), `${key}/${code}/numerator`, 0.0001)
    near(row.denominatorValue, Number(expected[denominator]), `${key}/${code}/denominator`, 0.0001)
    if (Number(expected[denominator])) near(row.value, Number(expected[numerator]) / Number(expected[denominator]), `${key}/${code}/value`)
  }
  assert.equal(rows.length, source.length, `${key}: missing departments`)
  check(`source-reconciliation-${key}`, { departments: rows.length })
}
for (const [key, numerator, denominator] of [['mortalityKpi','deaths','discharged'], ['tcmKpi','chineseCost','drugCost']]) {
  const n = source.reduce((sum, row) => sum + Number(row[numerator]), 0)
  const d = source.reduce((sum, row) => sum + Number(row[denominator]), 0)
  const row = result.widgets[codes[key]].rows[0]
  near(row.numeratorValue, n, `${key}/numerator`, 0.0001)
  near(row.denominatorValue, d, `${key}/denominator`, 0.0001)
  near(row.value, n / d, `${key}/value`)
  check(`source-reconciliation-${key}`, { numerator: n, denominator: d, value: row.value })
}

// DISTINCT counts use the requested additive convention, not a cross-month re-deduplication.
const transferExpected = new Map()
for (const [start, end] of [['2026-02-01','2026-03-01'], ['2026-03-01','2026-04-01'], ['2026-04-01','2026-05-01']]) {
  const where = `b.in_date >= '${start}' AND b.in_date < '${end}'`
  const admissions = await sql(`SELECT b.out_dept_code,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b WHERE ${where} GROUP BY b.out_dept_code`, ['code','denominator'])
  const transfers = await sql(`SELECT b.out_dept_code,COUNT(DISTINCT b.In_Hospital_ID) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.In_Hospital_ID=t.In_Hospital_ID WHERE ${where} AND t.In_Dept_Date >= b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48 GROUP BY b.out_dept_code`, ['code','numerator'])
  for (const row of admissions) {
    const expected = transferExpected.get(row.code) || { numerator: 0, denominator: 0 }
    expected.denominator += Number(row.denominator)
    expected.numerator += Number(transfers.find(item => item.code === row.code)?.numerator || 0)
    transferExpected.set(row.code, expected)
  }
}
for (const row of result.widgets[codes.transfer].rows) {
  const code = String(row.out_dept_code)
  const expected = transferExpected.get(code)
  assert.ok(expected, `transfer: missing source ${code}`)
  near(row.numeratorValue, expected.numerator, `transfer/${code}/numerator`)
  near(row.denominatorValue, expected.denominator, `transfer/${code}/denominator`)
  near(row.value, expected.numerator / expected.denominator, `transfer/${code}/value`)
}
assert.equal(result.widgets[codes.transfer].rows.length, transferExpected.size)
check('source-reconciliation-transfer-distinct', { departments: transferExpected.size })

const bar = definition.version.widgets.find(widget => widget.code === codes.mortality)
const filtered = await api('/analysis/dashboard-query/preview', { ...range, widget: { ...bar,
  fieldBindings: { ...bar.fieldBindings, filters: [{ field: 'OUT_DEPT_CODE', operator: 'equals', value: '4' }] } } })
assert.equal(filtered.status, 'READY', filtered.message)
assert.equal(filtered.rows.length, 1)
assert.deepEqual(filtered.rows[0], result.widgets[codes.mortality].rows.find(row => row.out_dept_code === '4'))
check('dimension-filter-before-interval-rollup', { department: '4' })

const compact = await query(range, [codes.mortality], 'COLUMNAR')
assert.deepEqual(compact.widgets[codes.mortality].rows, result.widgets[codes.mortality].rows)
check('columnar-contract', { rows: compact.widgets[codes.mortality].rows.length })
const single = await query({ periodStart:'2026-02-01',periodEnd:'2026-03-01',granularity:'MONTHLY' }, [codes.mortality])
assert.equal(single.widgets[codes.mortality].status, 'READY')
assert.ok(single.widgets[codes.mortality].rows.every(row => row.resultId && row.periodEnd.startsWith('2026-03-01')))
check('single-month-preserves-result-context', { rows: single.widgets[codes.mortality].rows.length })

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true })
const page = await browser.newPage({ viewport:{ width:1600, height:1000 }, reducedMotion:'reduce' })
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (/\/analysis\/dashboards\/[^/]+\/query/.test(request.url())) requests.push(request.postDataJSON()) })
async function ready() {
  await page.getByTestId('dashboard-period-type').waitFor({ timeout:90000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="binding-widget"]').length === 11 && !document.querySelector('[data-testid="dashboard-period-apply"].is-loading'), null, { timeout:90000 })
  await page.waitForLoadState('networkidle')
}
async function fillMonth(id, value) {
  const input = page.getByTestId(id).locator('input')
  await input.fill(`${value.slice(0, 4)} 年 ${value.slice(5)} 月`)
  await input.press('Enter')
  await input.press('Tab')
}
try {
  await page.goto(`${origin}/dashboard?id=${dashboardId}`)
  await ready()
  requests.length = 0
  await page.getByTestId('dashboard-period-type').click()
  await page.getByRole('option', { name:'自定义区间', exact:true }).click()
  await fillMonth('dashboard-period-start', '2026-02')
  await fillMonth('dashboard-period-end', '2026-04')
  await page.getByTestId('dashboard-period-apply').click()
  await ready()
  assert.match(await page.getByTestId('dashboard-period-current').innerText(), /2026-02 ~ 2026-04/)
  assert.ok(requests.some(request => request.granularity === 'CUSTOM' && request.periodStart === range.periodStart && request.periodEnd === range.periodEnd))
  const snapshot = await page.evaluate(async () => {
    let component = document.querySelector('.dashboard-period-picker').__vueParentComponent
    while (component && !component.setupState.remoteWidgetDatasets) component = component.parent
    const state = component.setupState
    const moduleUrl = performance.getEntriesByType('resource').find(entry => /\/echarts\.js\?v=/.test(entry.name))?.name
    const echarts = await import(moduleUrl)
    return [...document.querySelectorAll('[data-widget-id]')].map(widget => ({ code:widget.dataset.widgetId,
      text:widget.innerText, dataset:state.remoteWidgetDatasets[widget.dataset.widgetId],
      charts:[...widget.querySelectorAll('.idmp-chart')].map(element => {
        const chart = echarts.getInstanceByDom(element)
        return { series:chart?.getOption().series?.map(series => ({ type:series.type, data:series.data })), width:element.clientWidth, height:element.clientHeight }
      }) }))
  })
  await save('browser-results', snapshot)
  for (const key of ['mortality','table','tcm','transfer']) {
    const widget = snapshot.find(widget => widget.code === codes[key])
    assert.equal(widget.dataset.status, 'READY', `${key}: ${widget.text}`)
    assert.ok(widget.dataset.rows.every(row => row.periodStart.startsWith(range.periodStart) && row.periodEnd.startsWith(range.periodEnd)))
    assert.ok(!/该区间暂不支持|字段配置不完整|图表加载失败/.test(widget.text), widget.text)
    if (key !== 'table') {
      const points = widget.charts[0].series[0].data
      assert.ok(points.length > 0)
      for (const point of points) {
        const code = String(point.dimensionValues?.out_dept_code ?? point.dimensionValues?.['科室'])
        const expected = result.widgets[codes[key]].rows.find(row => String(row.out_dept_code ?? row['科室']) === code)
        assert.ok(expected, `${key}: no returned row for chart point ${code}`)
        near(point.value, Number(expected.value), `${key}/rendered/${code}`)
      }
      assert.ok(widget.charts[0].width > 100 && widget.charts[0].height > 100)
    }
    check(`browser-interval-${key}`, { rows:widget.dataset.rows.length })
  }
  assert.deepEqual(errors, [])
  await page.screenshot({ path:`${evidence}/desktop.png`, fullPage:true })
  await page.setViewportSize({ width:390, height:844 })
  await page.waitForFunction(() => [...document.querySelectorAll('.idmp-chart canvas')].every(canvas =>
    Math.abs(canvas.width / devicePixelRatio - canvas.closest('.idmp-chart').clientWidth) < 2))
  const mobilePixels = await page.locator(`[data-widget-id="${codes.mortality}"] .idmp-chart`).evaluate(element => {
    const canvas = element.querySelector('canvas')
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let colored = 0
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100 && pixels[i + 1] > pixels[i] * 1.2 && pixels[i + 1] > pixels[i + 2] * 1.1) colored++
    return colored
  })
  assert.ok(mobilePixels > 20, `mobile chart is blank: ${mobilePixels} colored pixels`)
  assert.ok(await page.getByTestId('dashboard-period-type').isVisible())
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false)
  await page.screenshot({ path:`${evidence}/mobile.png`, fullPage:true })
  check('browser-mobile-layout', { width:390, coloredChartPixels:mobilePixels })
} catch (error) {
  await page.screenshot({ path:`${evidence}/failure.png`, fullPage:true })
  await save('failure', { error:error.stack, requests, errors, text:await page.locator('body').innerText() })
  throw error
} finally { await browser.close() }
await save('checks', { checks, requests, errors })
console.log(JSON.stringify({ passed:checks.length, errors }))
