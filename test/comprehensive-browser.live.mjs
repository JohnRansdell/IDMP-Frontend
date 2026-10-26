import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { admin, origin, state, rows, check, run, save, finish, folder, get } from './comprehensive-client.mjs'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = [], requests = [], pages = []
page.setDefaultTimeout(15000)
let current = ''
page.on('pageerror', error => errors.push({ route: current, message: error.message }))
page.on('response', response => {
  if (response.url().includes('/api/v1/')) requests.push({ route: current, status: response.status(), path: new URL(response.url()).pathname })
})
const inventory = state.inventory
const indicator = rows(inventory['/indicators']).find(item => item.status === 'PUBLISHED')
const factor = state.factors?.[0] || rows(inventory['/factors']).find(item => item.status === 'PUBLISHED')
const scenario = rows(inventory['/scenarios'])[0]
const mapping = rows(inventory['/mappings'])[0]
const valueSet = rows(inventory['/meta/value-sets'])[0]
const template = rows(inventory['/factor-templates'])[0]
const domain = rows(inventory['/meta/data-domains'])[0]
const templateDetail = template?.currentPublishedVersionId ? await get(`/factor-template-versions/${template.currentPublishedVersionId}`) : null
const paths = [
  ['看板管理', '/dashboard/manage'], ['质量安全看板', `/dashboard?id=${state.boardId || '1189225114584501123'}`],
  ['指标目录', '/indicator'], ['新增指标', '/indicator/edit/new'], ['指标详情', `/indicator/view/${indicator.id}`], ['指标编辑', `/indicator/edit/${indicator.id}`],
  ['指标分析', `/analysis?indicator=${indicator.id}&periodStart=2026-01-01&periodEnd=2026-03-31`], ['指标回收站', '/indicator/recycle-bin'], ['SQL导入', '/indicator/import/sql'],
  ['因子管理', '/factor'], ['新增因子', '/factor/edit/new'], ['因子详情', `/factor/view/${factor.id}`], ['因子编辑', `/factor/edit/${factor.id}`], ['因子回收站', '/factor/recycle-bin'],
  ['因子模板', '/factor/templates'], ['新建模板', '/factor/templates/new'],
  ...(templateDetail?.version ? [['模板编辑', `/factor/templates/${template.id}/versions/${templateDetail.version.id}`]] : []),
  ['场景管理', '/scenarios'], ['场景编辑', `/scenarios/${scenario.id}/edit`],
  ['指标映射', '/mapping'], ...(mapping ? [['映射详情', `/mapping/${mapping.id}`]] : []),
  ['预警中心', '/alerts'], ['计算任务', '/calc'], ['政策文件', '/policies'],
  ['数据源管理', '/data/sources'], ['数据域管理', '/data/domains'], ['数据域工作台', `/data/domains/${domain.id}`],
  ['值集管理', '/data/value-sets'], ['新建值集', '/data/value-sets/new'], ['值集详情', `/data/value-sets/${valueSet.id}`], ['系统管理', '/system']
]
try {
  for (const [name, path] of paths) for (const variant of ['首次进入', '刷新进入', '窄屏进入']) await run(`${name}${variant}`, async () => {
    current = `${name}${variant}`
    const before = errors.length, requestStart = requests.length
    await page.setViewportSize({ width: variant === '窄屏进入' ? 390 : 1440, height: variant === '窄屏进入' ? 844 : 1000 })
    const start = performance.now()
    if (variant === '刷新进入') await page.reload({ waitUntil: 'domcontentloaded' })
    else await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
    await page.locator('main').waitFor()
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
    const text = await page.locator('main').innerText()
    const failed = requests.slice(requestStart).filter(item => item.status >= 400)
    check(`${name}${variant}可访问且无运行异常`, !new URL(page.url()).pathname.match(/login|forbidden/) && errors.length === before, errors.slice(before))
    check(`${name}${variant}没有后台接口失败`, failed.length === 0, failed)
    check(`${name}${variant}无裸接口或异常栈提示`, !/org\.springframework|NullPointerException|SQLSyntaxErrorException|GET \/api\/v1/.test(text))
    pages.push({ name, variant, path, ms: Math.round(performance.now() - start), text: text.slice(0, 14000), failed })
    if (failed.length || errors.length !== before || variant === '窄屏进入' && ['系统管理', '预警中心', '因子详情', '质量安全看板'].includes(name)) await page.screenshot({ path: `${folder}/${name}${variant}.png`, fullPage: true })
  })
  const anonymous = await browser.newContext(), anon = await anonymous.newPage()
  for (const path of ['/dashboard', '/indicator/edit/new', '/system']) {
    await anon.goto(origin + path)
    await anon.waitForURL(url => url.pathname === '/login', { waitUntil: 'domcontentloaded' })
    check(`未登录不能访问${path}`, new URL(anon.url()).searchParams.get('redirect') === path)
  }
  await anonymous.close()
  assert.deepEqual(errors, [])
} finally {
  await save('全页面浏览器明细', { pages, errors, requests })
  await browser.close()
  await finish('全页面浏览器', { persistState: false })
}
