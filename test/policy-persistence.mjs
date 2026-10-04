import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { api, base } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const live = JSON.parse(await readFile('.tmp/policy-live/result.json', 'utf8'))
const checks = []
for (const file of [live.file, live.pdfFile, live.docxFile]) {
  const checked = await api('POST', '/meta/file-objects/check', { sha256: file.sha256, fileSizeBytes: file.fileSizeBytes, originalName: file.originalName })
  assert.equal(checked.instantUpload, true)
  assert.equal(checked.file.id, file.id)
  const response = await fetch(`${base}/meta/file-objects/${file.id}/content`)
  assert.equal(response.status, 200)
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), file.sha256)
  checks.push(`${file.originalName} 重启后仍可秒传、下载且校验一致`)
}
const migration = await db('PLATFORM', "SELECT JSON_OBJECT('version',version,'success',success) FROM flyway_schema_history WHERE version='30'")
assert.equal(migration[0].success, 1)
checks.push('MySQL V30 迁移已成功应用')
const result = { passed: true, checks, migration }
await writeFile('.tmp/policy-live/persistence.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
