import assert from 'node:assert/strict'
import { api, get, rows, state, save, checkpoint, check, run, reject, sql, close, poll, finish } from './comprehensive-client.mjs'

const tag = `${state.tag}_EVENT`, mode = process.argv[2] || '触发'
if (mode === '非法范围复测') {
  const scopes = [{ mode: 'GROUPED', targetCode: '不存在的目标', dimensions: ['OUT_DEPT_CODE'] },
    { mode: 'GROUPED', targetCode: 'BASE', dimensions: ['不存在的维度'] },
    { mode: 'GROUPED', targetCode: 'BASE', dimensions: ['OUT_DEPT_CODE'] }]
  for (const [index, scope] of scopes.entries()) {
    const payload = { code: `${tag}_BAD${index}`, name: `全量验收非法范围回归${index + 1}`, warningType: 'THRESHOLD', indicatorVersionId: '102027642461313071', periodType: 'MONTHLY', severity: 'LOW', condition: { operator: 'GT', threshold: '0' }, scopePolicy: { resultScope: scope }, notificationPolicy: { channels: ['IN_APP'], recipientUsernames: ['300112'] }, effectiveStartDate: '2099-01-01' }
    await reject(`非法分组范围${index + 1}创建被拒绝`, 'POST', '/analysis/warning-rules', payload, [400])
    const old = rows(await get(`/analysis/warning-rules?code=${state.tag}_INVALID_SCOPE${index}`)).find(r => r.code === `${state.tag}_INVALID_SCOPE${index}`)
    await reject(`历史非法范围${index + 1}不能直接发布`, 'POST', `/analysis/warning-rule-versions/${old.version.id}/publish`, { resourceVersion: old.version.resourceVersion }, [400])
    await reject(`历史非法范围${index + 1}不能再次保存`, 'PATCH', `/analysis/warning-rule-versions/${old.version.id}`, { ...payload, resourceVersion: old.version.resourceVersion }, [400])
    check(`历史非法范围${index + 1}保持草稿且禁用`, (await get(`/analysis/warning-rules/${old.id}`)).enableStatus === 'DISABLED')
  }
}

