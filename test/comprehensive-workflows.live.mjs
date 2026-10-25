import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { api, get, rows, state, save, checkpoint, check, run, reject, sql, close, finish, poll, fixtureName } from './comprehensive-client.mjs'

const mode = process.argv[2], tag = `${state.tag}_EXT`
if (mode === '映射') for (let index = 0; index < 3; index++) await run(`指标映射完整审核${index + 1}`, async () => {
  const source = state.indicators[index], template = await get(`/indicator-versions/${state.indicators[(index + 1) % 3].versionId}`)
  const indicator = rows(await get(`/indicators?code=${tag}_MT${index}&size=100`)).find(i => i.code === `${tag}_MT${index}`) || await api('POST', '/indicators', { code: `${tag}_MT${index}`, name: `全量验收独立映射目标${index + 1}`, category: 'QUALITY' })
  const versions = rows(await get(`/indicators/${indicator.id}/versions`))
  const version = versions[0] || await api('POST', `/indicators/${indicator.id}/versions`, { calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [], formula: template.formula })
  if (version.status !== 'PUBLISHED') {
    const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
    assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status))
    const trial = await api('POST', `/indicator-versions/${version.id}/trial`, { parameters: {} })
    await poll(`/async-tasks/${trial.taskId}`)
    await api('POST', `/indicator-versions/${version.id}/publish`, {})
  }
  const target = { ...indicator, versionId: version.id }
  const policy = await get(`/meta/policy-files/${state.policies[index].id}`)
  if (!rows(await get(`/mappings/indicator-versions/${version.id}/policy-references`)).length)
    await api('POST', `/mappings/indicator-versions/${version.id}/policy-references`, { policyFileVersionId: policy.policyFile.currentPublishedVersionId, relationRole: 'SOURCE', citationText: '全量验收独立口径来源' })
  const compare = await get(`/mappings/compare?sourceIndicatorVersionId=${source.versionId}&targetIndicatorVersionId=${target.versionId}`)
  check(`映射${index + 1}冻结源目标公式不同`, !isDeepStrictEqual(compare.sourceSnapshot, compare.targetSnapshot))
  const group = rows(await get(`/mappings/groups?size=100`)).find(g => g.code === `${tag}_G${index}`)
    || await api('POST', '/mappings/groups', { code: `${tag}_G${index}`, name: fixtureName(`全量验收费用口径映射组${index + 1}`), canonicalIndicatorVersionId: source.versionId })
  const existingMapping = rows(await get(`/mappings?size=100`)).find(m => m.code === `${tag}_MR${index}`)
  let detail = existingMapping ? await get(`/mappings/${existingMapping.id}`) : await api('POST', '/mappings', { code: `${tag}_MR${index}`, name: `全量验收指标口径关联复核${index + 1}`, groupId: group.id, targetIndicatorVersionId: target.versionId, mappingType: 'SAME_CONCEPT', comparability: 'NOT_COMPARABLE', evidence: { description: '费用比例、每人次费用和每百人次费用口径不同，不允许直接比较' } })
  const id = detail.mapping.id
  state.mappings ||= []; state.mappings.push({ id, groupId: group.id }); await checkpoint()
  await reject(`映射${index + 1}草稿不可直接批准`, 'POST', `/mappings/${id}/approve`, { resourceVersion: detail.mapping.resourceVersion, comment: '全量验收非法跳转' })
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  check(`映射${index + 1}提交进入待审核`, detail.mapping.reviewStatus === 'PENDING_REVIEW')
  detail = await api('POST', `/mappings/${id}/reject`, { resourceVersion: detail.mapping.resourceVersion, comment: '请补充不可比较的口径依据' })
  check(`映射${index + 1}驳回原因持久化`, detail.mapping.reviewStatus === 'REJECTED' && detail.version.reviewComment === '请补充不可比较的口径依据')
  detail = await api('PATCH', `/mappings/${id}`, { resourceVersion: detail.mapping.resourceVersion, name: detail.mapping.name, mappingType: 'SAME_CONCEPT', comparability: 'NOT_COMPARABLE', evidence: { description: '独立源库验证：公式、单位和统计业务含义不同，不可直接比较' } })
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  detail = await api('POST', `/mappings/${id}/approve`, { resourceVersion: detail.mapping.resourceVersion, comment: '已核对公式和独立源库结果' })
  check(`映射${index + 1}审核通过精确发布`, detail.mapping.reviewStatus === 'APPROVED' && detail.mapping.publicationStatus === 'PUBLISHED')
  check(`映射${index + 1}两端可反向查询`, (await Promise.all([source, target].map(async item => rows(await get(`/mappings/by-indicator-version/${item.versionId}`)).some(row => row.id === id)))).every(Boolean))
  await reject(`映射${index + 1}过期版本不能失效`, 'POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion - 1, reason: '全量验收过期写入' })
  detail = await api('POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion, reason: '全量验收完成，保留审核历史' })
  check(`映射${index + 1}失效原因可追溯`, detail.invalidateReason === '全量验收完成，保留审核历史')
  check(`映射${index + 1}失效后不再作为有效关联`, !rows(await get(`/mappings/by-indicator-version/${source.versionId}`)).some(row => row.id === id))
  await save(`映射${index + 1}审核证据`, { compare, detail })
})

