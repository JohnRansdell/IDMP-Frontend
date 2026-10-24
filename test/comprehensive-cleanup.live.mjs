import { state, rows, api, get, check, save, finish, reject } from './comprehensive-client.mjs'

// Only stop fixtures belonging to this audit; retain their definitions and history.
const versions = new Set([...(state.factors || []).map(item => item.draftVersionId), ...(state.indicators || []).map(item => item.versionId), state.eventTest?.indicator?.versionId].filter(Boolean))
const schedules = rows(await get('/calc/schedules')).filter(item => item.scheduleCode.startsWith(state.tag) || versions.has(item.ownerVersionId))
for (const item of schedules) {
  const stopped = item.status === 'PAUSED' ? item : await api('PATCH', `/calc/schedules/${item.id}/status`, { enabled: false })
  check(`${item.scheduleName}已暂停且无下次触发`, stopped.status === 'PAUSED' && stopped.nextTriggerAt === null)
}
const rules = rows(await get('/analysis/warning-rules?size=100')).filter(item => item.code.startsWith(state.tag))
for (const item of rules) {
  const stopped = item.enableStatus === 'DISABLED' ? item : await api('POST', `/analysis/warning-rules/${item.id}/disable`, { resourceVersion: item.resourceVersion })
  check(`${item.name}已停用`, stopped.enableStatus === 'DISABLED')
}
const users = rows(await get('/system/users'))
const temporary = users.filter(item => /^(audit_session_|audit_warning_|warn_|rbac_)/.test(item.user?.userName || item.userName))
check('本轮临时会话权限预警用户全部删除', !temporary.length, temporary.map(item => ({ id: item.userId, name: item.user?.nickName || item.nickName })))
for (const item of state.testBoards || []) await reject('隔离验收看板删除状态保留', 'GET', `/analysis/dashboards/${item.id}`, undefined, [404])
const analyst = await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })
const me = await get('/auth/me', { token: analyst.accessToken })
check('原真实工号仍可登录且角色未扩大', me.user.username === '300112' && me.roles.length === 1 && me.roles[0] === 'DEPARTMENT_ANALYST', { username: me.user.username, roles: me.roles })
await save('最终隔离资源状态', { schedules: schedules.map(item => ({ id: item.id, name: item.scheduleName })), rules: rules.map(item => ({ id: item.id, name: item.name })), retainedResources: state.resources })
await finish('最终隔离资源核验', { persistState: false })
