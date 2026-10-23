import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'}/alerts`, { waitUntil: 'networkidle' })
  await mkdir('.tmp/warning-filter-layout', { recursive: true })
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const [tab, fields] of [
      ['预警事件', [['事件状态', ['待处理', '已确认', '已关闭']], ['事件级别', ['提示', '低', '中', '高', '严重']]]],
      ['预警规则', [['规则是否启用', ['已启用', '未启用']], ['规则发布状态', ['未发布', '已发布']]]]
    ]) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      for (const [name, labels] of fields) {
        const input = page.getByRole('combobox', { name, exact: true })
        const select = input.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," el-select ")]')
        for (const label of labels) {
          await select.locator('.el-select__wrapper').click()
          await page.getByRole('option', { name: label, exact: true }).click()
          const selected = select.locator('.el-select__selected-item:not(.el-select__input-wrapper)')
          assert.equal(await selected.innerText(), label)
          const layout = await selected.evaluate(element => ({ width: element.clientWidth, textWidth: element.scrollWidth }))
          assert.ok(layout.width >= layout.textWidth, `${name}/${label}: ${JSON.stringify(layout)}`)
          assert.ok((await select.boundingBox()).width >= 160)
        }
      }
      await page.screenshot({ path: `.tmp/warning-filter-layout/${tab === '预警事件' ? 'events' : 'rules'}-${viewport.width}.png`, fullPage: true })
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS: all event status/severity and rule enable/publication labels fit at 1440, 1024 and 390px')
} finally {
  await browser.close()
}
