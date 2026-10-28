import assert from 'node:assert/strict'
import { api, get, rows, state, checkpoint, check, run, sql, finish } from './comprehensive-client.mjs'

assert.match(state.tag || '', /^ALL_\d+$/)
const owned = new Map(), versions = new Set()
function own(type, item) {
  if (!item) return
  const id = item.resourceId || item.id
  assert.match(String(id), /^\d+$/)
  owned.set(`${type}/${id}`, { type, id })
  for (const version of [item.versionId, item.draftVersionId]) if (version) versions.add(String(version))
}
for (const item of state.indicators || []) own('indicators', item)
for (const item of [...state.factors || [], ...state.derivedFactors || [], state.runtimeFactor].filter(Boolean)) own('factors', item)
for (const item of state.resources || []) if (['indicators', 'factors'].includes(item.type)) own(item.type, item)
own('indicators', state.eventTest?.indicator)
for (const session of [...state.realSqlImports || [], ...state.groupedCteSessions || [], state.groupedCte].filter(Boolean)) {
  for (const item of session.resources || []) own(item.type === 'INDICATOR' ? 'indicators' : 'factors', item)
}

state.cleanup ||= { deleted: [], retained: [] }
async function allPages(path) {
  const result = []
  for (let page = 1; ; page++) {
    const data = await get(`${path}?page=${page}&size=100`), batch = rows(data)
    if (Array.isArray(data)) return data
    result.push(...batch)
    if (!batch.length || result.length >= Number(data.total)) return result
  }
}
const schedules = await allPages('/calc/schedules')
for (const schedule of schedules.filter(item => versions.has(String(item.ownerVersionId)) || item.scheduleCode.startsWith(state.tag))) await run(`停用本次计划${schedule.id}`, async () => {
  if (schedule.status === 'ACTIVE') await api('PATCH', `/calc/schedules/${schedule.id}/status`, { enabled: false })
  const stopped = await get(`/calc/schedules/${schedule.id}`)
  check(`本次计划${schedule.id}已暂停`, stopped.status === 'PAUSED' && stopped.nextTriggerAt === null)
})
for (const rule of (await allPages('/analysis/warning-rules')).filter(item => item.code.startsWith(state.tag))) await run(`停用本次预警规则${rule.id}`, async () => {
  const stopped = rule.enableStatus === 'DISABLED' ? rule : await api('POST', `/analysis/warning-rules/${rule.id}/disable`, { resourceVersion: rule.resourceVersion })
  check(`${rule.name}已停用`, stopped.enableStatus === 'DISABLED')
})
for (const board of state.testBoards || []) {
  const result = await api('GET', `/analysis/dashboards/${board.id}`, undefined, { allowError: true })
  check(`本次看板${board.id}已删除`, result.http === 404)
}

const ids = [...versions]
assert.ok(ids.length && ids.every(id => /^\d+$/.test(id)))
const activeQuery = `SELECT DISTINCT b.id,b.calculation_execution_status FROM job_calc_batch b JOIN job_calc_target t ON t.batch_id=b.id JOIN job_calc_node n ON n.calc_target_id=t.id WHERE n.business_version_id IN (${ids.join(',')}) AND b.calculation_execution_status IN ('CREATED','QUEUED','RUNNING','CANCELLING')`
const active = await sql('PLATFORM', activeQuery, ['id', 'status'])
// Batches may include shared dependencies; cancel only when every target owner is ours.
for (const batch of active) {
  const detail = await get(`/calc/batches/${batch.id}`)
  const owners = detail.targets.map(target => String(target.ownerVersionId || target.payload?.ownerVersionId || ''))
  assert.ok(owners.length && owners.every(id => versions.has(id)), `批次${batch.id}包含未归属本次账本的目标，停止清理`)
  if (batch.status !== 'CANCELLING') await api('POST', `/calc/batches/${batch.id}/cancel`, {})
}
check('本次验收没有运行中的计算批次', active.length === 0, active)

for (const item of [...owned.values()].filter(item => item.type === 'indicators').concat([...owned.values()].filter(item => item.type === 'factors').reverse())) await run(`清理${item.type}/${item.id}`, async () => {
  const impact = await api('GET', `/${item.type}/${item.id}/deletion-impact`, undefined, { allowError: true })
  if (impact.http === 404) {
    state.cleanup.deleted.push(item)
    return
  }
  assert.equal(impact.http, 200)
  const detail = impact.data
  if (!detail.deletable) {
    state.cleanup.retained = state.cleanup.retained.filter(saved => saved.id !== item.id)
    state.cleanup.retained.push({ ...item, name: detail.resourceName, blockers: detail.blockers })
    await checkpoint()
    return
  }
  await api('DELETE', `/${item.type}/${item.id}`, { resourceVersion: detail.resourceVersion, deleteReason: '本次真实业务验收完成，清理临时对象' })
  state.cleanup.deleted.push({ ...item, name: detail.resourceName })
  state.cleanup.retained = state.cleanup.retained.filter(saved => saved.id !== item.id)
  await checkpoint()
  const result = await api('GET', `/${item.type}/${item.id}`, undefined, { allowError: true })
  check(`资源${item.id}移入回收站`, result.http === 404 || result.data?.status === 'DELETED')
})
state.cleanup.deleted = [...new Map(state.cleanup.deleted.map(item => [`${item.type}/${item.id}`, item])).values()]
state.cleanup.completedAt = new Date().toISOString()
await checkpoint()
await finish('最终验收清理')
console.log(JSON.stringify({ 已移入回收站: state.cleanup.deleted.length, 引用保护保留: state.cleanup.retained.map(item => ({ id: item.id, name: item.name, blockers: item.blockers.map(blocker => blocker.code) })), 本次运行中批次: active.length }))
