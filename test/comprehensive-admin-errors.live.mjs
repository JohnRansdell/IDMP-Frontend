import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, get, state, admin, rows, check, run, save, finish, origin, folder } from './comprehensive-client.mjs'
import { parseJsonPreservingLargeIntegers as parse, createApiError } from '../src/idmp/api/request.js'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE)('playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), admin)
const page = await context.newPage(), errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  const roles = await get('/system/roles')
  for (const [index, key, department] of [[0, 'SYSTEM_ADMIN', null], [1, 'DEPARTMENT_ANALYST', '骨科'], [2, 'AUDITOR', '呼吸']]) await run(`页面创建${key}及登录验证`, async () => {
    const role = roles.find(item => item.role.roleKey === key)
    assert.ok(role)
    const username = `audit_ui_${Date.now()}_${index}`, password = crypto.randomUUID(), name = ['真实业务验收临时系统管理员', '真实业务验收临时骨科分析员', '真实业务验收临时呼吸科审计员'][index]
    let id
    try {
      await page.goto(`${origin}/system`)
      await page.getByRole('button', { name: '创建用户', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '创建用户', exact: true })
      await dialog.getByLabel('工号', { exact: true }).fill(username)
      await dialog.getByLabel('姓名', { exact: true }).fill(name)
      await dialog.getByLabel('初始密码', { exact: true }).fill(password)
      await dialog.getByLabel('确认密码', { exact: true }).fill('不一致密码')
      await dialog.getByRole('button', { name: '创建用户', exact: true }).click()
      await dialog.getByText('两次输入的密码不一致', { exact: true }).waitFor()
      check(`${name}确认密码错误阻止提交`, true)
      await dialog.getByLabel('确认密码', { exact: true }).fill(password)
      await dialog.getByRole('combobox', { name: '角色', exact: true }).click()
      await page.getByRole('option', { name: role.role.roleName, exact: true }).click()
      await page.keyboard.press('Escape')
      if (department) {
        const select = dialog.getByRole('combobox', { name: '所属科室', exact: true })
        await select.fill(department)
        await page.getByRole('option').filter({ hasText: department }).first().click()
      }
      const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/system/users')
      await dialog.getByRole('button', { name: '创建用户', exact: true }).click()
      const received = await response, result = parse(await received.text())
      assert.equal(received.status(), 200, result.message)
      id = result.data
      check(`${name}页面创建完成且自动刷新列表`, Boolean(id))
      await dialog.waitFor({ state: 'hidden' })
      await page.getByRole('cell', { name, exact: true }).waitFor()
      const detail = await get(`/system/users/${id}`)
      check(`${name}角色姓名科室持久化正确`, detail.user.nickName === name && detail.user.roleIds.map(String).includes(String(role.roleId)) && (!department || detail.user.deptId != null), { name: detail.user.nickName, roleIds: detail.user.roleIds, deptId: detail.user.deptId })
      const login = await api('POST', '/auth/login', { username, password }, { token: '' })
      const me = await get('/auth/me', { token: login.accessToken })
      check(`${name}新账号可登录且只获得指定角色`, me.roles.includes(key) && me.roles.length === 1 && (key === 'SYSTEM_ADMIN' || !me.roles.includes('SYSTEM_ADMIN')), me.roles)
      await page.screenshot({ path: `${folder}/创建用户${index}.png` })
    } finally { if (id) await api('DELETE', `/system/users/${id}`) }
  })
  for (const periodType of ['MONTHLY', 'QUARTERLY', 'YEARLY']) await run(`${periodType}重复计划真实错误`, async () => {
    const schedule = state.liveSchedules.find(item => item.periodType === periodType)
    assert.ok(schedule)
    const result = await api('POST', '/calc/schedules', { ...schedule, enabled: false }, { allowError: true })
    check(`${periodType}重复计划是冲突而非服务故障`, result.http === 409 && result.message.includes('计算计划编码已存在'), result.message)
    const rendered = createApiError(result.http, result).message
    check(`${periodType}前端保持业务冲突含义`, rendered.includes('计算计划编码已存在') && !rendered.includes('服务暂时'), rendered)
  })
  for (const feature of ['预警事件', '计算批次', '因子查询']) for (const [status, message, expected] of [
    [400, '查询条件填写不完整，请检查后重试', '查询条件填写不完整'],
    [403, '当前账号无权查看此数据范围', '无权查看此数据范围'],
    [502, '<html><body>Bad Gateway nginx upstream /api/v1/private</body></html>', '服务暂时不可用']
  ]) await run(`${feature}${status}错误展示`, async () => {
    const path = feature === '预警事件' ? '/api/v1/analysis/warnings' : feature === '计算批次' ? '/api/v1/calc/batches/99999999' : `/api/v1/factor-versions/${state.runtimeFactor.draftVersionId}/query`
    await page.route(url => url.pathname === path, route => route.fulfill({ status, contentType: status === 502 ? 'text/html' : 'application/json', body: status === 502 ? message : JSON.stringify({ code: `COMMON-${status}00`, message }) }))
    try {
      await page.goto(feature === '预警事件' ? `${origin}/alerts` : feature === '计算批次' ? `${origin}/calc?batchId=99999999` : `${origin}/factor/view/${state.runtimeFactor.id}?factorVersionId=${state.runtimeFactor.draftVersionId}`)
      if (feature === '因子查询') {
        const section = page.locator('.runtime-query')
        await section.getByRole('button', { name: '查询', exact: true }).waitFor({ state: 'visible' })
        await page.waitForFunction(() => !document.querySelector('.runtime-query .query-actions button')?.disabled)
        await section.getByRole('button', { name: '查询', exact: true }).click()
      }
      await page.getByText(expected, { exact: false }).first().waitFor({ timeout: 20000 })
      const text = await page.locator('body').innerText()
      check(`${feature}${status}提示匹配错误原因且不泄露技术细节`, text.includes(expected) && !/Bad Gateway|nginx|upstream|HTTP 502|Exception|\/api\/v1\/private/.test(text))
      await save(`${feature}${status}错误页面`, { status, text })
    } finally { await page.unroute(url => url.pathname === path) }
  })
  check('用户创建及错误展示没有页面运行异常', errors.length === 0, errors)
} finally {
  await browser.close()
  await finish('管理员创建用户与错误展示', { persistState: false })
}