if (mode === '看板编辑') for (const [index, selection, name] of [[0, [0, 3, 4, 5], '死亡率'], [1, [6, 8, 11], '中药费用'], [2, [7], '转科比例']]) await run(`独立${name}看板版本流程`, async () => {
  const original = await get(`/analysis/dashboards/${state.boardId}`)
  const widgets = selection.map((i, n) => ({ ...original.version.widgets[i], code: `CHECK_${index}_${n}`, position: { x: n % 2 * 12, y: Math.floor(n / 2) * 8, w: 12, h: 8 } }))
  const definition = { name: `全量验收${name}独立看板`, type: 'CUSTOM', layout: { columns: 24, float: false }, globalFilters: original.version.globalFilters, widgets }
  let detail = await api('POST', '/analysis/dashboards', { ...definition, code: `${tag}_B${index}` })
  const id = detail.dashboard.id
  state.testBoards ||= []; state.testBoards.push({ id }); await checkpoint()
  try {
    check(`${name}创建完整保存指标及字段绑定`, detail.version.widgets.every((w, i) => w.indicatorVersionId === widgets[i].indicatorVersionId && isDeepStrictEqual(w.fieldBindings, widgets[i].fieldBindings)))
    detail = await api('PUT', `/analysis/dashboards/${id}`, { ...definition, name: `${definition.name}修订`, resourceVersion: detail.version.resourceVersion })
    await reject(`${name}看板拒绝过期保存`, 'PUT', `/analysis/dashboards/${id}`, { ...definition, resourceVersion: detail.version.resourceVersion - 1 })
    detail = await api('POST', `/analysis/dashboards/${id}/publish`, { resourceVersion: detail.version.resourceVersion })
    const firstVersion = detail.version.id
    check(`${name}看板已发布版本指针正确`, detail.dashboard.currentPublishedVersionId === firstVersion)
    for (const month of [1, 2, 3]) {
      const payload = { periodStart: `2026-0${month}-01`, periodEnd: `2026-0${month + 1}-01`, granularity: 'MONTHLY', responseFormat: 'FULL' }
      const actual = await api('POST', `/analysis/dashboards/${id}/query`, payload)
      const expected = await api('POST', `/analysis/dashboards/${state.boardId}/query`, { ...payload, widgetCodes: selection.map(i => original.version.widgets[i].code) })
      for (const [n, sourceIndex] of selection.entries()) {
        const a = actual.widgets[widgets[n].code], b = expected.widgets[original.version.widgets[sourceIndex].code]
        check(`${name}${month}月组件${n + 1}数值和上下文逐行一致`, a.status === b.status && isDeepStrictEqual(a.rows, b.rows), { a: a.status, b: b.status })
      }
    }
    const copy = await api('POST', `/analysis/dashboards/${id}/copy`, { code: `${tag}_BC${index}`, name: `全量验收${name}看板副本` })
    state.testBoards.push({ id: copy.dashboard.id }); await checkpoint()
    check(`${name}副本独立身份并保留定义`, copy.dashboard.id !== id && copy.version.widgets.length === widgets.length && copy.dashboard.status === 'DRAFT')
    detail = await api('PUT', `/analysis/dashboards/${id}`, { ...definition, resourceVersion: detail.version.resourceVersion })
    detail = await api('POST', `/analysis/dashboards/${id}/publish`, { resourceVersion: detail.version.resourceVersion })
    const history = rows(await get(`/analysis/dashboards/${id}/versions`))
    check(`${name}保留两次不可变发布历史`, history.filter(v => v.publicationStatus === 'PUBLISHED').length === 2)
    const restored = await api('POST', `/analysis/dashboards/${id}/versions/${firstVersion}/restore`, {})
    check(`${name}恢复产生新草稿不改写历史`, restored.version.id !== firstVersion && restored.version.widgets.length === widgets.length && restored.version.publicationStatus === 'DRAFT')
    await save(`${name}看板版本证据`, { detail, history, restored, copy })
  } finally {
    for (const board of state.testBoards.filter(b => !b.deleted)) {
      await api('DELETE', `/analysis/dashboards/${board.id}`)
      board.deleted = true; await checkpoint()
    }
  }
})

