import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { api, get, rows, sql, close, check, run, save, finish, origin, folder } from './comprehensive-client.mjs'
const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE)('playwright')
const portal = 'http://127.0.0.1:5180'
const config = await (await fetch(`${portal}/test/config`)).json()
const launch = async mode => {
  const result = await fetch(`${portal}/test/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: portal }, body: JSON.stringify({ user: 'duqin', mode, baseUrl: config.integrationBaseUrl }) })
  assert.ok(result.ok)
  return (await result.json()).url
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  await run('真实签名看板科室数值与越权隔离', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const url = await launch('signed')
    await page.goto(url)
    await page.getByTestId('dashboard-canvas').waitFor({ timeout: 60000 })
    const token = await page.evaluate(() => sessionStorage.getItem('idmp_medical_access_token'))
    assert.ok(token)
    const options = { token }
    const board = await get(`/medical/dashboards/${config.dashboardId}`, options)
    const specs = [
      ['住院死亡率', 'dashboard-widget-1790681712300-4', '出院科室', (s, e) => `SELECT SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_dept_code='15' AND out_date>='${s}' AND out_date<'${e}'`],
      ['中药费用占比', 'dashboard-widget-1791875881995-2', '科室', (s, e) => `SELECT SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost) FROM vmq_basicinformationba WHERE out_dept_code='15' AND out_date>='${s}' AND out_date<'${e}'`],
      ['转科比例', 'dashboard-widget-1791798674947-4', 'OUT_DEPT_CODE', (s, e) => `SELECT COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.out_dept_code='15' AND b.in_date>='${s}' AND b.in_date<'${e}'`]
    ]
    for (const [start, end] of [['2026-01-01', '2026-02-01'], ['2026-02-01', '2026-03-01'], ['2026-03-01', '2026-04-01']]) {
      for (const [name, code, field, oracle] of specs) {
        const path = `/medical/dashboards/${config.dashboardId}`
        const payload = { periodStart: start, periodEnd: end, granularity: 'MONTHLY', widgetCodes: [code] }
        const result = await api('POST', `${path}/query`, payload, options)
        const widget = result.data.widgets[code], expected = (await sql('SOURCE', oracle(start, end), ['n', 'd']))[0]
        const codeOf = row => row[field] ?? row.out_dept_code ?? row.drillContext?.parentKeys?.[field]
        check(`${name}${start}只返回骨科一行`, widget.status === 'READY' && widget.rows.length === 1 && String(codeOf(widget.rows[0])) === '15', { status: widget.status, message: widget.message, rows: widget.rows.length })
        assert.equal(widget.status, 'READY', widget.message)
        const row = widget.rows[0]
        check(`${name}${start}分子分母与骨科源表一致`, close(row.numeratorValue, expected.n, .011) && close(row.denominatorValue, expected.d, .011) && (!Number(expected.d) || close(row.value, Number(expected.n) / Number(expected.d))), { row, expected })
        const members = await api('POST', `${path}/widgets/${code}/filter-options`, { fieldCode: field, periodStart: start, periodEnd: end, filters: {}, limit: 100 }, options)
        check(`${name}${start}科室选项不泄露其他科室`, members.length === 1 && members[0].value === '15', members)
        const forged = await api('POST', `${path}/query`, { ...payload, filters: { [field]: ['16'] } }, options)
        check(`${name}${start}篡改科室拒绝而非返回全院`, forged.data.widgets[code].status === 'FORBIDDEN' && !forged.data.widgets[code].rows.length)
        if (row.drillContext) {
          const { pathCode, ...context } = row.drillContext
          const drill = { ...context, drillTicket: result.drillTicket, pageNum: 1, pageSize: 200 }
          const actual = await api('POST', `${path}/drill`, drill, options)
          check(`${name}${start}下钻父科室汇总数值一致`, actual.records.length > 0 && close(actual.summary.indicatorValue, row.value) && close(actual.summary.numeratorValue, expected.n, .011) && close(actual.summary.denominatorValue, expected.d, .011), actual.summary)
          const rejected = await api('POST', `${path}/drill`, { ...drill, snapshotId: String(BigInt(context.snapshotId) + 1n) }, { ...options, allowError: true })
          check(`${name}${start}伪造下钻快照被拒绝`, rejected.http === 403, rejected.message)
        }
      }
    }
    const entry = new URL(url)
    const params = Object.fromEntries(new URL(entry.searchParams.get('redirect') || url, origin).searchParams)
    assert.ok(params.dashboardID && params.doctorNo && params.deptCode && params.sign)
    for (const altered of [{ deptCode: '16' }, { doctorNo: '300113' }, { sign: '0'.repeat(64) }]) {
      const result = await api('POST', '/medical/dashboard-access/exchange', { dashboardID: params.dashboardID, doctorNo: params.doctorNo, deptCode: params.deptCode, sign: params.sign, ...altered }, { ...options, allowError: true })
      check('签名或身份被篡改不能换取看板权限', result.http === 403, result.message)
    }
    for (const value of ['无效凭据', 'a.b.c', 'expired-token']) {
      const result = await api('POST', '/auth/sso/exchange', { token: value }, { token: '', allowError: true })
      check('外部无效凭据不会默认放行', result.http === 401 || result.http === 403, result.message)
    }
    check('看板配置仍是原真实十二组件', board.version.widgets.length === 12)
    await page.screenshot({ path: `${folder}/杜琴签名看板.png`, fullPage: true })
    await page.close()
  })
  await run('同一标签页反复切换管理员与杜琴不串科室缓存', async () => {
    const credentials = JSON.parse(await readFile('.tmp/forced-login-admin-20261024.json', 'utf8'))
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const snapshots = []
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const account of ['管理员', '杜琴']) {
        if (account === '管理员') {
          await page.goto(`${origin}/login`)
          await page.getByLabel('工号', { exact: true }).fill(credentials.username)
          await page.getByLabel('密码', { exact: true }).fill(credentials.password)
          await page.getByRole('button', { name: '登录', exact: true }).click()
          await page.waitForURL('**/dashboard')
        } else {
          await page.goto(await launch('catalog'))
          await page.waitForURL(`${origin}/dashboard`, { timeout: 60000 })
        }
        await page.goto(`${origin}/dashboard?id=${config.dashboardId}`)
        await page.getByTestId('dashboard-canvas').waitFor({ timeout: 60000 })
        await page.waitForFunction(() => {
          const c = document.querySelector('.dashboard-page')?.__vueParentComponent
          let p = c
          while (p && p.type.__name !== 'Dashboard') p = p.parent
          return p && Object.values(p.setupState.remoteFilterOptionsLoading || {}).every(value => !value)
        }, undefined, { timeout: 60000 }).catch(() => page.waitForLoadState('networkidle'))
        const filters = await page.getByTestId('dashboard-filter-bar').evaluate(node => {
          let p = node.__vueParentComponent
          while (p && p.type.__name !== 'Dashboard') p = p.parent
          return JSON.parse(JSON.stringify({ options: p.setupState.filterOptionsById, definitions: p.setupState.globalFilterDefinitions }))
        })
        const definition = filters.definitions.find(item => item.label === '科室')
        assert.ok(definition, JSON.stringify(filters.definitions))
        const values = filters.options[definition.id] || []
        check(`第${cycle + 1}轮${account}科室范围不继承前账号`, account === '管理员' ? values.length > 1 : values.length === 1 && String(values[0].value) === '15', values)
        snapshots.push({ account, count: values.length, labels: values.map(v => v.label) })
        await page.getByRole('button', { name: '退出登录', exact: true }).click()
        await page.waitForURL('**/login')
      }
    }
    await save('跨账号科室缓存明细', snapshots)
    await page.close()
  })
} finally {
  await browser.close()
  await finish('真实单点登录与跨账号缓存', { persistState: false })
}
