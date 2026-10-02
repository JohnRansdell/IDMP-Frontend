import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const base = process.env.IDMP_SYSTEM_API || 'http://8.137.157.152/api/v1'
export const tag = process.env.IDMP_SYSTEM_TAG || `FULLTEST_${Date.now()}`
export const evidence = join('.tmp', 'system-test-20261002', tag)
export const checks = []
export const calls = []
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export const rows = value => Array.isArray(value) ? value : value?.records || value?.items || []
export function parseJson(text) {
  return JSON.parse(text, (key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source) ? context.source : value)
}
export async function save(name, value) {
  await mkdir(evidence, { recursive: true })
  await writeFile(join(evidence, `${name}.json`), JSON.stringify(value, null, 2))
}
export function check(name, ok, details = null) {
  checks.push({ name, passed: Boolean(ok), details })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + JSON.stringify(details)}`)
  return Boolean(ok)
}
export async function api(method, path, body, options = {}) {
  const started = performance.now()
  let response, payload
  try {
    response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...options.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(options.timeout || 45000) })
    payload = parseJson(await response.text())
  } catch (error) {
    calls.push({ method, path, ms: Math.round(performance.now() - started), error: error.message })
    throw error
  }
  calls.push({ method, path, http: response.status, code: payload.code, ms: Math.round(performance.now() - started) })
  const result = { http: response.status, ...payload }
  if (options.allowError) return result
  if (!response.ok || !['OK', 'ACCEPTED', '0'].includes(payload.code)) throw new Error(`${method} ${path}: ${response.status} ${payload.message}`)
  return payload.data
}
export async function run(name, work) {
  try { await work() } catch (error) { check(name, false, error.message) }
}
export async function finish() {
  await save('summary', { tag, base, checks, calls })
  console.log(JSON.stringify({ evidence, checks: checks.length, passed: checks.filter(x=>x.passed).length, failed: checks.filter(x=>!x.passed).length, calls: calls.length, slow: calls.filter(x=>x.ms>5000) }))
}
export async function poll(path, statuses, limit = 60000) {
  const end = Date.now() + limit
  while (Date.now() < end) {
    const result = await api('GET', path)
    if (statuses.includes(result.status)) return result
    if (['FAILED', 'ABANDONED', 'PARTIAL_FAILED'].includes(result.status)) throw new Error(JSON.stringify(result.error || result))
    await pause(1000)
  }
  throw new Error(`${path}: 未在 ${limit / 1000} 秒内进入 ${statuses.join(',')}`)
}
