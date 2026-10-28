import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || 'C:/Users/啾啾/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright')
const credentials = JSON.parse(await readFile(process.env.IDMP_ADMIN_CREDENTIAL_FILE || '.tmp/forced-login-admin-20261024.json', 'utf8'))
const origin = process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5176'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const checks = [], errors = []
const folder = '.tmp/query-enter-live'
await mkdir(folder, { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/login`)
  await page.getByPlaceholder('请输入工号').fill(credentials.username)
  await page.locator('input[type=password]').fill(credentials.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/dashboard')
  for (const [path, placeholder, terms] of [
    ['/indicator', '指标名称（模糊搜索）', ['住院', '手术', '不存在的查询验收名称']],
    ['/factor', '因子名称', ['住院', '手术', '不存在的查询验收名称']],
    ['/factor/templates', '模板名称', ['统计', '人数', '不存在的查询验收名称']],
    ['/scenarios', '场景名称', ['质量', '预警', '不存在的查询验收名称']],
    ['/policies', '政策文件名称', ['质量', '医疗', '不存在的查询验收名称']],
    ['/data/value-sets', '值集名称', ['科室', '性别', '不存在的查询验收名称']],
    ['/indicator/recycle-bin', '名称', ['测试', '验收', '不存在的查询验收名称']],
    ['/factor/recycle-bin', '名称', ['测试', '验收', '不存在的查询验收名称']]
  ]) {
    await page.goto(`${origin}${path}`)
    const input = page.getByPlaceholder(placeholder, { exact: true })
    await input.waitFor()
    await page.waitForLoadState('networkidle')
    const button = page.getByRole('button', { name: '查询', exact: true })
    await button.evaluate(element => {
      element.dataset.testClicks = '0'
      element.addEventListener('click', () => { element.dataset.testClicks = String(Number(element.dataset.testClicks) + 1) })
    })
    for (const term of terms) {
      await input.fill(term)
      const before = Number(await button.getAttribute('data-test-clicks'))
      const pending = ['/indicator', '/factor'].includes(path) ? null : page.waitForResponse(response => new URL(response.url()).searchParams.get('name') === term)
      await input.press('Enter')
      if (pending) assert.equal((await pending).status(), 200)
      await page.waitForLoadState('networkidle')
      await page.locator('.el-loading-mask:visible').waitFor({ state: 'hidden' })
      assert.equal(Number(await button.getAttribute('data-test-clicks')), before + 1, `${path}: Enter must click exactly once`)
      const enterRows = await page.locator('.el-table__body-wrapper tbody tr').allTextContents()
      if (term.startsWith('不存在')) assert.equal(enterRows.length, 0, `${path}: nonexistent filter must return no rows`)
      await button.click()
      await page.waitForLoadState('networkidle')
      await page.locator('.el-loading-mask:visible').waitFor({ state: 'hidden' })
      assert.deepEqual(await page.locator('.el-table__body-wrapper tbody tr').allTextContents(), enterRows, `${path}: mouse and keyboard results must match`)
      checks.push({ path, term, rows: enterRows.length, passed: true })
      console.log(JSON.stringify(checks.at(-1)))
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${folder}/results.json`, JSON.stringify({ checks, errors }, null, 2))
  await browser.close()
}
