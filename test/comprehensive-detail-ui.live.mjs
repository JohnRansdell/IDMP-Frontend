import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, state, get, rows, sql, check, run, save, finish, folder, close } from './comprehensive-client.mjs'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { warningEventCondition, warningEventPeriod, warningEventScope } from '../src/idmp/features/warnings/eventDetail.js'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const mode = process.argv[2] || '运行参数'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = []
page.setDefaultTimeout(15000)
page.on('pageerror', error => errors.push(error.message))
try {
  if (mode === '运行参数') {
    await page.goto(`${origin}/factor/view/${state.runtimeFactor.id}?factorVersionId=${state.runtimeFactor.draftVersionId}`)
    const section = page.locator('.runtime-query')
    await section.getByRole('button', { name: '查询', exact: true }).waitFor()
    const dates = section.locator('.el-range-input')
    for (const [index, value] of ['2026-01-01 00:00:00', '2026-02-01 00:00:00'].entries()) {
      await dates.nth(index).fill(value)
      await dates.nth(index).press('Tab')
    }
    await page.keyboard.press('Escape')
    const cases = [['不填写可选参数', '', '', ''], ['骨科男性出院', '15', '1', " AND out_dept_code='15' AND sex='1'"], ['呼吸科不限制性别', '16', '', " AND out_dept_code='16'"], ['无匹配科室保留零值', '不存在的科室', '', " AND out_dept_code='不存在的科室'"]]
    for (const [label, department, sex, where] of cases) await run(`因子页面${label}`, async () => {
      for (const [code, value] of [['department', department], ['sex', sex]]) {
        await section.locator('.runtime-parameter-field').filter({ has: page.locator('label span').filter({ hasText: new RegExp(`^${code}$`) }) }).locator('input').fill(value)
      }
      const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/factor-versions/${state.runtimeFactor.draftVersionId}/query`))
      await section.getByRole('button', { name: '查询', exact: true }).click()
      const actualResponse = await response, actual = parse(await actualResponse.text())
      check(`${label}查询成功且发送完整半开周期`, actualResponse.ok() && actual.code === 'OK' && actualResponse.request().postDataJSON().periodStart === '2026-01-01T00:00:00' && actualResponse.request().postDataJSON().periodEnd === '2026-02-01T00:00:00', actual)
      assert.ok(actualResponse.ok() && actual.data, actual.message)
      const expected = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'${where}`, ['value']))[0]
      check(`${label}响应数值严格等于源表`, close(rows(actual.data)[0]?.factor_value, expected.value), { actual: actual.data, expected })
      await section.locator('.query-result').waitFor()
      await page.waitForFunction(() => !document.querySelector('.runtime-query .query-actions button.is-loading'))
      const snapshot = await section.evaluate(node => {
        let component = node.__vueParentComponent
        while (component && component.type.__name !== 'FactorRuntimeQuery') component = component.parent
        return JSON.parse(JSON.stringify({ rows: component.setupState.rows, period: component.setupState.period, values: component.setupState.values }))
      })
      check(`${label}表格未丢弃零值且展示本次结果`, snapshot.rows.length === 1 && close(snapshot.rows[0].value, expected.value) && (await section.locator('.query-result .el-table__body').innerText()).includes(String(expected.value)), snapshot)
      await save(`因子页面${label}`, { expected, snapshot, actual: actual.data })
      await page.screenshot({ path: `${folder}/因子页面${label}.png`, fullPage: true })
    })
  }
  if (mode === '预警详情') {
    for (const rule of state.eventTest.rules) await run(`预警${rule.mode}列表与详情`, async () => {
      const events = rows(await get(`/analysis/warnings?ruleId=${rule.id}&size=100`))
      const event = events.find(item => rule.mode !== 'ALL' || Object.keys(item.comparisonContext?.dimensionSnapshot || {}).length > 0) || events[0]
      assert.ok(event)
      await page.goto(`${origin}/alerts`)
      const ruleFilter = page.locator('.filter-card:visible .el-form-item').filter({ has: page.locator('label').filter({ hasText: /^规则 ID$/ }) })
      await ruleFilter.locator('input').fill(rule.id)
      const response = page.waitForResponse(response => new URL(response.url()).searchParams.get('ruleId') === rule.id && new URL(response.url()).pathname.endsWith('/warnings'))
      await page.locator('.filter-card:visible').getByRole('button', { name: '查询', exact: true }).click()
      await response
      await page.waitForFunction(() => !document.querySelector('[data-testid="warning-events-table"] .el-loading-mask'))
      const bodyRows = page.locator('[data-testid="warning-events-table"] .el-table__body-wrapper .el-table__row')
      await bodyRows.first().waitFor()
      const componentRows = await page.locator('.alert-center').evaluate(node => {
        let component = node.__vueParentComponent
        while (component && component.type.__name !== 'AlertCenter') component = component.parent
        return JSON.parse(JSON.stringify(component.setupState.eventRows))
      })
      const index = componentRows.findIndex(row => row.id === event.id)
      assert.ok(index >= 0)
      const rowText = await bodyRows.nth(index).innerText(), scope = warningEventScope(event), condition = warningEventCondition(event), period = warningEventPeriod(event)
      check(`${rule.mode}列表范围周期条件与冻结事件一致`, rowText.includes(scope.rule) && rowText.includes(scope.result) && rowText.includes(period) && rowText.includes(condition), { rowText, scope, condition, period })
      await bodyRows.nth(index).getByRole('button', { name: '详情', exact: true }).click()
      const detail = page.locator('.warning-event-dialog [data-testid="warning-event-summary"]')
      await detail.waitFor()
      const text = await detail.innerText(), fields = await detail.locator('.event-fields > div').allTextContents()
      check(`${rule.mode}详情当前值及两种范围分别显示`, fields.some(field => field.includes('当前值') && field.includes(String(event.actualValue))) && fields.some(field => field.includes('规则结果范围') && field.includes(scope.rule)) && fields.some(field => field.includes('本次触发结果') && field.includes(scope.result)), fields)
      check(`${rule.mode}详情与列表的条件周期一致且不混入实际值`, (await detail.locator('.event-condition').innerText()) === condition && text.includes(period) && !/比较上下文|指标结果 ID|事件 ID|当前值\s*\/\s*阈值/.test(text), text)
      const dimensions = Object.entries(event.comparisonContext.dimensionSnapshot || {})
      check(`${rule.mode}分组字段和值完整展示`, scope.result !== '分组结果' || dimensions.every(([field, value]) => text.includes(field) && text.includes(String(value))), { text, dimensions })
      await save(`预警页面${rule.mode}`, { event, rowText, text })
      await page.screenshot({ path: `${folder}/预警页面${rule.mode}.png`, fullPage: true })
    })
  }
  check(`${mode}页面无运行异常`, !errors.length, errors)
} finally {
  await browser.close()
  await finish(`${mode}详情页面`, { persistState: false })
}
