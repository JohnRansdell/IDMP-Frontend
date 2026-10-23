import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { newResourceCode } from '../src/idmp/utils/resourceCode.js'
import { db } from './system-db.mjs'

assert.equal(process.env.IDMP_LIVE_WRITE, '1', 'Set IDMP_LIVE_WRITE=1 to create isolated acceptance resources')
const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const folder = '.tmp/indicator-name-code'
await mkdir(folder, { recursive: true })
const parse = text => JSON.parse(text, (_key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) ? context.source : value)
const serialize = value => JSON.stringify(value, (key, item) => /Id$/.test(key) && typeof item === 'string' && /^\d+$/.test(item) ? JSON.rawJSON(item) : item)
const tag = `NAME_CODE_${Date.now()}`
const name = `三级手术中急诊手术占比 编码同名验收 ${tag}`
const evidence = { tag, name, indicators: [], factors: [], checks: [], calls: [] }
const check = (name, condition) => { assert.ok(condition, name); evidence.checks.push(name); console.log(`PASS ${name}`) }
async function api(method, path, body, allowError = false) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: serialize(body) }), signal: AbortSignal.timeout(60000) })
  const result = parse(await response.text())
  evidence.calls.push({ method, path, status: response.status, code: result.code })
  if (allowError) return { ...result, http: response.status }
  assert.ok(response.ok && ['OK', 'ACCEPTED', '0'].includes(result.code), `${method} ${path}: ${response.status} ${result.message}`)
  return result.data
}
async function poll(path, statuses) {
  for (let index = 0; index < 120; index++) {
    const data = await api('GET', path)
    if (statuses.includes(data.status)) return data
    assert.ok(!['FAILED', 'CLEANUP_FAILED', 'PARTIAL_FAILED'].includes(data.status), JSON.stringify(data))
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out: ${path}`)
}
async function recycle(type, id) {
  const root = await api('GET', `/${type}/${id}`)
  const impact = await api('GET', `/${type}/${id}/deletion-impact`)
  assert.ok(impact.deletable, `Do not delete referenced acceptance resource: ${type}/${id}`)
  return api('DELETE', `/${type}/${id}`, { resourceVersion: root.resourceVersion, deleteReason: `${tag} acceptance completed` })
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
let importId
try {
  for (const [route, label, prefix] of [['/factor/edit/new', '因子编码', 'FACTOR'], ['/indicator/edit/new', '指标编码', 'INDICATOR']]) {
    await page.goto(origin + route)
    const input = page.getByRole('textbox', { name: label, exact: true })
    await input.waitFor()
    check(`${label} generated`, new RegExp(`^${prefix}_[A-F0-9]{32}$`).test(await input.inputValue()))
    await input.fill(`${tag}_${prefix}`)
    check(`${label} editable`, await input.inputValue() === `${tag}_${prefix}`)
  }
  const first = await api('POST', '/indicators', { code: newResourceCode('INDICATOR'), name, category: 'QUALITY', unit: '%' })
  evidence.indicators.push(first.id)
  const second = await api('POST', '/indicators', { code: newResourceCode('INDICATOR'), name, category: 'QUALITY', unit: '%' })
  evidence.indicators.push(second.id)
  check('same-name creation keeps distinct identities and codes', first.id !== second.id && first.code !== second.code && first.name === second.name)
  const duplicate = await api('POST', '/indicators', { code: first.code, name: `${name} 重复编码负例` }, true)
  check('duplicate code rejected', duplicate.http === 409 && duplicate.code === 'COMMON-40900')
  let current = await api('PUT', `/indicators/${second.id}`, { resourceVersion: second.resourceVersion, name: `${name} 临时改名` })
  current = await api('PUT', `/indicators/${second.id}`, { resourceVersion: current.resourceVersion, name })
  check('rename to occupied name succeeds', current.id === second.id && current.name === name)
  const deleted = await recycle('indicators', second.id)
  const restored = await api('POST', `/indicators/recycle-bin/${second.id}/restore`, { resourceVersion: deleted.resourceVersion })
  check('restore same-name indicator succeeds', restored.resourceId === second.id)

  const definition = { schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: 'STATIC', primaryDomain: { domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', sourceAlias: 'base' }, aggregation: { function: 'COUNT' }, filters: { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: '3' }, groupBy: [], parameters: [], output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO' }
  const reuseTemplateVersion = process.env.IDMP_TEMPLATE_VERSION_ID
  const template = reuseTemplateVersion
    ? await api('GET', `/factor-template-versions/${reuseTemplateVersion}`)
    : await api('POST', '/factor-templates', { code: `${tag}_TPL`, name: `三级手术计数模板 ${tag}`, factorTypeScope: 'AGGREGATE', templateDefinition: definition, parameters: [] })
  evidence.template = { id: template.template.id, versionId: template.version.id }
  if (!reuseTemplateVersion) {
    const validation = await api('POST', `/factor-template-versions/${template.version.id}/validate`)
    check('real surgery template valid', validation.valid)
    await api('POST', `/factor-template-versions/${template.version.id}/publish`, { resourceVersion: validation.resourceVersion })
  } else check('reuse published real surgery template', template.version.publicationStatus === 'PUBLISHED')
  await page.goto(`${origin}/factor/templates/${template.template.id}/versions/${template.version.id}/instantiate`)
  const templateCode = page.getByRole('textbox', { name: '因子编码', exact: true })
  await templateCode.waitFor()
  check('template instance code generated', /^FACTOR_[A-F0-9]{32}$/.test(await templateCode.inputValue()))
  await templateCode.fill(`${tag}_TEMPLATE_FACTOR`)
  await page.getByPlaceholder('例如 女性出院病案人次').fill(`三级手术总例数 模板编码验收 ${tag}`)
  const instantiated = page.waitForResponse(response => response.url().endsWith('/instantiate') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '创建因子草稿', exact: true }).click()
  const instance = parse(await (await instantiated).text())
  assert.equal(instance.code, 'OK', JSON.stringify(instance))
  const factor = instance.data.factor
  evidence.factors.push(factor.id)
  check('template manual code persisted', factor.code === `${tag}_TEMPLATE_FACTOR`)
  await page.getByRole('button', { name: '编译并校验', exact: true }).click()
  await page.getByRole('button', { name: '可选：试算验证', exact: true }).click()
  await page.getByRole('button', { name: '试算并查看结果', exact: true }).click()
  await page.locator('.trial-results tbody tr').first().waitFor({ timeout: 90000 })
  const truth = (await db('SOURCE', "SELECT JSON_OBJECT('total',COUNT(*),'emergency',SUM(surgery_classfy='2')) FROM vmq_surgeryinfo WHERE surgery_level='3'"))[0]
  evidence.sourceTruth = truth
  const templateRow = await page.locator('.trial-results tbody').innerText()
  check('template trial equals real source count', templateRow.includes(String(truth.total)))
  await page.screenshot({ path: `${folder}/template.png`, fullPage: true })

  await page.goto(`${origin}/indicator/import/sql`)
  await page.getByPlaceholder('请输入 MySQL 8 SELECT SQL').fill(`WITH all_surgery AS (SELECT COUNT(*) total_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3'), emergency_surgery AS (SELECT COUNT(*) emergency_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3' AND b.surgery_classfy='2') SELECT total_cnt admissions, emergency_cnt emergency, ROUND(emergency_cnt*100.0/total_cnt,2) rate_percent FROM all_surgery CROSS JOIN emergency_surgery`)
  const parsed = page.waitForResponse(response => response.url().endsWith('/sql-imports') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '解析 SQL', exact: true }).click()
  const task = parse(await (await parsed).text())
  assert.equal(task.code, 'OK', JSON.stringify(task)); importId = task.data.importId; evidence.importId = importId
  await page.getByRole('textbox', { name: '因子编码', exact: true }).first().waitFor()
  const factorCodes = page.getByRole('textbox', { name: '因子编码', exact: true })
  assert.equal(await factorCodes.count(), 2)
  for (let index = 0; index < 2; index++) check(`SQL factor ${index} generated`, /^FACTOR_[A-F0-9]{32}$/.test(await factorCodes.nth(index).inputValue()))
  await factorCodes.first().fill(`${tag}_SQL_FACTOR`)
  const importedCode = page.getByRole('textbox', { name: '指标编码', exact: true })
  check('SQL indicator generated', /^INDICATOR_[A-F0-9]{32}$/.test(await importedCode.inputValue()))
  await importedCode.fill(`${tag}_SQL_INDICATOR`)
  for (let index = 0; index < 2; index++) await page.getByPlaceholder('因子名称（已按解析建议预填）').nth(index).fill(`三级手术${index ? '急诊' : '总'}例数 SQL编码验收 ${tag}`)
  await page.locator('.el-form-item').filter({ has: page.locator('label').filter({ hasText: /^指标名称$/ }) }).locator('input').fill(name)
  await page.getByRole('button', { name: '确认元数据并进入试算', exact: true }).click()
  await page.getByRole('button', { name: '发起试算', exact: true }).waitFor({ timeout: 30000 })
  const saved = await api('GET', `/sql-imports/${importId}`)
  check('SQL manual codes persist in metadata', saved.metadata.indicatorCode === `${tag}_SQL_INDICATOR` && saved.metadata.factors[0].code === `${tag}_SQL_FACTOR`)
  await page.reload()
  await page.getByRole('button', { name: '发起试算', exact: true }).click()
  const completed = await poll(`/sql-imports/${importId}`, ['TRIAL_SUCCEEDED'])
  evidence.importResult = completed
  check('SQL same-name indicator passes preflight and trial', Boolean(completed.result.indicatorId))
  const results = await api('GET', `/indicator-versions/${completed.result.indicatorVersionId}/trials/${completed.result.trialBatchId}/results?page=1&size=100`)
  const row = results.targets[0].results.records[0]
  evidence.importRow = row
  check('SQL trial agrees with source numerator and denominator', Number(row.numeratorValue) === Number(truth.emergency) && Number(row.denominatorValue) === Number(truth.total))
  const imported = await api('GET', `/indicators/${completed.result.indicatorId}`)
  check('third same-name indicator has independent manual code', imported.name === first.name && imported.code === `${tag}_SQL_INDICATOR`)
  const factorConflict = await api('POST', '/factors', { code: newResourceCode('FACTOR'), name: factor.name, dsl: definition }, true)
  check('factor name still unique', factorConflict.http === 409 && factorConflict.code === 'FACTOR-40901')
  await page.screenshot({ path: `${folder}/sql-trial.png`, fullPage: true })
  check('browser has no runtime errors', pageErrors.length === 0)
  evidence.passed = true
} catch (error) {
  evidence.error = error.message
  await page.screenshot({ path: `${folder}/failure.png`, fullPage: true })
  throw error
} finally {
  try {
    if (importId) { await api('POST', `/sql-imports/${importId}/abandon`, { reason: `${tag} acceptance completed` }); await poll(`/sql-imports/${importId}`, ['ABANDONED']) }
    for (const id of evidence.indicators) await recycle('indicators', id)
    for (const id of evidence.factors) await recycle('factors', id)
    evidence.cleaned = true
  } finally {
    await writeFile(`${folder}/checks-${tag}.json`, JSON.stringify(evidence, null, 2))
    await browser.close()
  }
}
console.log(JSON.stringify({ passed: evidence.passed, cleaned: evidence.cleaned, tag, checks: evidence.checks.length, indicators: evidence.indicators, sourceTruth: evidence.sourceTruth }))
