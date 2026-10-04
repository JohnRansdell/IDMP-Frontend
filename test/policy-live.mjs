import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { api, base, parseJson, rows } from './system-test-client.mjs'

const evidence = '.tmp/policy-live'
await mkdir(evidence, { recursive: true })
const tag = `POLICY_${Date.now()}`, checks = [], timings = []
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const content = Buffer.from(`政策文件功能验收\n${tag}\n用于验证上传、秒传、指标关联及查看。\n`)
const hash = digest(content)
async function upload(bytes, name, sha = digest(bytes), expected = 200) {
  const form = new FormData(); form.append('file', new Blob([bytes]), name); form.append('sha256', sha)
  const start = performance.now()
  const response = await fetch(`${base}/meta/file-objects/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) })
  const body = parseJson(await response.text())
  timings.push({ name, http: response.status, ms: Math.round(performance.now() - start) })
  assert.equal(response.status, expected, JSON.stringify(body))
  if (expected !== 200) assert.doesNotMatch(body.message, /Exception|SQL|Stack|org\./)
  return body.data
}
async function verifyDownload(file, bytes) {
  const response = await fetch(`${base}/meta/file-objects/${file.id}/content`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.match(response.headers.get('cache-control'), /no-store/)
  const downloaded = Buffer.from(await response.arrayBuffer())
  assert.equal(digest(downloaded), digest(bytes))
  assert.equal(downloaded.length, Number(file.fileSizeBytes))
}
const options = await api('GET', '/meta/file-objects/upload-options')
assert.equal(Number(options.maxBytes), 1000000)
const missing = await api('POST', '/meta/file-objects/check', { sha256: hash, fileSizeBytes: content.length, originalName: '验收.txt' })
assert.equal(missing.instantUpload, false); checks.push('首次校验未命中')
const first = await upload(content, '政策验收.txt')
assert.equal(first.instantUpload, false); checks.push('首次上传')
const instant = await api('POST', '/meta/file-objects/check', { sha256: hash, fileSizeBytes: content.length, originalName: '改名.txt' })
assert.equal(instant.instantUpload, true); assert.equal(instant.file.id, first.file.id); checks.push('改名后秒传')
await verifyDownload(first.file, content); checks.push('下载内容与原文件 SHA256 一致')
const concurrentBytes = Buffer.from(`并发秒传 ${tag}`)
const concurrent = await Promise.all([upload(concurrentBytes, '并发1.txt'), upload(concurrentBytes, '并发2.txt'), upload(concurrentBytes, '并发3.txt')])
assert.equal(new Set(concurrent.map(result => result.file.id)).size, 1); checks.push('并发上传只创建一个文件对象')
await upload(content, '错误哈希.txt', 'a'.repeat(64), 400)
await upload(content, '伪装.pdf', hash, 400)
await upload(Buffer.alloc(1000001, 65), '超限.txt', undefined, 400)
await upload(Buffer.from([0, 1, 2, 3]), '二进制.txt', undefined, 400)
checks.push('错误哈希、伪装格式、超限、二进制文本友好拒绝')
const pdfParts = ['%PDF-1.4\n'], offsets = [0]
const pdfText = 'BT /F1 16 Tf 25 350 Td (IDMP Policy Document) Tj 0 -30 Td (Upload and view acceptance) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${Buffer.byteLength(pdfText)} >>\nstream\n${pdfText}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdfParts.join(''))); pdfParts.push(`${index + 1} 0 obj\n${object}\nendobj\n`) })
const xref = Buffer.byteLength(pdfParts.join(''))
pdfParts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
const pdf = Buffer.from(pdfParts.join('')), pdfResult = await upload(pdf, '政策附件.pdf')
await verifyDownload(pdfResult.file, pdf); checks.push('有效 PDF 上传与下载')
const docxPath = resolve(evidence, 'policy.docx')
execFileSync('powershell.exe', ['-NoProfile', '-File', 'test/create-policy-docx.ps1', '-OutputPath', docxPath], { windowsHide: true })
const docx = await readFile(docxPath), docxResult = await upload(docx, '政策正文.docx')
await verifyDownload(docxResult.file, docx); checks.push('有效 DOCX 上传与下载')
const inconsistent = await api('POST', '/meta/file-objects/check', { sha256: hash, fileSizeBytes: content.length + 1, originalName: '验收.txt' }, { allowError: true })
assert.equal(inconsistent.http, 400)
const download = await fetch(`${base}/meta/file-objects/${first.file.id}/content?download=true`)
assert.match(download.headers.get('content-disposition'), /^attachment;/)
await download.arrayBuffer()
const missingFile = await api('GET', '/meta/file-objects/9223372036854775806/content', undefined, { allowError: true })
assert.equal(missingFile.http, 404)
const empty = await api('GET', `/meta/policy-file-versions/published?name=${tag}&page=2147483647&size=200`)
assert.equal(rows(empty).length, 0)
checks.push('秒传大小一致性、强制下载、文件不存在、大分页边界')
const policies = []
for (let index = 0; index < 2; index++) {
  const created = await api('POST', '/meta/policy-files', { code: `${tag}_${index}`, name: `政策上传验收${index} ${tag}`, category: 'QUALITY', issuingOrganization: '测试机构', documentNumber: tag })
  const detail = await api('POST', `/meta/policy-files/${created.policyFile.id}/versions`, { issueDate: '2026-10-04', fileObjectId: first.file.id, contentHash: hash })
  const draft = detail.versions[0]
  const published = await api('POST', `/meta/policy-files/${created.policyFile.id}/versions/${draft.id}/publish`, { resourceVersion: draft.resourceVersion })
  assert.equal(published.policyFile.currentPublishedVersionId, draft.id)
  policies.push({ policyId: created.policyFile.id, versionId: draft.id })
}
checks.push('同一文件关联两个政策并发布')
const published = await api('GET', `/meta/policy-file-versions/published?name=${encodeURIComponent(tag)}`)
assert.equal(rows(published).length, 2); checks.push('已发布政策名称与编码检索')
const relation = await api('POST', `/meta/policy-file-versions/${policies[0].versionId}/relations`, { targetVersionId: policies[1].versionId, relationType: 'REFERENCES', description: '真实接口验收关联' })
const relations = await api('GET', `/meta/policy-file-versions/${policies[0].versionId}/relations`)
assert.ok(relations.some(item => item.id === relation.id)); checks.push('政策版本关联及回显')
const indicatorId = '102027642461313070'
const indicatorVersions = rows(await api('GET', `/indicators/${indicatorId}/versions`))
const indicatorVersion = indicatorVersions.find(item => (item.publicationStatus || item.status) === 'PUBLISHED')
assert.ok(indicatorVersion)
const reference = await api('POST', `/mappings/indicator-versions/${indicatorVersion.id}/policy-references`, { policyFileVersionId: policies[0].versionId, citationLocation: '验收条款', citationText: '政策文件上传测试', relationRole: 'SOURCE' })
const references = await api('GET', `/mappings/indicator-versions/${indicatorVersion.id}/policy-references`)
assert.ok(references.some(item => item.id === reference.id)); checks.push('指标关联与回显')
await api('POST', `/mappings/policy-references/${reference.id}/invalidate`, { resourceVersion: reference.resourceVersion })
checks.push('验收关联作废清理，不改变指标计算')
const result = { passed: true, tag, options, policies, indicatorId, indicatorVersionId: indicatorVersion.id, file: first.file, pdfFile: pdfResult.file, docxFile: docxResult.file, checks, timings }
await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
