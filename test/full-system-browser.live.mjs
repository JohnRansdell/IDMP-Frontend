import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const folder = '.tmp/full-system-audit-20261023'
const state = JSON.parse(await readFile(`${folder}/resources.json`, 'utf8'))
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
const checks = [], routes = [], errors = [], responses = []
let current = ''
page.setDefaultTimeout(15000)
page.on('pageerror', error => errors.push({ route: current, message: error.message }))
page.on('response', response => {
  if (response.url().includes('/api/v1/') && response.status() >= 400) responses.push({ route: current, url: response.url(), status: response.status() })
})
const check = (name, passed, detail) => { checks.push({ name, passed: Boolean(passed), detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : ' ' + JSON.stringify(detail).slice(0, 2200)}`) }
async function run(name, work) {
  try { await work() } catch (error) {
    check(name, false, { message: error.message })
    await page.screenshot({ path: `${folder}/browser-failure-${checks.length}.png` }).catch(() => {})
  }
}
async function open(route) {
  current = route
  await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('main').waitFor({ timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
}
async function api(path) {
  const response = await fetch(`${origin}/api/v1${path}`)
  const data = parse(await response.text()); assert.equal(data.code, 'OK', `${path}: ${data.message}`); return data.data
}
try {
  const pages = [
    ['/dashboard/manage', '看板管理'], ['/indicator', '指标管理'], ['/factor', '因子管理'], ['/factor/templates', '因子模板管理'],
    ['/factor/templates/new', '新建因子模板'], ['/indicator/edit/new', '新建'], ['/factor/edit/new', '因子'],
    ['/indicator/import/sql', 'SQL'], ['/scenarios', '场景管理'], ['/mapping', '映射'], ['/alerts', '预警'], ['/calc', '计算'],
    ['/data/sources', '数据源管理'], ['/data/domains', '数据域管理'], ['/data/value-sets', '值集管理'],
    ['/data/value-sets/new', '值集'], ['/policies', '政策文件'], ['/system', '系统管理'],
    ['/factor/recycle-bin', '回收站'], ['/indicator/recycle-bin', '回收站'],
    [`/data/domains/${state.domain.id}`, 'domain'],
    [`/data/standardization/${state.transform.mappingId}`, '标准化'],
    [`/data/value-sets/${state.valuesets.find(item => item.code.endsWith('DISCRETE')).id}`, 'DISCRETE'],
    [`/data/value-set-versions/${state.valuesets.find(item => item.code.endsWith('DISCRETE')).versionId}/edit`, 'DISCRETE'],
    [`/factor/templates/${state.template.id}/versions/${state.template.versionId}`, 'level surgery'],
    [`/factor/templates/${state.template.id}/versions/${state.template.versionId}/instantiate`, '创建因子'],
    [`/factor/view/${state.nestedFactor.factor.id}`, '男性或死亡'],
    [`/factor/edit/${state.nestedFactor.factor.id}`, '男性或死亡'],
    [`/indicator/view/${state.arithmetic.indicator.id}`, '每百出院'],
    [`/indicator/edit/${state.arithmetic.indicator.id}`, '每百出院'],
    [`/scenarios/${state.scenario.id}/edit?versionId=${state.scenario.versionId}`, 'cost audit'],
    [`/mapping/${state.mapping.id}`, 'scale 100'],
    [`/calc?batchId=${state.arithmetic.formal.batchId}#batch-overview`, '计算批次概览'],
    [`/analysis?indicator=${state.arithmetic.indicator.id}&indicatorVersionId=${state.arithmetic.version.id}`, '每百出院'],
    [`/dashboard?id=${state.dashboard.id}`, 'isolated real quality']
  ]
  for (const [route, expected] of pages) await run(`route ${route}`, async () => {
    const start = performance.now(), before = errors.length
    await open(route)
    const text = await page.locator('main').innerText()
    const detail = { route, ms: Math.round(performance.now() - start), text: text.slice(0, 3000), runtimeErrors: errors.slice(before), apiErrors: responses.filter(item => item.route === route) }
    routes.push(detail)
    check(`route renders ${route}`, text.includes(expected) && errors.length === before, detail)
    await page.screenshot({ path: `${folder}/route-${routes.length}.png` })
  })
  await run('generated factor and indicator codes editable', async () => {
    for (const [route, label, prefix] of [['/factor/edit/new', '因子编码', 'FACTOR'], ['/indicator/edit/new', '指标编码', 'INDICATOR']]) {
      await open(route)
      const code = page.getByRole('textbox', { name: label, exact: true })
      const value = await code.inputValue()
      check(`${prefix} generated code valid`, new RegExp(`^${prefix}_[A-F0-9]{32}$`).test(value), { value })
      await code.fill(`${state.tag}_UI_${prefix}`)
      check(`${prefix} generated code can be manually changed`, await code.inputValue() === `${state.tag}_UI_${prefix}`)
    }
  })
  await run('real template instantiated by UI', async () => {
    await open(`/factor/templates/${state.template.id}/versions/${state.template.versionId}/instantiate`)
    const code = page.getByRole('textbox', { name: '因子编码', exact: true })
    check('template UI instance code generated', /^FACTOR_[A-F0-9]{32}$/.test(await code.inputValue()))
    await code.fill(`${state.tag}_UI_TEMPLATE`)
    await page.getByPlaceholder('例如 女性出院病案人次').fill(`UI template source check ${state.tag}`)
    const requested = page.waitForResponse(response => response.url().endsWith('/instantiate') && response.request().method() === 'POST')
    await page.getByRole('button', { name: '创建因子草稿', exact: true }).click()
    const response = parse(await (await requested).text()); assert.equal(response.code, 'OK', response.message)
    state.uiFactor = response.data.factor
    state.factors.push({ id: state.uiFactor.id, versionId: state.uiFactor.draftVersionId, code: state.uiFactor.code })
    await writeFile(`${folder}/resources.json`, JSON.stringify(state, null, 2))
    const stored = await api(`/factor-versions/${state.uiFactor.draftVersionId}`)
    check('UI-created factor persisted selected template and parameter', stored.origin.templateVersionId === state.template.versionId && stored.dsl.filters.value === '3', stored)
    await page.screenshot({ path: `${folder}/ui-template-created.png` })
  })
  await run('scenario draft edit save reload preserves invisible configuration', async () => {
    const route = `/scenarios/${state.scenario.id}/edit?versionId=${state.scenario.copyVersionId}`
    const before = await api(`/scenario-versions/${state.scenario.copyVersionId}`)
    await open(route)
    await page.getByPlaceholder('填写主管部门（可选）').fill(`QA browser ${state.tag}`)
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await page.waitForLoadState('networkidle')
    const after = await api(`/scenario-versions/${state.scenario.copyVersionId}`)
    check('scenario UI edit real backend persisted', after.scenario.governingOrgName === `QA browser ${state.tag}`, after.scenario)
    check('scenario UI save preserves quarterly per-indicator period', after.version.indicators[0].periodType === before.version.indicators[0].periodType && before.version.indicators[0].periodType === 'QUARTERLY', { before: before.version.indicators, after: after.version.indicators })
    check('scenario UI save preserves hidden defaultParameters', JSON.stringify(after.version.defaultParameters) === JSON.stringify(before.version.defaultParameters), { before: before.version.defaultParameters, after: after.version.defaultParameters })
    await page.reload(); await page.waitForLoadState('networkidle')
    check('scenario UI reload round trip', await page.getByPlaceholder('填写主管部门（可选）').inputValue() === `QA browser ${state.tag}`)
  })
  await run('published complex formula view and edit read-only', async () => {
    await open(`/indicator/view/${state.arithmetic.indicator.id}?indicatorVersionId=${state.arithmetic.version.id}`)
    const formula = page.getByLabel('指标公式')
    const text = await formula.innerText()
    check('complex formula view retains all four factor names and constant', ['TOTAL', 'DRUG', 'MATERIAL', 'VISITS', '100'].every(value => text.includes(value)), { text })
    await formula.screenshot({ path: `${folder}/complex-formula-view.png` })
    await open(`/indicator/edit/${state.arithmetic.indicator.id}?indicatorVersionId=${state.arithmetic.version.id}`)
    check('published complex indicator preview nonempty', (await page.getByLabel('实时公式预览').innerText()).includes('100'))
    const saveButtons = page.getByRole('button', { name: /保存公式|编译公式/ })
    check('published formula cannot save over current version', await saveButtons.count() === 0 || await saveButtons.first().isDisabled())
    await page.screenshot({ path: `${folder}/complex-formula-editor.png` })
  })
  await run('mobile route layout', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const route of ['/indicator', '/alerts', `/factor/view/${state.nestedFactor.factor.id}`, `/indicator/view/${state.arithmetic.indicator.id}`]) {
      await open(route)
      const bounds = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }))
      check(`mobile no page-wide overflow ${route}`, bounds.scroll <= bounds.viewport + 1, bounds)
      await page.screenshot({ path: `${folder}/mobile-${checks.length}.png` })
    }
  })
} finally {
  await writeFile(`${folder}/browser-all-summary.json`, JSON.stringify({ checks, routes, errors, responses }, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ passed: checks.filter(item => item.passed).length, failed: checks.filter(item => !item.passed).length, routes: routes.length, errors }))
if (checks.some(item => !item.passed)) process.exitCode = 1
