import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const credentials = JSON.parse(await readFile(process.env.IDMP_ADMIN_CREDENTIAL_FILE || '.tmp/forced-login-admin-20261024.json', 'utf8'))
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const checks = [], errors = []
const folder = '.tmp/search-keyboard-live'
await mkdir(folder, { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/login`)
  await page.getByPlaceholder('请输入工号').fill(credentials.username)
  await page.locator('input[type=password]').fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/dashboard')
  for (const [path, selector, query] of [
    ['/analysis?indicator=102027642461902857', '.header-indicator-select', '住院'],
    ['/alerts', '.indicator-filter', '住院'],
    ['/system', '.el-select:has(#role-user)', '杜'],
    ['/factor/edit/new', '.el-select:has(input[aria-label="主物理表"])', 'vmq'],
    ['/factor/templates/new', '.el-select:has(input[aria-label="主物理表"])', 'vmq']
  ]) {
    await page.goto(`${origin}${path}`)
    const select = page.locator(selector)
    await select.waitFor()
    await page.waitForLoadState('networkidle')
    for (const keys of [[], ['ArrowDown'], ['ArrowDown', 'ArrowUp']]) {
      const input = select.locator('input').first()
      await input.fill(query)
      const items = page.locator('.el-select-dropdown:visible .el-select-dropdown__item:visible:not(.is-disabled)')
      await items.first().waitFor()
      await page.waitForFunction(() => !![...document.querySelectorAll('.el-select-dropdown .is-hovering')].find(item => item.getClientRects().length))
      const labels = await items.evaluateAll(items => items.map(item => (item.querySelector('.indicator-option > span') || item).textContent))
      const expected = labels[keys.length === 1 ? 1 % labels.length : 0].trim()
      assert.ok((await page.locator('.el-select-dropdown:visible .is-hovering').textContent()).includes(labels[0].trim()))
      for (const key of keys) await input.press(key)
      await input.press('Enter')
      await page.waitForFunction(({ selector, expected }) => [...document.querySelectorAll(`${selector} .el-select__selected-item:not(.is-transparent)`)].some(item => item.textContent.trim() === expected), { selector, expected })
      checks.push({ path, keys: [...keys, 'Enter'], selected: expected, passed: true })
      console.log(JSON.stringify(checks.at(-1)))
      await page.waitForLoadState('networkidle')
    }
    if (path === '/alerts') {
      const response = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/analysis/warnings') && new URL(response.url()).searchParams.has('indicatorVersionId'))
      await select.locator('input').first().press('Enter')
      const result = await response
      assert.equal(result.status(), 200)
      const params = new URL(result.url()).searchParams
      assert.ok(params.get('indicatorVersionId'))
      assert.equal(await select.locator('input').first().getAttribute('aria-expanded'), 'false')
      checks.push({ path, name: '选定指标版本后回车查询预警事件', passed: true })
      console.log(JSON.stringify(checks.at(-1)))
    }
  }
  await page.goto(`${origin}/indicator/edit/new`)
  const category = page.locator('.category-cascader input').first()
  await category.waitFor()
  await page.waitForLoadState('networkidle')
  await category.fill('质量')
  const active = page.locator('.el-cascader__suggestion-item.is-keyboard-active:visible')
  await active.waitFor()
  const expected = (await active.textContent()).trim()
  await category.press('Enter')
  assert.equal((await category.inputValue()).trim(), expected)
  checks.push({ path: '/indicator/edit/new', selected: expected, passed: true })
  console.log(JSON.stringify(checks.at(-1)))
  await page.screenshot({ path: `${folder}/classification.png` })
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${folder}/results.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
