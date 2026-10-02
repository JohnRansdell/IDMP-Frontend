import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { base } from './system-test-client.mjs'

const evidence = resolve('.tmp/analysis-pdf-live')
await mkdir(evidence, { recursive: true })
const { report } = JSON.parse(await readFile(join(evidence, 'formal-desktop.json'), 'utf8'))
const indicatorId = process.env.PDF_INDICATOR_ID || '102027642461313070'
const checks = []
async function post(label, body, { id = indicatorId, valid = false, raw = false } = {}) {
  const started = performance.now()
  const response = await fetch(`${base}/analysis/indicators/${id}/export/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  const elapsed = Math.round(performance.now() - started)
  if (valid) {
    assert.equal(response.status, 200, bytes.toString())
    assert.match(response.headers.get('content-type'), /^application\/pdf/)
    assert.match(response.headers.get('content-disposition'), /attachment/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
    assert.ok(elapsed < 5000, `${label}: ${elapsed} ms`)
    await writeFile(join(evidence, `${label}.pdf`), bytes)
  } else {
    assert.ok(response.status >= 400 && response.status < 500, `${label}: ${response.status} ${bytes.toString()}`)
    if (response.status !== 413) {
      const payload = JSON.parse(bytes.toString())
      assert.match(payload.message, /[\u4e00-\u9fff]/)
      assert.doesNotMatch(payload.message, /Exception|java\.|stacktrace|unexpected token/i)
    }
  }
  checks.push({ label, status: response.status, ms: elapsed, bytes: bytes.length })
}
const section = { title: '分页验收', columns: ['科室', '结果'], rows: Array.from({ length: 180 }, (_, i) => [`测试科室${i}`, `测试结果${i}`]) }
await post('pagination', { ...report, sections: [section] }, { valid: true })
await post('empty-report', { ...report, sections: [{ ...section, rows: [] }] }, { valid: true })
await post('malformed-json', '{', { raw: true })
await post('missing-version', { ...report, indicatorVersionId: null })
await post('wrong-version', { ...report, indicatorVersionId: '1' })
await post('missing-indicator', report, { id: '1' })
await post('too-many-rows', { ...report, sections: [{ ...section, rows: Array(3001).fill(['科室', '结果']) }] })
await post('invalid-image', { ...report, sections: [{ ...section, chartPng: 'data:image/png;base64,invalid!' }] })
await post('oversized-body', JSON.stringify({ ...report, padding: 'a'.repeat(4_000_001) }), { raw: true })
await Promise.all(Array.from({ length: 5 }, (_, i) => post(`concurrent-${i + 1}`, report, { valid: true })))
await writeFile(join(evidence, 'api-checks.json'), JSON.stringify({ passed: true, checks }, null, 2))
console.log(JSON.stringify({ passed: true, checks }))
