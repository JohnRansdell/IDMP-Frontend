import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5178'
const evidence = '.tmp/warning-event-detail'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage()
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
try {
  const response = await page.request.get(`${origin}/api/v1/analysis/warnings?page=1&size=100`)
  assert.ok(response.ok())
  const { data } = JSON.parse(await response.text(), (_key, value, context) =>
    typeof value === 'number' && !Number.isSafeInteger(value) && /^\d+$/.test(context.source) ? context.source : value)
  const cases = [
    data.records.find(event => event.comparisonContext.resultScope?.mode === 'ALL' && !Object.keys(event.comparisonContext.dimensionSnapshot || {}).length),
    data.records.find(event => event.comparisonContext.resultScope?.mode === 'MAIN'),
    data.records.find(event => event.comparisonContext.resultScope?.mode === 'GROUPED' && event.comparisonContext.resultScope.targetCode === 'BASE'),
    data.records.find(event => event.comparisonContext.resultScope?.mode === 'GROUPED' && event.comparisonContext.resultScope.targetCode?.startsWith('DRILL:')),
    data.records.find(event => event.comparisonContext.resultScope?.mode === 'ALL' && Object.keys(event.comparisonContext.dimensionSnapshot || {}).length)
  ]
  assert.ok(cases.every(Boolean), 'Real MAIN, ALL and grouped BASE / DRILL events must exist')
  await page.setViewportSize({ width: 1828, height: 1000 })
  await page.goto(`${origin}/alerts`)
  const table = page.getByTestId('warning-events-table')
  const rows = table.locator('.el-table__body-wrapper .el-table__row')
  await rows.first().waitFor()
  const headings = await table.locator('th').allTextContents()
  assert.ok(headings.includes('当前值') && headings.includes('触发结果') && headings.includes('触发条件'))
  assert.ok(!headings.includes('比较上下文') && !headings.includes('当前值 / 阈值'))
  const listEvents = data.records.slice(0, 9)
  assert.equal(await rows.count(), listEvents.length)
  for (const [index, event] of listEvents.entries()) {
    const row = rows.nth(index)
    const text = await row.innerText()
    const condition = await row.locator('.event-condition').innerText()
    assert.equal(await row.locator('.event-current-value').innerText(), String(event.actualValue))
    assert.ok(text.includes('规则结果范围：') && text.includes('本次触发结果：') && text.includes('结果统计周期：'))
    assert.ok(text.includes(event.periodStart.replace('T', ' ')) && text.includes(event.periodEnd.replace('T', ' ')))
    assert.ok(!condition.includes(String(event.actualValue)))
    assert.ok(condition.includes('指标值'))
    for (const [field, value] of Object.entries(event.comparisonContext.dimensionSnapshot)) assert.ok(text.includes(field) && text.includes(String(value)))
  }
  await page.screenshot({ path: `${evidence}/events-list-desktop.png` })
  const firstCondition = await rows.first().locator('.event-condition').innerText()
  await rows.first().getByRole('button', { name: '详情', exact: true }).click()
  const clickedSummary = page.getByRole('dialog', { name: '预警事件详情' }).getByTestId('warning-event-summary')
  await clickedSummary.waitFor()
  assert.equal(await clickedSummary.locator('.event-condition').innerText(), firstCondition)
  checks.push({ list: 'current value, condition, scope, dimensions and frozen period aligned', rows: listEvents.length })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const event of cases) {
      await page.goto(`${origin}/alerts?eventId=${event.id}`)
      const dialog = page.getByRole('dialog', { name: '预警事件详情' })
      const summary = dialog.getByTestId('warning-event-summary')
      await summary.waitFor()
      await dialog.locator('.event-deliveries .el-table').waitFor()
      if (Object.keys(event.comparisonContext.dimensionSnapshot).some(field => /dept.*code/i.test(field))) {
        await page.waitForFunction(() => {
          const values = [...document.querySelectorAll('.warning-event-summary .event-dimensions dd')]
          return values.some(value => value.innerText.includes('（')) || document.querySelector('.warning-event-summary [role="status"]')
        })
      }
      const text = await summary.innerText()
      assert.ok(!text.includes('事件 ID') && !text.includes('指标结果 ID') && !text.includes('比较上下文') && !text.includes('当前值 / 阈值'))
      assert.ok(text.includes(String(event.actualValue)), `Expected ${event.actualValue} in ${text}`)
      assert.ok(text.includes('指标值') && text.includes('触发条件'))
      assert.ok(!(await summary.locator('.event-condition').innerText()).includes(String(event.actualValue)))
      assert.ok(text.includes(event.periodStart.replace('T', ' ')) && text.includes(event.periodEnd.replace('T', ' ')))
      assert.ok(!text.includes('未记录统计周期'))
      const grouped = Object.keys(event.comparisonContext.dimensionSnapshot).length > 0
      assert.ok(text.includes(`本次触发结果\n${grouped ? '分组结果' : '总体结果'}`))
      for (const [field, value] of Object.entries(event.comparisonContext.dimensionSnapshot)) {
        assert.ok(text.includes(field) && text.includes(String(value)))
      }
      const overflow = await summary.evaluate(element => element.scrollWidth > element.clientWidth + 1)
      assert.equal(overflow, false)
      await dialog.screenshot({ path: `${evidence}/${event.id}-${viewport.width}.png` })
      checks.push({ eventId: event.id, width: viewport.width, scope: event.comparisonContext.resultScope.mode, grouped, text })
    }
  }
  assert.deepEqual(errors, [])
  await writeFile(`${evidence}/checks.json`, JSON.stringify({ checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, errors }))
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
  throw error
} finally { await browser.close() }
