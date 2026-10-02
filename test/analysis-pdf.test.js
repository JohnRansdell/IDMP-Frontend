import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysisPdfReport, analysisPdfFilename } from '../src/idmp/features/analysis/pdfReport.js'
import { requestPdf, setSessionRecoveryHandler } from '../src/idmp/api/request.js'

test('PDF report freezes loaded values and preserves separate periods and metadata', () => {
  const metrics = [{ label: '分子', value: '15' }, { label: '分母', value: '2,207' }]
  const report = buildAnalysisPdfReport({ versionId: '102027642461312819',
    metadata: [['报告期', '2025-12-04 至 2026-02-12'], ['趋势时间', '2025-08 至 2026-04'], ['运行参数', '{"patientName":"张"}']],
    primaryMetric: { label: '转科比例', value: '0.68%', statusLabel: '即时计算' }, summaryMetrics: metrics,
    trendRows: [{ label: '2026-01', actual: 0.68 }], unit: '%', rankRows: [{ rank: 1, department: '血管外科', rate: '0.68%', numerator: 15, denominator: 2207, status: '达标' }] })
  metrics[0].value = '999'
  assert.equal(report.indicatorVersionId, '102027642461312819')
  assert.equal(report.sections[0].rows[1][1], '15')
  assert.equal(report.sections[1].rows[0][1], '0.68%')
  assert.equal(report.sections[2].rows[0][1], '血管外科')
  assert.equal(report.metadata[2].value, '{"patientName":"张"}')
})

test('PDF export refuses excessive rows instead of silently truncating', () => {
  assert.throws(() => buildAnalysisPdfReport({ versionId: '2', primaryMetric: {}, trendRows: Array(3001).fill({ label: '月', actual: 1 }) }), /3000/)
})

test('PDF splits wide drill tables without losing columns or row identity', () => {
  const columns = Array.from({ length: 13 }, (_, i) => `字段${i}`)
  const row = columns.map((_, i) => `值${i}`)
  const report = buildAnalysisPdfReport({ versionId: '2', drillSection: { title: '当前下钻结果', columns, rows: [row] } })
  const drill = report.sections.slice(5)
  assert.equal(drill.length, 2)
  assert.ok(drill.every(section => section.columns.length <= 8 && section.rows[0][0] === '值0'))
  assert.deepEqual([...drill[0].rows[0], ...drill[1].rows[0].slice(1)], row)
})

test('PDF retains peer trends and missing metric values', () => {
  const report = buildAnalysisPdfReport({ versionId: '2', hasPeerTrend: true, unit: '%', trendRows: [{ label: '一月', actual: 0, peer: '-' }] })
  assert.deepEqual(report.sections[1].columns, ['周期', '本院实际值', '同级医院均值'])
  assert.deepEqual(report.sections[1].rows[0], ['一月', '0%', '-'])
})

test('PDF filenames remove reserved characters without losing Chinese', () => {
  assert.equal(analysisPdfFilename('住院/死亡率:*?', '123'), '住院_死亡率___-分析报告-123.pdf')
})

test('PDF download sends authenticated JSON and validates the binary response', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => 'pdf-test-token', removeItem: () => {} }
  try {
    const calls = []
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('%PDF-1.5\nfixture', { headers: { 'Content-Type': 'application/pdf' } }) }
    const blob = await requestPdf('/analysis/indicators/1/export/pdf', { indicatorVersionId: '9007199254740993' })
    assert.equal(await blob.text(), '%PDF-1.5\nfixture')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer pdf-test-token')
    assert.equal(calls[0].options.credentials, 'include')
    assert.equal(JSON.parse(calls[0].options.body).indicatorVersionId, '9007199254740993')
    globalThis.fetch = async () => new Response('broken', { headers: { 'Content-Type': 'application/pdf' } })
    await assert.rejects(requestPdf('/export', {}), /有效的 PDF/)
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'ERROR', message: '导出内容过大，请缩小分析范围后重试' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    await assert.rejects(requestPdf('/export', {}), /导出内容过大/)
    globalThis.fetch = async () => new Response('<html>413 Request Entity Too Large</html>', { status: 413 })
    await assert.rejects(requestPdf('/export', {}), /导出内容过大/)
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage }
})

test('PDF download retries once after session recovery and keeps friendly timeout errors', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => 'pdf-test-token', removeItem: () => {} }
  let calls = 0, recoveries = 0
  setSessionRecoveryHandler(async () => { recoveries++; return true })
  try {
    globalThis.fetch = async () => ++calls === 1
      ? new Response(JSON.stringify({ code: 'ERROR' }), { status: 401 })
      : new Response('%PDF-1.5\nfixture', { headers: { 'Content-Type': 'application/pdf' } })
    await requestPdf('/export', {})
    assert.equal(calls, 2)
    assert.equal(recoveries, 1)
    globalThis.fetch = async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    await assert.rejects(requestPdf('/export', {}, { timeoutMs: 10 }), /导出超时/)
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; setSessionRecoveryHandler(null) }
})
