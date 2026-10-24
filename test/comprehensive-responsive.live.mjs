import { createRequire } from 'node:module'
import { admin, origin, check, run, folder, save, finish } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ reducedMotion: 'reduce' })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = [], snapshots = []
page.setDefaultTimeout(10000)
page.on('pageerror', error => errors.push(error.message))
try {
  for (const [name, width] of [['手机', 390], ['平板', 768], ['桌面', 1440]]) await run(`${name}预警中心筛选与表格`, async () => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/alerts`)
    await page.waitForLoadState('networkidle')
    for (const tab of ['预警事件', '预警规则']) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      const panel = page.getByRole('tabpanel', { name: tab, exact: true })
      const geometry = await panel.evaluate(node => {
        const rect = node.getBoundingClientRect(), form = node.querySelector('.filter-card'), box = form.getBoundingClientRect()
        return { panel: { left: rect.left, right: rect.right, width: rect.width }, controls: [...form.querySelectorAll('.el-form-item')].map(item => { const r = item.getBoundingClientRect(); return { text: item.innerText, left: r.left, right: r.right } }), form: { left: box.left, right: box.right }, table: { width: node.querySelector('.table-card')?.clientWidth, contentWidth: node.querySelector('.table-card')?.scrollWidth } }
      })
      check(`${name}${tab}筛选控件未超出可见画布`, geometry.panel.right <= width + 1 && geometry.controls.every(item => item.left >= geometry.form.left && item.right <= geometry.form.right + 1), geometry)
      const selectControl = page.locator('.el-select').filter({ has: page.getByRole('combobox', { name: tab === '预警事件' ? '事件级别' : '规则是否启用' }) })
      await selectControl.click()
      await page.getByRole('option', { name: tab === '预警事件' ? '严重' : '已启用', exact: true }).click()
      check(`${name}${tab}选中项完整显示`, (await selectControl.innerText()).includes(tab === '预警事件' ? '严重' : '已启用'))
      await panel.getByRole('button', { name: '重置', exact: true }).click()
      await panel.locator('.el-loading-mask').waitFor({ state: 'hidden' })
      snapshots.push({ name, tab, geometry })
      await page.screenshot({ path: `${folder}/${name}${tab}自适应.png`, fullPage: true })
    }
  })
  check('自适应布局页面无运行异常', !errors.length, errors)
} finally {
  await save('预警自适应布局明细', { snapshots, errors })
  await browser.close()
  await finish('预警自适应布局', { persistState: false })
}
