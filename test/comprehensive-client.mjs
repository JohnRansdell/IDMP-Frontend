import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

export const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
export const base = process.env.IDMP_SYSTEM_API || 'http://8.137.157.152/api/v1'
export const folder = process.env.IDMP_AUDIT_FOLDER || '.tmp/系统全量验收20261025'
await mkdir(folder, { recursive: true })
export const state = await readFile(`${folder}/resources.json`, 'utf8').then(parse).catch(() => ({ tag: `ALL_${Date.now()}`, resources: [] }))
export const fixtureName = name => `${name}（${state.tag.replace(/\D/g, '')}）`
const credentialsPath = process.env.IDMP_ADMIN_CREDENTIAL_FILE || '.tmp/forced-login-admin-20261024.json'
const credentials = parse(await readFile(credentialsPath, 'utf8'))
export const checks = [], calls = []
export const rows = data => Array.isArray(data) ? data : data?.records || data?.items || data?.rows || []
export const save = (name, value) => writeFile(`${folder}/${name}.json`, JSON.stringify(value, null, 2))
export const checkpoint = () => save('resources', state)
export const close = (a, b, tolerance = 1e-7) => a == null || b == null ? a == b : Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) <= tolerance
export function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail })
  console.log(`${passed ? '通过' : '失败'} ${name}${passed ? '' : ` ${String(JSON.stringify(detail)).slice(0, 1800)}`}`)
  return Boolean(passed)
}
export async function run(name, work) {
  try { await work() } catch (error) { check(name, false, error.message) }
}
export async function api(method, path, body, options = {}) {
  const start = performance.now()
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(options.token === '' ? {} : { Authorization: `Bearer ${options.token || adminToken}` }), ...options.headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(options.timeout || 120000) })
  const result = parse(await response.text())
  calls.push({ method, path, status: response.status, ms: Math.round(performance.now() - start) })
  if (options.allowError) return { ...result, http: response.status }
  assert.ok(response.ok && ['OK', 'ACCEPTED', '0'].includes(String(result.code)), `${method} ${path}: ${response.status} ${result.message}`)
  return result.data
}
let adminToken = ''
adminToken = (await api('POST', '/auth/login', credentials, { token: '' })).accessToken
export const admin = adminToken
export const get = (path, options) => api('GET', path, undefined, options)
export async function reject(name, method, path, body, statuses = [400, 409, 422], options = {}) {
  const result = await api(method, path, body, { ...options, allowError: true })
  check(name, statuses.includes(result.http) && !/Exception|StackTrace|SQLSyntax|org\.springframework/i.test(result.message || ''), { http: result.http, code: result.code, message: result.message })
  return result
}
export async function poll(path, success = ['SUCCEEDED'], timeout = 120000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await get(path)
    if (success.includes(result.status)) return result
    assert.ok(!['FAILED', 'CANCELLED', 'PARTIAL_FAILED', 'CLEANUP_FAILED'].includes(result.status), JSON.stringify(result).slice(0, 1800))
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`等待任务超时：${path}`)
}
const exec = promisify(execFile)
export async function sql(database, query, columns) {
  assert.ok(['SOURCE', 'PLATFORM'].includes(database))
  assert.match(query.trim(), /^(SELECT|WITH)\b/i)
  const quoted = `'${query.replaceAll("'", "'\"'\"'")}'`
  const { stdout } = await exec('ssh', ['lab-server', `python3 /home/tjg/idmp-deploy/inspect-departments.py ${database} ${quoted}`], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 })
  return stdout.trimEnd().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('\t').map((value, index) => [columns[index], value === 'NULL' ? null : value])))
}
export async function remember(type, value) {
  state.resources.push({ type, id: value.id || value.importId || value.dashboard?.id, name: value.name || value.dashboard?.name })
  await checkpoint()
  return value
}
export async function finish(name, { persistState = true } = {}) {
  if (persistState) await checkpoint()
  await save(name, { checks, calls })
  console.log(JSON.stringify({ 用例数: checks.length, 通过: checks.filter(c => c.passed).length, 失败: checks.filter(c => !c.passed).length, 请求数: calls.length }))
  if (checks.some(c => !c.passed)) process.exitCode = 1
}