if (mode === '触发') await run('真实预警评估及通知闭环', async () => {
  const roles = await get('/system/roles'), role = roles.find(item => item.role.roleKey === 'QUALITY_ADMIN')
  const username = `warn_${Date.now()}`, password = `验收密码_${crypto.randomUUID()}`
  const userId = await api('POST', '/system/users', { user: { userName: username, nickName: '全量验收临时预警接收人', deptId: 2, sex: '2', status: '0', roleIds: [role.roleId] }, password })
  const recipient = (await api('POST', '/auth/login', { username, password }, { token: '' })).accessToken
  state.eventTest ||= { rules: [] }; state.eventTest.userId = userId
  state.eventTest.rules = []; state.eventTest.round = (state.eventTest.round || 0) + 1
  const attempt = `${tag}_${state.eventTest.round}`; await checkpoint()
  try {
    const sourceVersion = await get('/indicator-versions/102027642460761114')
    const indicator = state.eventTest.indicator || await api('POST', '/indicators', { code: `${tag}_I`, name: '全量验收预警闭环住院死亡率', category: 'QUALITY', unit: '%' })
    const version = indicator.versionId ? await get(`/indicator-versions/${indicator.versionId}`) : await api('POST', `/indicators/${indicator.id}/versions`, { formula: sourceVersion.formula, dimensionGrain: [], drillPaths: sourceVersion.drillConfig.drillPaths, dataOwnership: { mode: 'DEPARTMENT', departmentFieldCode: 'OUT_DEPT_CODE' } })
    state.eventTest.indicator = { ...indicator, versionId: version.id }; await checkpoint()
    const query = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters: {} }
    if (version.status !== 'PUBLISHED') {
      const compiled = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
      assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status))
      const trial = await api('POST', `/indicator-versions/${version.id}/trial`, query); await poll(`/async-tasks/${trial.taskId}`)
    }
    const publication = state.eventTest.publication || await api('POST', `/indicator-versions/${version.id}/publish`, {})
    state.eventTest.publication = publication; await checkpoint()
    for (const scheduleId of publication.incrementalScheduleIds || publication.scheduleIds || []) await api('PATCH', `/calc/schedules/${scheduleId}/status`, { enabled: false })
    const schedules = rows(await get('/calc/schedules')).filter(s => s.ownerVersionId === version.id)
    for (const schedule of schedules) if (schedule.status !== 'PAUSED') await api('PATCH', `/calc/schedules/${schedule.id}/status`, { enabled: false })
    const options = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${version.id}`)
    const department = options.find(o => o.targetCode.endsWith(':OUT_DEPT'))
    assert.ok(department)
    const scopeCases = [{ mode: 'MAIN' }, { mode: 'GROUPED', targetCode: department.targetCode, dimensions: department.dimensions, members: { OUT_DEPT_CODE: ['16'] } }, { mode: 'ALL' }]
    for (const [index, scope] of scopeCases.entries()) {
      const condition = { logic: 'OR', children: [{ logic: 'AND', children: [{ operator: 'GT', threshold: '0' }, { logic: 'NOT', children: [{ operator: 'GTE', threshold: '1' }] }] }, { operator: 'EQ', threshold: '0.25' }] }
      let rule = await api('POST', '/analysis/warning-rules', { code: `${attempt}_R${index}`, name: `全量验收${['总体', '呼吸科分组', '全部'][index]}死亡率预警`, warningType: 'THRESHOLD', indicatorVersionId: version.id, periodType: 'MONTHLY', severity: ['LOW', 'HIGH', 'CRITICAL'][index], scopePolicy: { includeNoScenario: true, resultScope: scope }, condition, notificationPolicy: { channels: ['IN_APP'], recipientUsernames: [username] }, effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-01-31' })
      rule = await api('POST', `/analysis/warning-rule-versions/${rule.version.id}/publish`, { resourceVersion: rule.version.resourceVersion })
      rule = await api('POST', `/analysis/warning-rules/${rule.id}/enable`, { resourceVersion: rule.resourceVersion })
      state.eventTest.rules.push({ id: rule.id, mode: scope.mode }); await checkpoint()
    }
    const command = { ownerType: 'INDICATOR', ownerVersionId: version.id, batchType: 'FULL', periodType: 'MONTHLY', periodStart: query.periodStart, periodEnd: query.periodEnd }
    const formal = await api('POST', '/calc/batches', command, { headers: { 'X-Idempotency-Key': `${attempt}_FORMAL` } })
    await poll(`/async-tasks/${formal.taskId}`, ['SUCCEEDED'], 240000)
    const dbResults = await sql('PLATFORM', `SELECT r.id,JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.targetCode')),r.dimension_snapshot_json,r.result_value,r.numerator_value,r.denominator_value FROM rsl_indicator_result r JOIN job_calc_target t ON t.id=r.calc_target_id WHERE r.indicator_version_id=${version.id} AND t.batch_id=${formal.batchId} AND r.result_outcome_status='CALCULATED'`, ['id', 'target', 'dimensions', 'value', 'numerator', 'denominator'])
    const source = (await sql('SOURCE', "SELECT SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'", ['numerator', 'denominator']))[0]
    const main = dbResults.find(r => Object.keys(JSON.parse(r.dimensions)).length === 0)
    check('总体正式结果分子分母与源表一致', main && close(main.numerator, source.numerator) && close(main.denominator, source.denominator) && close(main.value, Number(source.numerator) / Number(source.denominator)), { main, source })
    for (const rule of state.eventTest.rules) {
      const deadline = Date.now() + 60000
      let events
      do {
        events = await get(`/analysis/warnings?ruleId=${rule.id}&page=1&size=100`)
        if (rows(events).length) break
        await new Promise(resolve => setTimeout(resolve, 500))
      } while (Date.now() < deadline)
      const allEvents = [...rows(events)]
      for (let page = 2; allEvents.length < Number(events.total); page++) {
        const next = rows(await get(`/analysis/warnings?ruleId=${rule.id}&page=${page}&size=100`))
        assert.ok(next.length, '预警事件分页不能提前结束')
        allEvents.push(...next)
      }
      const expected = dbResults.filter(row => {
        const d = JSON.parse(row.dimensions), value = Number(row.value)
        return ((value > 0 && value < 1) || value === 0.25) && (rule.mode === 'ALL' || (rule.mode === 'MAIN' ? Object.keys(d).length === 0 : row.target === department.targetCode && d.out_dept_code === '16'))
      })
      const own = allEvents.filter(event => dbResults.some(r => r.id === event.indicatorResultId))
      check(`${rule.mode}命中数量和全部匹配结果一一对应`, own.length === expected.length && own.every(e => expected.some(r => r.id === e.indicatorResultId)), { expected: expected.length, actual: own.length, total: events.total })
      for (const event of own) {
        const original = expected.find(r => r.id === event.indicatorResultId)
        assert.ok(original, '事件必须对应本次预期命中的计算结果')
        check(`${rule.mode}事件值维度周期均与触发结果一致`, close(event.actualValue, original.value) && event.periodStart?.startsWith('2026-01-01') && event.periodEnd?.startsWith('2026-02-01'), event)
        assert.deepEqual(event.comparisonContext.dimensionSnapshot, JSON.parse(original.dimensions))
      }
      const event = own[0]; assert.ok(event)
      const ack = await api('POST', `/analysis/warnings/${event.id}/acknowledge`, {})
      check(`${rule.mode}确认事件状态正确`, ack.status === 'ACKNOWLEDGED')
      await reject(`${rule.mode}重复确认不可覆盖操作人`, 'POST', `/analysis/warnings/${event.id}/acknowledge`, {}, [409])
      await reject(`${rule.mode}关闭不能缺少原因`, 'POST', `/analysis/warnings/${event.id}/close`, { reasonCode: '' })
      const closed = await api('POST', `/analysis/warnings/${event.id}/close`, { reasonCode: '全量验收已核实' })
      check(`${rule.mode}关闭原因和终态保留`, closed.status === 'CLOSED' && closed.closeReasonCode === '全量验收已核实', closed)
      await save(`预警${rule.mode}事件`, { events, expected, closed })
    }
    const notificationDeadline = Date.now() + 60000
    let inbox
    do {
      inbox = await get('/me/notifications?size=100', { token: recipient })
      if (rows(inbox).length >= state.eventTest.rules.length) break
      await new Promise(resolve => setTimeout(resolve, 500))
    } while (Date.now() < notificationDeadline)
    check('真实站内通知只发送给隔离接收用户', rows(inbox).length >= 3, inbox)
    const first = rows(inbox)[0]
    assert.ok(first)
    const read = await api('POST', `/me/notifications/${first.id}/read`, {}, { token: recipient })
    check('单条已读状态正确', read.notificationStatus === 'READ' && Boolean(read.readAt), read)
    const stranger = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
    await reject('其他用户不能读取本次通知', 'POST', `/me/notifications/${first.id}/read`, {}, [403, 404], { token: stranger })
    await api('POST', '/me/notifications/read-all', {}, { token: recipient })
    check('全部已读后未读数量归零', (await get('/me/notifications/unread-count', { token: recipient })).unreadCount === 0)
    const replay = await api('POST', '/calc/batches', command, { headers: { 'X-Idempotency-Key': `${attempt}_FORMAL` } })
    check('重放正式计算不生成重复批次', replay.batchId === formal.batchId)
    await save('预警触发源数据及通知', { formal, dbResults, source, inbox })
  } finally {
    for (const saved of state.eventTest.rules) {
      const rule = await get(`/analysis/warning-rules/${saved.id}`)
      if (rule.enableStatus === 'ENABLED') await api('POST', `/analysis/warning-rules/${saved.id}/disable`, { resourceVersion: rule.resourceVersion })
    }
    await api('DELETE', `/system/users/${userId}`)
    state.eventTest.userDeleted = true; await checkpoint()
  }
})
await finish(mode)
