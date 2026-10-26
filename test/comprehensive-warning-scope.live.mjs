import assert from 'node:assert/strict'
import { api, get, state, rows, check, run, reject, finish, save } from './comprehensive-client.mjs'

const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
const role = (await get('/system/roles')).find(item => item.role.roleKey === 'AUDITOR')
const businessDepartment = rows(await get('/meta/departments?search=16&size=200')).find(item => item.code === '16')
const department = (await get('/system/depts')).find(item => item.dept.orgCode === '16' || item.dept.deptName === businessDepartment?.name)
assert.ok(role && department)
const username = `audit_warning_${Date.now()}`, password = crypto.randomUUID()
const userId = await api('POST', '/system/users', { user: { userName: username, nickName: '全量验收呼吸科预警审计员', deptId: department.deptId, status: '0', sex: '2', roleIds: [role.roleId] }, password })
try {
const auditor = (await api('POST', '/auth/login', { username, password }, { token: '' })).accessToken
const mainRule = state.eventTest.rules.find(rule => rule.mode === 'MAIN')
const mainEvent = rows(await get(`/analysis/warnings?ruleId=${mainRule.id}&size=100`))[0]
for (const rule of state.eventTest.rules) await run(`预警${rule.mode}本科室范围`, async () => {
  await reject(`${rule.mode}无预警角色的科室分析员不能调用接口`, 'GET', `/analysis/warnings?ruleId=${rule.id}&size=100`, undefined, [403], { token: analyst })
  const hospital = rows(await get(`/analysis/warnings?ruleId=${rule.id}&size=100`))
  const scoped = rows(await get(`/analysis/warnings?ruleId=${rule.id}&size=100`, { token: auditor }))
  const expected = hospital.filter(event => String(event.comparisonContext?.dimensionSnapshot?.out_dept_code) === '16')
  check(`${rule.mode}本科室事件和管理员同范围完全一致`, scoped.length === expected.length && scoped.every(item => expected.some(event => event.id === item.id && event.actualValue === item.actualValue)), { expected: expected.length, actual: scoped.length })
  const foreign = hospital.find(event => !expected.some(item => item.id === event.id)) || mainEvent
  assert.ok(foreign)
  await reject(`${rule.mode}借用其他范围事件标识被拒绝`, 'GET', `/analysis/warnings/${foreign.id}`, undefined, [403, 404], { token: auditor })
  if (scoped.length) {
    const detail = await get(`/analysis/warnings/${scoped[0].id}`, { token: auditor })
    check('本科室事件详情保持原数值和维度', detail.actualValue === scoped[0].actualValue && String(detail.comparisonContext.dimensionSnapshot.out_dept_code) === '16', detail)
  } else check(`${rule.mode}不把总体或其他科室事件充作本科室事件`, !expected.length)
  await save(`预警${rule.mode}科室隔离`, { rule, scoped, expected })
})
} finally {
  await api('DELETE', `/system/users/${userId}`)
}
await finish('预警科室隔离', { persistState: false })
