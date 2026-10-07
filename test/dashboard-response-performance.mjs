import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { parseJson } from './system-test-client.mjs'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'

const base = process.env.IDMP_PERF_API || 'http://8.137.157.152/api/v1'
const folder = process.env.IDMP_PERF_EVIDENCE || '.tmp/dashboard-response-optimization-before'
const query = { periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY', ...JSON.parse(process.env.IDMP_PERF_QUERY || '{}') }
await mkdir(folder, { recursive: true })
async function measure(encoding, format = 'FULL') {
  const payload = JSON.stringify({ ...query, responseFormat: format })
  const started = performance.now()
  const result = await new Promise((resolve, reject) => {
    const req = request(`${base}/analysis/dashboards/1189225114584501123/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Encoding': encoding, 'Content-Length': Buffer.byteLength(payload) },
    }, response => {
      const headersMs = Math.round(performance.now() - started)
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, headersMs, bytes: Buffer.concat(chunks) }))
    })
    req.setTimeout(45000, () => req.destroy(new Error('Request timed out')))
    req.on('error', reject)
    req.end(payload)
  })
  const downloadMs = Math.round(performance.now() - started)
  const contentEncoding = result.headers['content-encoding'] || 'identity'
  const decoded = contentEncoding === 'gzip' ? gunzipSync(result.bytes)
    : contentEncoding === 'br' ? brotliDecompressSync(result.bytes)
      : contentEncoding === 'deflate' ? inflateSync(result.bytes) : result.bytes
  const body = parseJson(decoded.toString('utf8'))
  if (result.status !== 200 || body.code !== 'OK') throw new Error(`${result.status}: ${body.message}`)
  if (format === 'COMPACT') assert.equal(body.data.responseFormat, 'COMPACT')
  const expanded = expandDashboardResponse(body.data)
  const readyMs = Math.round(performance.now()-started)
  const widgets = Object.fromEntries(Object.entries(expanded.widgets).map(([code, widget]) => [code, {
    status: widget.status, rows: widget.rows?.length || 0, bytes: Buffer.byteLength(JSON.stringify(widget)),
    contextBytes: (widget.rows || []).reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.drillContext || null)), 0),
    digest: createHash('sha256').update(JSON.stringify(widget)).digest('hex'),
  }]))
  return { format, requestedEncoding: encoding, encoding: contentEncoding, wireBytes: result.bytes.length, decodedBytes: decoded.length,
    headersMs: result.headersMs, downloadMs, readyMs, totalMs: Math.round(performance.now()-started), traceId: body.traceId, widgets, expanded }
}
const results = []
const formats = process.env.IDMP_PERF_COMPACT === '1' ? ['FULL', 'COMPACT'] : ['FULL']
let expected
for (const format of formats) for (const encoding of ['identity', 'gzip']) {
  const result = await measure(encoding, format)
  expected ||= result.expanded.widgets
  assert.deepEqual(result.expanded.widgets, expected, '精简响应必须逐行保留数值、字段和下钻上下文')
  results.push(result)
}
if (process.env.IDMP_PERF_CONCURRENT === '1') {
  const concurrentFormats = process.env.IDMP_PERF_COMPARE_CONCURRENT === '1' ? ['FULL', 'COMPACT'] : ['COMPACT']
  for (let round = 0; round < 3; round++) for (const format of (round % 2 ? [...concurrentFormats].reverse() : concurrentFormats)) {
    const group = await Promise.all(Array.from({ length: 4 }, () => measure('gzip', format)))
    for (const result of group) {
      assert.deepEqual(result.expanded.widgets, expected)
      results.push({ ...result, concurrency: 4 })
    }
  }
}
const summary = results.map(({ expanded, ...item }) => item)
await writeFile(`${folder}/summary.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
