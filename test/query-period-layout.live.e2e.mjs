import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'

const require = createRequire('C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const baseURL = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'
const evidence = '.tmp/query-period-layout'
await mkdir(evidence, { recursive: true })
try {
  const errors = []
  for (const [name, path, panelSelector, periodSelector] of [
    ['factor', '/factor/view/102027642461312818', '.runtime-query', '.query-period'],
    ['indicator', '/analysis?indicator=102027642461313070', '.instant-query-panel', '.instant-query-panel__period']
  ]) {
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle', timeout: 90000 })
    const panel = page.locator(panelSelector)
    await panel.locator(`${periodSelector} .el-date-editor`).waitFor({ timeout: 60000 })
    await panel.locator('.runtime-parameter-field').first().waitFor()
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await panel.scrollIntoViewIfNeeded()
      const layout = await panel.evaluate((panel, periodSelector) => {
        const period = panel.querySelector(periodSelector)
        const label = period.querySelector('label').getBoundingClientRect()
        const input = period.querySelector('.el-date-editor').getBoundingClientRect()
        const parameters = [...panel.querySelectorAll('.runtime-parameter-field .el-date-editor, .runtime-parameter-field .el-input')]
          .map(el => el.getBoundingClientRect())
        return {
          above: label.bottom <= input.top,
          alignedLeft: Math.abs(label.left - input.left) < 2,
          alignedInputs: parameters.some(rect => Math.abs(rect.top - input.top) < 2),
          withinViewport: input.left >= 0 && input.right <= innerWidth + 1,
          inputHeight: input.height
        }
      }, periodSelector)
      assert.ok(layout.above && layout.alignedLeft && layout.withinViewport && layout.inputHeight >= 30, `${name} ${width}: ${JSON.stringify(layout)}`)
      if (width === 1440) assert.ok(layout.alignedInputs, `${name}: period and parameter inputs should align`)
      await panel.screenshot({ path: `${evidence}/${name}-${width}.png` })
    }
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log('Factor and indicator query period labels verified at 1440, 1024 and 390px')
} finally {
  await browser.close()
}
