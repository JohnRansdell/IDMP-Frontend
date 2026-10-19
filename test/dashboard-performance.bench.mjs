import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { reactive } from 'vue'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { dashboardDetailToSchema, widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { normalizeDepartmentDataset } from '../src/idmp/features/dashboard/dimensionNames.js'

// 输入来自 Java 编码器的契约测试，逐行对比后才输出性能数据。
const fixturePath = process.argv[2] || '.tmp/dashboard-payload.json'
const fixture = parseJsonPreservingLargeIntegers(await readFile(fixturePath, 'utf8'))
const expanded = expandDashboardResponse(fixture.columnar)
assert.deepEqual(expanded, fixture.full)
const iterations = 7
function measure(run) {
  run()
  const times = Array.from({ length: iterations }, () => {
    const start = performance.now(); run(); return performance.now() - start
  }).sort((a, b) => a - b)
  return Number(times[Math.floor(times.length / 2)].toFixed(2))
}
const wire = Object.fromEntries(['full', 'compact', 'columnar'].filter(key => fixture[key]).map(key => {
  const json = JSON.stringify(fixture[key])
  return [key, { bytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).length,
    parseAndExpandMs: measure(() => expandDashboardResponse(parseJsonPreservingLargeIntegers(json))) }]
}))
const previousNames = execFileSync('git', ['show', 'origin/main:src/idmp/features/dashboard/dimensionNames.js'], { encoding: 'utf8' })
const namesUrl = `data:text/javascript;base64,${Buffer.from(previousNames).toString('base64')}`
const previousEngine = execFileSync('git', ['show', 'origin/main:src/idmp/features/dashboard/bindingEngine.js'], { encoding: 'utf8' })
  .replaceAll("'./dimensionNames.js'", JSON.stringify(namesUrl))
  .replace(/from '(\.[^']+)'/g, (_, relative) => `from ${JSON.stringify(pathToFileURL(new URL(`../src/idmp/features/dashboard/${relative}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1')).href)}`)
const baseline = await import(`data:text/javascript;base64,${Buffer.from(previousEngine).toString('base64')}`)
const catalog = ['department', 'disease', 'doctor'].map(code => ({ code, name: code, role: 'DIMENSION', dataType: 'STRING', groupable: true }))
catalog.push({ code: 'value', name: '指标值', role: 'MEASURE', dataType: 'DECIMAL', aggregations: ['SUM'] })
let binding = { dimensions: [{ field: 'department' }], series: [], measures: [{ field: 'value', aggregation: 'sum' }], sort: [] }
const [code, result] = Object.entries(expanded.widgets).sort((a, b) => b[1].rows.length - a[1].rows.length)[0]
if (process.argv[3]) {
  const detail = parseJsonPreservingLargeIntegers(await readFile(process.argv[3], 'utf8'))
  const schema = dashboardDetailToSchema(detail.data || detail)
  binding = schema.widgets.find(widget => widget.id === code)?.config.dataBinding || binding
  for (const widget of schema.widgets) {
    if (!widget.config?.dataBinding || !expanded.widgets[widget.id]) continue
    const result = expanded.widgets[widget.id]
    const dataset = normalizeDepartmentDataset(widgetResultToDataset(result, result.fields))
    const kind = widget.type === 'chart' ? widget.chartKind || 'line' : widget.type
    assert.deepEqual(compileWidgetData(kind, widget.config.dataBinding, dataset),
      baseline.compileWidgetData(kind, widget.config.dataBinding, dataset), `组件 ${widget.id} 展示结果发生变化`)
  }
}
if (process.argv[4]) {
  const original = parseJsonPreservingLargeIntegers(await readFile(process.argv[4], 'utf8'))
  assert.deepEqual(expanded.widgets, (original.data || original).widgets)
  assert.equal(Date.parse(expanded.generatedAt), Date.parse((original.data || original).generatedAt))
}
const optimized = normalizeDepartmentDataset(widgetResultToDataset(result, result.fields.length ? result.fields : catalog))
const raw = { ...optimized, rows: optimized.rows.map(row => ({ ...row })) }
const proxied = reactive(raw)
const oldModel = baseline.compileWidgetData('bar', binding, raw)
assert.equal(oldModel.status, 'ready')
assert.deepEqual(compileWidgetData('bar', binding, optimized), oldModel)
const report = {
  source: process.argv[3] ? 'Captured production response, local encoder and code benchmark; not live whole-page latency' : 'Java contract fixture, not live source data or whole-page latency',
  rows: raw.rows.length, wire,
  groupMs: {
    oldPlain: measure(() => baseline.compileWidgetData('bar', binding, raw)),
    oldReactive: measure(() => baseline.compileWidgetData('bar', binding, proxied)),
    optimizedCold: measure(() => compileWidgetData('bar', binding, { ...optimized, rows: Object.freeze([...optimized.rows]) })),
    optimizedShared: measure(() => compileWidgetData('table', binding, optimized))
  }
}
console.log(JSON.stringify(report, null, 2))
