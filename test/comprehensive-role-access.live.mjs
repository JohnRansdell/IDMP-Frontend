import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, get, rows, state, check, run, reject, save, finish, origin, folder, close } from './comprehensive-client.mjs'
import { canVisit, firstAccessiblePath } from '../src/idmp/auth/permissions.js'

const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
const roles = rows(await get('/system/roles')), depts = rows(await get('/system/depts'))
const businessDepartment = rows(await get('/meta/departments?search=16&size=200')).find(item => item.code === '16')
const department = depts.find(item => item.dept.orgCode === '16' || item.dept.deptName === businessDepartment?.name)
assert.ok(department)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const snapshots = [], errors = []
const round = Date.now()
try {
  for (const roleKey of ['DATA_ADMIN', 'INDICATOR_ADMIN', 'QUALITY_ADMIN', 'SCHEDULER', 'DEPARTMENT_ANALYST', 'AUDITOR']) await run(`${roleKey}真实权限`, async () => {
    const role = roles.find(item => item.role.roleKey === roleKey)
    const username = `audit_role_${round}_${role.roleId}`, password = crypto.randomUUID()
    const userId = await api('POST', '/system/users', { user: { userName: username, nickName: `真实权限验收${role.role.roleName}`, deptId: department.deptId, status: '0', sex: '2', roleIds: [role.roleId] }, password })
    let context
    try {
      const login = await api('POST', '/auth/login', { username, password }, { token: '' }), token = login.accessToken
      const me = await get('/auth/me', { token })
      check(`${role.role.roleName}登录未增加其他角色`, me.roles.length === 1 && me.roles[0] === roleKey, me.roles)
      await reject(`${role.role.roleName}不能访问系统用户管理`, 'GET', '/system/users', undefined, [403], { token })
      const scoped = !roleKey.endsWith('_ADMIN')
      const payload = { periodStart: '2026-01-01', periodEnd: '2026-02-01', granularity: 'MONTHLY', responseFormat: 'FULL', widgetCodes: ['dashboard-widget-1790681712300-4'] }
      const result = await api('POST', `/analysis/dashboards/${state.boardId}/query`, payload, { token, allowError: true })
      if (result.http === 403) check(`${role.role.roleName}未获看板权限时明确拒绝`, !canVisit(me, '/dashboard'))
      else {
        assert.equal(result.http, 200, result.message)
        const widget = result.data.widgets[payload.widgetCodes[0]]
        assert.equal(widget.status, 'READY', widget.message)
        check(`${role.role.roleName}数据范围符合管理员或本科室策略`, scoped
          ? widget.rows.length === 1 && close(widget.rows[0].numeratorValue, 1) && close(widget.rows[0].denominatorValue, 429)
          : widget.rows.length > 1, { count: widget.rows.length, scoped })
      }
      context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      await context.addInitScript(token => localStorage.setItem('idmp_access_token', token), token)
      const page = await context.newPage()
      page.on('pageerror', error => errors.push({ roleKey, message: error.message }))
      await page.goto(origin + '/dashboard')
      await page.locator('main').waitFor()
      await page.waitForLoadState('networkidle')
      check(`${role.role.roleName}侧栏不展示系统管理入口`, !await page.locator('aside a[href="/system"]').count())
      const routes = ['/system', '/indicator/edit/new', '/dashboard/manage']
      for (const path of routes) {
        await page.goto(origin + path)
        await page.locator('main').waitFor()
        await page.waitForLoadState('networkidle')
        check(`${role.role.roleName}${path}直接地址与权限一致`, canVisit(me, path) ? new URL(page.url()).pathname === path : new URL(page.url()).pathname !== path, { actual: new URL(page.url()).pathname })
      }
      const menuPaths = await page.locator('aside a').evaluateAll(nodes => nodes.map(node => new URL(node.href).pathname))
      check(`${role.role.roleName}所有可见菜单均可访问`, menuPaths.every(path => canVisit(me, path)), menuPaths)
      await page.locator('.idmp-brand').click()
      await page.waitForURL(url => url.pathname === firstAccessiblePath(me))
      await page.waitForLoadState('networkidle')
      check(`${role.role.roleName}品牌链接返回有权访问的首页`, new URL(page.url()).pathname === firstAccessiblePath(me), { actual: new URL(page.url()).pathname, expected: firstAccessiblePath(me) })
      snapshots.push({ roleKey, username, roles: me.roles, menuPaths, dashboardStatus: result.http })
      await page.screenshot({ path: `${folder}/真实权限${role.role.roleName}.png`, fullPage: true })
    } finally {
      await context?.close()
      await api('DELETE', `/system/users/${userId}`)
    }
  })
  for (const [label, body, expected] of [['空凭证', { token: '', entry: 'PLATFORM' }, [400]], ['伪造凭证', { token: '本轮伪造单点登录凭证', entry: 'PLATFORM' }, [401]], ['无效入口', { token: '本轮伪造单点登录凭证', entry: 'INVALID' }, [400]]])
    await reject(`单点登录${label}不默认放行`, 'POST', '/auth/sso/exchange', body, expected, { token: '' })
  check('角色页面无运行异常', errors.length === 0, errors)
} finally {
  await save('真实角色权限明细', { snapshots, errors })
  await browser.close()
  await finish('真实角色权限', { persistState: false })
}
