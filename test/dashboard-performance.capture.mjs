import { mkdir, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers } from '../src/idmp/api/request.js'

const base = process.argv[2] || 'http://8.137.157.152/api/v1'
const id = process.argv[3] || '1189225114584501123'
const directory = '.tmp/dashboard-live'
await mkdir(directory, { recursive: true })
for (const [name, path, body] of [
  ['definition', `/analysis/dashboards/${id}`],
  ['full', `/analysis/dashboards/${id}/query`, { periodStart: '2026-03-01', periodEnd: '2026-04-01', granularity: 'MONTHLY', responseFormat: 'FULL' }]
]) {
  const response = await fetch(`${base}${path}`, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) })
  const text = await response.text()
  if (!response.ok) throw new Error(`只读查询失败: HTTP ${response.status}`)
  const payload = parseJsonPreservingLargeIntegers(text)
  if (!payload?.data) throw new Error('只读查询未返回业务数据')
  await writeFile(`${directory}/${name}.json`, text)
  console.log(JSON.stringify({ name, bytes: Buffer.byteLength(text), widgets: Object.keys(payload.data.widgets || {}).length,
    rows: Object.values(payload.data.widgets || {}).map(widget => widget.rows?.length || 0) }))
}