if (mode === '取消重试') for (const [index, month] of [1, 2, 3].entries()) await run(`第${month}月计算取消与重试`, async () => {
  const version = state.factors[0].draftVersionId
  const query = { periodStart: `2026-0${month}-01T00:00:00`, periodEnd: `2026-0${month + 1}-01T00:00:00`, parameters: {} }
  const key = `${tag}_CANCEL_${index}`, headers = { 'X-Idempotency-Key': key }
  const trial = await api('POST', `/factor-versions/${version}/trial`, query, { headers })
  state.recoveryBatches ||= []; state.recoveryBatches.push(trial); await checkpoint()
  await api('POST', `/calc/batches/${trial.batchId}/cancel`, {})
  const replay = await api('POST', `/factor-versions/${version}/trial`, query, { headers })
  check(`${month}月重复提交保留同一批次`, replay.batchId === trial.batchId)
  await reject(`${month}月幂等键不同请求冲突`, 'POST', `/factor-versions/${version}/trial`, { ...query, periodEnd: '2026-05-01T00:00:00' }, [409], { headers })
  let batch = await poll(`/calc/batches/${trial.batchId}`, ['SUCCEEDED', 'CANCELLED'])
  const nodes = batch.targets.flatMap(t => t.nodes)
  check(`${month}月终态没有遗留待执行节点`, nodes.every(n => !['PENDING', 'RUNNING', 'LEASED'].includes(n.status)))
  if (batch.status === 'CANCELLED') {
    const factor = nodes.find(n => n.nodeType === 'FACTOR')
    await api('POST', `/calc/nodes/${factor.nodeId}/retry`, {})
    batch = await poll(`/calc/batches/${trial.batchId}`, ['SUCCEEDED'])
    check(`${month}月取消后重试递增尝试次数`, batch.targets.flatMap(t => t.nodes).some(n => Number(n.attemptNo) >= 2))
  } else check(`${month}月完成先于取消时不破坏成功`, batch.status === 'SUCCEEDED')
  const result = await get(`/factor-versions/${version}/trials/${trial.batchId}/results?page=1&size=100`)
  const source = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_basicinformationba WHERE sex='1' AND out_date>='2026-0${month}-01' AND out_date<'2026-0${month + 1}-01'`, ['value']))[0]
  check(`${month}月重试结果与源库相同`, close(rows(result.results)[0]?.valueDecimal, source.value), { result, source })
  await reject(`${month}月成功节点不能重试`, 'POST', `/calc/nodes/${batch.targets[0].nodes.find(n => n.nodeType === 'FACTOR').nodeId}/retry`, {}, [409])
  await api('POST', `/calc/batches/${trial.batchId}/cancel`, {})
  check(`${month}月成功后取消不改变结果状态`, (await get(`/calc/batches/${trial.batchId}`)).status === 'SUCCEEDED')
  await save(`取消重试${month}月`, { batch, result, source })
})

if (['导入', '导入复核'].includes(mode)) {
  const mappings = rows(await get('/meta/data-domains/102027642460334973/physical-tables'))
  const tables = { vmq_surgeryinfo: mappings.find(t => t.tableName.toLowerCase() === 'vmq_surgeryinfo').id }
  const variants = [
    ['计数星号', `WITH total AS (SELECT COUNT(*) n FROM vmq_surgeryinfo b WHERE b.surgery_level='3') SELECT n FROM total`, "SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='3'", 1],
    ['去重计数', `WITH total AS (SELECT COUNT(DISTINCT b.patient_ID) n FROM vmq_surgeryinfo b WHERE b.surgery_level='4') SELECT n FROM total`, "SELECT COUNT(DISTINCT patient_ID) FROM vmq_surgeryinfo WHERE surgery_level='4'", 1],
    ['复合手术比例', `WITH all_surgery AS (SELECT COUNT(*) total_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3'), emergency_surgery AS (SELECT COUNT(*) emergency_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3' AND b.surgery_classfy='2') SELECT total_cnt admissions, emergency_cnt emergency, ROUND(emergency_cnt*100.0/total_cnt,2) rate_percent FROM all_surgery CROSS JOIN emergency_surgery`, "SELECT COUNT(*),SUM(surgery_classfy='2') FROM vmq_surgeryinfo WHERE surgery_level='3'", 2]
  ]
  for (const [index, [name, sqlText, oracle, count]] of variants.entries()) await run(`SQL${name}全链路`, async () => {
    if (mode === '导入复核' && index !== 1) return
    const headers = { 'Idempotency-Key': `${tag}_SQL${index}` }
    let task = await api('POST', '/sql-imports', { sql: sqlText, tableMappings: tables, definitionType: 'DSL' }, { headers })
    const id = task.importId
    state.imports ||= []; state.imports.push({ id, name }); await checkpoint()
    try {
      const replay = await api('POST', '/sql-imports', { sql: sqlText, tableMappings: tables, definitionType: 'DSL' }, { headers })
      check(`${name}导入幂等`, replay.importId === id)
      task = await get(`/sql-imports/${id}`)
      const metadata = { scope: 'FACTORS_AND_INDICATOR', category: 'QUALITY', indicatorCode: `${tag}_SI${index}`, indicatorName: `全量验收导入${name}指标`, factors: task.preview.factors.map((f, n) => ({ key: f.key, code: `${tag}_SF${index}_${n}`, name: fixtureName(`全量验收导入${name}因子${n + 1}`), calculationMode: 'STATIC' })) }
      check(`${name}解析聚合因子数量正确`, task.preview.factors.length === count, task.preview)
      await api('PUT', `/sql-imports/${id}/metadata`, metadata)
      check(`${name}重新读取保留中文元数据`, (await get(`/sql-imports/${id}`)).metadata.indicatorName === metadata.indicatorName)
      await api('POST', `/sql-imports/${id}/trial`, { parameters: {} }, { headers: { 'Idempotency-Key': `${tag}_ST${index}` } })
      task = await poll(`/sql-imports/${id}`, ['TRIAL_SUCCEEDED'])
      const results = await get(`/indicator-versions/${task.result.indicatorVersionId}/trials/${task.result.trialBatchId}/results?page=1&size=100`)
      const source = (await sql('SOURCE', oracle, ['total', 'numerator']))[0]
      const result = rows(results.results || results.targets?.[0]?.results)[0]
      check(`${name}试算与独立源库公式相同`, count === 1 ? close(result.resultValue, source.total) : close(result.resultValue, Number(source.numerator) / Number(source.total)), { result, source })
      if (count === 2) check(`${name}分子分母不是混淆的百分数`, close(result.numeratorValue, source.numerator) && close(result.denominatorValue, source.total))
      await save(`导入${name}`, { task, results, source })
    } finally {
      await api('POST', `/sql-imports/${id}/abandon`, { reason: '全量验收结束，仅清理本次生成的未发布资源' })
      const abandoned = await poll(`/sql-imports/${id}`, ['ABANDONED'])
      check(`${name}放弃后清理状态完整`, abandoned.resources.every(r => ['DELETED', 'RETAINED', 'SKIPPED', 'NOT_CREATED'].includes(r.cleanup)))
    }
  })
}
await finish(mode)
