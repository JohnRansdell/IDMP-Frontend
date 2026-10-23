import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { buildArithmeticFormula, createArithmeticNode } from '../src/idmp/features/indicator/arithmeticFormula.js'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const folder = '.tmp/full-system-audit-20261023'
const state = JSON.parse(await readFile(`${folder}/resources.json`, 'utf8'))
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const checks = [], errors = []
const check = (name, passed, detail) => { checks.push({ name, passed: Boolean(passed), detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed ? '' : ' ' + String(JSON.stringify(detail)).slice(0, 2000)}`) }
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true })
page.setDefaultTimeout(20000)
page.on('pageerror', error => errors.push(error.message))
async function api(method, path, body) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = parse(await response.text()); assert.ok(response.ok && ['OK', 'ACCEPTED'].includes(result.code), `${path}: ${result.message}`); return result.data
}
async function open(path) {
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
  await page.locator('main').waitFor()
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
}
async function run(name, fn) {
  try { await fn() } catch (error) { check(name, false, error.message); await page.screenshot({ path: `${folder}/browser-review-failure-${checks.length}.png` }).catch(() => {}) }
}
try {
  if (process.argv[2] !== 'presentation') await run('corrected route content assertions', async () => {
    await open('/indicator'); check('indicator directory actual title', (await page.locator('main').innerText()).includes('指标目录'))
    await open(`/factor/templates/${state.template.id}/versions/${state.template.versionId}`)
    const text = await page.locator('main').innerText()
    const values = await page.locator('main input').evaluateAll(nodes => nodes.map(node => node.value))
    check('template version displays real name in form input', text.includes('因子模板版本') && values.includes(`level surgery ${state.tag}`), { text: text.slice(0, 500), values })
  })
  if (process.argv[2] !== 'presentation') await run('real visual formula constant typing save compile and trial', async () => {
    if (!state.uiFormula) {
      const factorVersionId = state.arithmetic.factors.VISITS.draftVersionId
      const ref = () => ({ nodeType: 'FACTOR_REF', factorVersionId })
      const c = value => ({ ...createArithmeticNode('CONST'), value: String(value) })
      const formula = buildArithmeticFormula({ nodeType: 'FUNCTION', functionCode: 'CLAMP', arguments: [{ nodeType: 'BINARY', operator: 'DIV', left: ref(), right: ref(), zeroDenominatorPolicy: 'RETURN_NULL' }, c(0), c(1)] }, { calculationMode: 'STATIC', display: { format: 'NUMBER', scale: 2, multiplier: '1', roundingMode: 'HALF_UP' } })
      const indicator = await api('POST', '/indicators', { code: `${state.tag}_UI_FORMULA`, name: `UI CLAMP ratio ${state.tag}`, category: 'QUALITY' })
      const version = await api('POST', `/indicators/${indicator.id}/versions`, { formula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
      state.uiFormula = { indicatorId: indicator.id, versionId: version.id }
      await writeFile(`${folder}/resources.json`, JSON.stringify(state, null, 2))
    }
    await open(`/indicator/edit/${state.uiFormula.indicatorId}`)
    await page.getByRole('tab', { name: '2 公式与试算', exact: true }).click()
    await page.getByRole('button', { name: '下限槽位', exact: true }).click()
    check('UI exposes constant type instead of silently assuming compatibility', await page.getByRole('textbox', { name: '常量量纲', exact: true }).isVisible())
    await page.getByRole('textbox', { name: '常量量纲', exact: true }).fill('RATIO')
    await page.getByRole('button', { name: '上限槽位', exact: true }).click()
    await page.getByRole('textbox', { name: '常量量纲', exact: true }).fill('RATIO')
    const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/formula'))
    await page.getByRole('button', { name: '保存公式', exact: true }).click()
    const saveResponse = parse(await (await saved).text()); check('UI saves typed formula through actual API', saveResponse.code === 'OK', saveResponse)
    const compiled = page.waitForResponse(response => response.url().endsWith('/formula/compile'))
    await page.getByRole('button', { name: '公式校验', exact: true }).click()
    const compileResponse = parse(await (await compiled).text())
    check('UI typed CLAMP formula compiles valid', ['VALID', 'VALID_WITH_WARNINGS'].includes(compileResponse.data?.status), compileResponse)
    const trial = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/trial'))
    await page.getByRole('button', { name: '试算并查看结果', exact: true }).click()
    const trialResponse = parse(await (await trial).text()); assert.ok(['0', 'OK', 'ACCEPTED'].includes(String(trialResponse.code)))
    await page.getByLabel('指标试算多粒度结果', { exact: true }).waitFor({ timeout: 120000 })
    const text = await page.getByLabel('指标试算多粒度结果', { exact: true }).innerText()
    const results = await api('GET', `/indicator-versions/${state.uiFormula.versionId}/trials/${trialResponse.data.batchId}/results?page=1&size=100`)
    const row = results.targets[0].results.records[0]
    check('UI full trial result equals independent CLAMP(14187/14187,0,1)=1', Number(row.resultValue) === 1 && text.includes('1.00'), { text, row })
    const persisted = await api('GET', `/indicator-versions/${state.uiFormula.versionId}`)
    check('UI typed constant metadata persisted on both bounds', persisted.formula.root.arguments.slice(1).every(node => node.typeDescriptor.dimension === 'RATIO'))
    await page.getByLabel('指标试算多粒度结果', { exact: true }).screenshot({ path: `${folder}/ui-formula-trial.png` })
    await writeFile(`${folder}/ui-formula-roundtrip.json`, JSON.stringify({ compileResponse, results, text, persisted }, null, 2))
  })
  if (process.argv[2] !== 'presentation') await run('real analysis PDF export matches displayed mortality data', async () => {
    const version = await api('GET', '/indicator-versions/102027642460761114')
    await open(`/analysis?indicator=${version.indicatorId}&indicatorVersionId=102027642460761114&periodStart=2026-01-01&periodEnd=2026-01-31`)
    const exportButton = page.getByRole('button', { name: '导出PDF', exact: true })
    await exportButton.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === '导出PDF')?.disabled === false, { timeout: 60000 })
    const request = page.waitForResponse(response => response.url().endsWith('/export/pdf'))
    const download = page.waitForEvent('download', { timeout: 60000 }).catch(error => ({ error: error.message }))
    await exportButton.click()
    const response = await request
    const payload = JSON.parse(response.request().postData())
    await writeFile(`${folder}/real-mortality-analysis-export.json`, JSON.stringify({ payload, status: response.status(), contentType: response.headers()['content-type'] }, null, 2))
    assert.equal(response.status(), 200, await response.text().catch(() => 'PDF export failed'))
    const file = await download
    assert.ok(!file.error, file.error)
    await file.saveAs(`${folder}/real-mortality-analysis.pdf`)
    const buffer = await readFile(`${folder}/real-mortality-analysis.pdf`)
    check('PDF actual UI download valid and exact indicator version', response.status() === 200 && buffer.subarray(0, 5).toString() === '%PDF-' && payload.indicatorVersionId === '102027642460761114')
    check('PDF overview includes real ratio numerator denominator and period', JSON.stringify(payload).includes('0.39%') && JSON.stringify(payload).includes('14,187') && JSON.stringify(payload).includes('55') && JSON.stringify(payload.metadata).includes('2026-01'), payload.metadata)
    check('PDF includes nonempty real trend chart', payload.sections.some(section => section.chartPng?.startsWith('data:image/png;base64,') && section.rows.length > 0))
    await writeFile(`${folder}/real-mortality-analysis-payload.json`, JSON.stringify(payload, null, 2))
    await page.screenshot({ path: `${folder}/real-mortality-analysis-source.png` })
  })
  if (process.argv[2] === 'presentation') await run('analysis chart semantic formatting and target alignment', async () => {
    const version = await api('GET', '/indicator-versions/102027642460761114')
    const target = await api('GET', '/indicator-versions/102027642460761114/performance-target')
    await open(`/analysis?indicator=${version.indicatorId}&indicatorVersionId=${version.id}&periodStart=2026-01-01&periodEnd=2026-01-31`)
    const snapshot = await page.locator('.indicator-analysis').evaluate(node => {
      let component = node.__vueParentComponent
      while (component && component.type.__name !== 'IndicatorAnalysis') component = component.parent
      const state = component.setupState
      return JSON.parse(JSON.stringify({ profile: state.currentProfile, option: state.trendOption, rows: state.trendTableRows, overview: state.analysisOverview, version: state.backendIndicatorVersion }))
    })
    const january = snapshot.rows.find(row => row.label === '2026-01')
    check('analysis trend follows percentage display spec even when legacy unit empty', version.displaySpec?.format !== 'PERCENT' || snapshot.profile.unit === '%' && Math.abs(Number(january.actual) - 0.39) < 0.001, { displaySpec: version.displaySpec, unit: snapshot.profile.unit, january })
    check('analysis configured performance target displayed rather than ignored', target.targetValue == null || snapshot.profile.targetLabel !== '目标值未配置' && snapshot.profile.markLineValue != null, { configuredTarget: target, profile: snapshot.profile })
    check('analysis null target does not fabricate zero reference line', snapshot.profile.markLineValue != null || !snapshot.option.series[0].markLine, { profile: snapshot.profile, markLine: snapshot.option.series[0].markLine })
    const report = JSON.parse(await readFile(`${folder}/real-mortality-analysis-payload.json`, 'utf8'))
    const pdfRow = report.sections.find(section => section.title === '趋势分析').rows.find(row => row[0] === '2026-01')
    check('PDF trend uses same percent display as overview', pdfRow[1] === '0.39%', { pdfRow, overview: report.sections[0].rows })
    await writeFile(`${folder}/analysis-presentation-confirmed.json`, JSON.stringify({ snapshot, target, version, pdfRow }, null, 2))
    await page.screenshot({ path: `${folder}/analysis-presentation-confirmed.png` })
  })
  await run('mobile visual heading collision geometry', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(`/indicator/view/${state.arithmetic.indicator.id}`)
    const overlap = await page.locator('.page-heading').evaluate(node => {
      const title = node.querySelector('h1').getBoundingClientRect()
      return [...node.querySelectorAll('.page-heading__actions button')].map(button => {
        const bounds = button.getBoundingClientRect()
        return { text: button.textContent.trim(), intersects: title.left < bounds.right && title.right > bounds.left && title.top < bounds.bottom && title.bottom > bounds.top }
      })
    })
    check('mobile long indicator heading does not overlap actions', overlap.every(item => !item.intersects), overlap)
    await page.screenshot({ path: `${folder}/mobile-heading-overlap.png` })
  })
  check('browser deeper flows no runtime exceptions', errors.length === 0, errors)
} finally {
  await writeFile(`${folder}/${process.argv[2] === 'presentation' ? 'browser-presentation' : 'browser-review'}-summary.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ passed: checks.filter(item => item.passed).length, failed: checks.filter(item => !item.passed).length }))
if (checks.some(item => !item.passed)) process.exitCode = 1
