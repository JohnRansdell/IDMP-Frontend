import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { api, get, rows, state, save, checkpoint, check, run, reject, sql, close, remember, finish, poll, fixtureName } from './comprehensive-client.mjs'
import { buildFactorDsl } from '../src/idmp/utils/dslBuilder.js'
const mode = process.argv[2], tag = state.tag
const valid = result => ['VALID', 'VALID_WITH_WARNINGS'].includes(result.status)

if (mode === '数据治理') await run('独立数据域字段及标准化', async () => {
  const domain = await api('POST', '/meta/data-domains', { code: `${tag}_DOMAIN`, name: '全量验收病案数据域', description: '隔离验收资源，不修改共享数据域' })
  state.domain = domain; await checkpoint()
  await api('POST', `/meta/data-domains/${domain.id}/physical-tables`, { tableName: 'vmq_basicinformationba' })
  const specs = [
    { sourceFieldName: 'sex', code: 'QA_SEX', name: '患者性别', dataType: 'STRING', semanticKind: 'DIMENSION', sensitive: false },
    { sourceFieldName: 'out_date', code: 'QA_DATE', name: '出院日期', dataType: 'DATETIME', semanticKind: 'TIME', sensitive: false },
    { sourceFieldName: 'out_dept_code', code: 'QA_DEPT', name: '出院科室编码', dataType: 'STRING', semanticKind: 'DIMENSION', sensitive: false }
  ]
  const fields = []
  for (const spec of specs) {
    const field = await api('POST', `/meta/data-domains/${domain.id}/physical-tables/vmq_basicinformationba/semantic-fields`, spec)
    fields.push(field)
    check(`${spec.name}物理来源和类型完整保存`, Object.entries(spec).every(([key, value]) => field[key] === value), field)
  }
  state.domainFields = fields; await checkpoint()
  await api('PATCH', `/meta/data-domains/${domain.id}/physical-tables/vmq_basicinformationba/default-time-field`, { semanticFieldCode: 'QA_DATE' })
  check('默认时间字段保存准确', rows(await get(`/meta/data-domains/${domain.id}/physical-tables`))[0].defaultTimeSemanticFieldCode === 'QA_DATE')
  await reject('非时间字段不能作为默认日期', 'PATCH', `/meta/data-domains/${domain.id}/physical-tables/vmq_basicinformationba/default-time-field`, { semanticFieldCode: 'QA_SEX' })
  const valueSet = state.valueSets.find(item => item.matchMode === 'EXACT')
  const field = fields[0]
  const binding = await get(`/meta/semantic-fields/${field.id}/value-set`)
  const linked = await api('PUT', `/meta/semantic-fields/${field.id}/value-set`, { valueSetId: valueSet.id, resourceVersion: binding.resourceVersion ?? field.resourceVersion })
  check('值集绑定实际已发布版本', linked.bound && linked.valueSet.id === valueSet.id && linked.publishedVersion.id === valueSet.versionId, linked)
  for (const [index, value, name] of [[0, '1', '男性'], [1, '2', '女性'], [2, '不存在的性别', '无匹配']]) {
    const dsl = buildFactorDsl({ domainCode: domain.code, tableName: 'vmq_basicinformationba', aggregation: 'COUNT', periodColumn: 'QA_DATE', filters: { nodeType: 'PREDICATE', fieldCode: 'QA_SEX', operator: 'EQ', value } })
    const factor = await remember('factors', await api('POST', '/factors', { code: `${tag}_DOMAIN${index}`, name: fixtureName(`全量验收数据域${name}出院人次`), dsl }))
    const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    check(`${name}语义字段因子编译通过`, valid(compilation), compilation)
    const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters: {} })
    const expected = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' AND sex='${value}'`, ['value']))[0]
    check(`${name}语义查询与物理源表一致`, close(rows(query)[0]?.factor_value, expected.value), { query, expected })
  }
  const mappingId = field.sourceFieldMappingId
  const profile = await get(`/meta/source-field-mappings/${mappingId}/value-profile?page=1&size=100`)
  const source = await sql('SOURCE', 'SELECT sex,COUNT(*) FROM vmq_basicinformationba GROUP BY sex', ['value', 'count'])
  check('源值分布各桶等于独立源表分组', profile.items.every(item => source.some(expected => expected.value === item.value && Number(expected.count) === Number(item.count))), { profile, source })
  const payload = { name: '全量验收患者性别标准化', unmatchedPolicy: 'KEEP_SOURCE', nullPolicy: 'KEEP_NULL', normalizers: ['TRIM'], mappings: [{ sourceValue: '1', targetItemCode: 'MALE' }, { sourceValue: '2', targetItemCode: 'FEMALE' }] }
  let transform = await api('POST', `/meta/source-field-mappings/${mappingId}/transform-rules`, payload)
  state.transform = transform; await checkpoint()
  await reject('标准化拒绝去空格后的重复匹配', 'PUT', `/transform-rule-versions/${transform.version.id}`, { ...payload, resourceVersion: transform.version.resourceVersion, mappings: [...payload.mappings, { sourceValue: ' 1 ', targetItemCode: 'MALE' }] })
  const preview = await api('POST', `/transform-rule-versions/${transform.version.id}/preview`, { limit: 100 })
  check('标准化预览总量守恒', Number(preview.matchedCount) + Number(preview.unmatchedCount) === source.reduce((n, item) => n + Number(item.count), 0), preview)
  check('标准化男性女性匹配正确', preview.items.filter(item => ['1', '2'].includes(item.sourceValue)).every(item => item.targetValue === item.sourceValue && item.targetItemCode === (item.sourceValue === '1' ? 'MALE' : 'FEMALE')), preview)
  const validation = await api('POST', `/transform-rule-versions/${transform.version.id}/validate`, {})
  check('标准化规则校验通过', validation.valid, validation)
  transform = await api('POST', `/transform-rule-versions/${transform.version.id}/publish`, { resourceVersion: validation.resourceVersion })
  check('标准化发布版本指针准确', transform.rule.currentPublishedVersionId === transform.version.id)
  await save('数据治理完整链路', { domain, fields, linked, profile, preview, transform })
})

if (mode === '模板') await run('模板创建发布实例化', async () => {
  const dsl = buildFactorDsl({ domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', aggregation: 'COUNT', calculationMode: 'STATIC', filters: { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: { parameterRef: 'LEVEL' } } })
  const parameters = [{ code: 'LEVEL', displayName: '手术级别', dataType: 'STRING', required: true, exposed: true, defaultValue: '3', valueSourceType: 'MANUAL', displayOrder: 0 }]
  let detail
  if (state.template) {
    detail = await get(`/factor-template-versions/${state.template.versionId}`)
    detail = await api('PATCH', `/factor-template-versions/${state.template.versionId}`, { resourceVersion: detail.version.resourceVersion, templateDefinition: dsl, parameters })
  } else detail = await api('POST', '/factor-templates', { code: `${tag}_TPL`, name: '全量验收按手术级别统计模板', factorTypeScope: 'AGGREGATE', templateDefinition: dsl, outputDescriptor: { valueType: 'DECIMAL' }, parameters })
  state.template = { id: detail.template.id, versionId: detail.version.id }; await checkpoint()
  const id = detail.version.id
  await reject('草稿模板不可实例化', 'POST', `/factor-template-versions/${id}/instantiate`, { factorCode: `${tag}_TPL_BAD`, factorName: '全量验收草稿不可实例化', parameterValues: {} })
  const validation = await api('POST', `/factor-template-versions/${id}/validate`, {})
  check('模板定义校验通过', validation.valid, validation)
  detail = await api('POST', `/factor-template-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
  const schema = await get(`/factor-templates/${detail.template.id}/parameter-schema`)
  check('模板参数暴露和默认值正确', schema.parameters.some(p => p.code === 'LEVEL' && p.defaultValue === '3' && p.exposed))
  for (const [index, level, label] of [[0, '3', '三级'], [1, '4', '四级'], [2, '不存在', '无匹配']]) {
    const instance = await api('POST', `/factor-template-versions/${id}/instantiate`, { factorCode: `${tag}_TPL_F${index}`, factorName: fixtureName(`全量验收模板${label}手术人次`), category: 'QUALITY', parameterValues: { LEVEL: level } })
    await remember('factors', instance.factor)
    check(`${label}模板替换参数准确`, instance.generatedDsl.filters.value === level && instance.effectiveParameters.LEVEL === level)
    const compiled = await api('POST', `/factor-versions/${instance.factor.draftVersionId}/compile`, {})
    check(`${label}模板实例编译通过`, valid(compiled), compiled)
    const query = await api('POST', `/factor-versions/${instance.factor.draftVersionId}/query`, { parameters: {} })
    const source = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='${level}'`, ['value']))[0]
    check(`${label}模板实例与源表统计一致`, close(rows(query)[0]?.factor_value, source.value), { query, source })
  }
  check('模板反向实例列表无遗漏', rows(await get(`/factor-template-versions/${id}/instances?size=100`)).filter(item => item.code.startsWith(tag)).length === 3)
  await reject('已发布模板不能直接改定义', 'PATCH', `/factor-template-versions/${id}`, { resourceVersion: detail.version.resourceVersion, templateDefinition: dsl, parameters })
  const copy = await api('POST', `/factor-templates/${detail.template.id}/versions`, { copyFromVersionId: id })
  const businessParameters = list => list.map(({ id: parameterId, ...definition }) => definition)
  check('复制模板新草稿保留参数定义', copy.version.id !== id && copy.version.publicationStatus === 'DRAFT' && isDeepStrictEqual(businessParameters(copy.version.parameters), businessParameters(detail.version.parameters)))
  check('复制模板参数获得新身份', copy.version.parameters.every((parameter, index) => parameter.id !== detail.version.parameters[index].id))
})

if (mode === '模板政策复核') {
  const template = await get(`/factor-template-versions/${state.template.versionId}`)
  const instances = rows(await get(`/factor-template-versions/${state.template.versionId}/instances?size=100`)).filter(item => item.code.startsWith(tag))
  for (const [index, level] of ['3', '4', '不存在'].entries()) await run(`模板实例复核${index + 1}`, async () => {
    const instance = instances.find(item => item.code === `${tag}_TPL_F${index}`)
    const factor = await get(`/factors/${instance.id}`)
    const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { parameters: {} })
    const source = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='${level}'`, ['value']))[0]
    check(`模板实例${index + 1}源表对账`, close(rows(query)[0]?.factor_value, source.value), { source, query })
  })
  const copy = await api('POST', `/factor-templates/${state.template.id}/versions`, { copyFromVersionId: state.template.versionId })
  check('模板复制保留参数业务定义而非复用内部身份', isDeepStrictEqual(copy.version.parameters.map(({ id, ...p }) => p), template.version.parameters.map(({ id, ...p }) => p)) && copy.version.parameters[0].id !== template.version.parameters[0].id)
  for (const policy of state.policies) await run('政策持久化复核', async () => {
    const detail = await get(`/meta/policy-files/${policy.id}`)
    check('政策有准确发布版本指针', Boolean(detail.policyFile.currentPublishedVersionId) && detail.versions.some(version => version.id === detail.policyFile.currentPublishedVersionId && version.publicationStatus === 'PUBLISHED'), detail)
  })
}

if (mode === '连续值集复核') await run('连续值集边界生命周期', async () => {
  const original = state.valueSets.find(item => item.matchMode === 'CONTINUOUS')
  let detail = await get(`/meta/value-set-versions/${original.versionId}`)
  const continuousSpec = { unit: 'HOUR', precision: 12, scale: 6, minimumValue: '0', maximumValue: `49.${tag.replace(/\D/g, '').slice(-6)}`, minimumInclusive: true, maximumInclusive: false }
  detail = await api('PATCH', `/meta/value-set-versions/${original.versionId}`, { resourceVersion: detail.version.resourceVersion, name: original.name, matchMode: 'CONTINUOUS', valueType: 'DECIMAL', continuousSpec })
  check('连续值集非整数边界和开闭区间准确保存', Object.entries(continuousSpec).every(([key, value]) => detail.version.continuousSpec[key] === value))
  const validation = await api('POST', `/meta/value-set-versions/${original.versionId}/validate`, {})
  check('连续值集唯一内容可校验', validation.valid, validation)
  detail = await api('POST', `/meta/value-sets/${original.id}/versions/${original.versionId}/publish`, { resourceVersion: validation.resourceVersion })
  check('连续值集发布精度不丢失', detail.version.continuousSpec.maximumValue === continuousSpec.maximumValue && detail.version.publicationStatus === 'PUBLISHED')
  const copy = await api('POST', `/meta/value-sets/${original.id}/versions`, { copyFromVersionId: original.versionId })
  await reject('连续值集逆序边界不能保存', 'PATCH', `/meta/value-set-versions/${copy.version.id}`, { resourceVersion: copy.version.resourceVersion, name: original.name, matchMode: 'CONTINUOUS', valueType: 'DECIMAL', continuousSpec: { ...continuousSpec, minimumValue: '50' } })
})

if (mode === '场景') {
  state.scenarios ||= []
  const version = state.indicators[0].versionId
  for (const [index, type, name, period] of [[0, 'QUALITY_CONTROL', '质量监测', 'MONTHLY'], [1, 'CUSTOM', '季度成本复核', 'QUARTERLY'], [2, 'CUSTOM', '年度经营复核', 'YEARLY']]) await run(`场景${name}`, async () => {
    let detail = await api('POST', '/scenarios', { code: `${tag}_SCENE${index}`, name: `全量验收${name}`, type, defaultPeriodType: 'MONTHLY', governingOrgName: '全量验收测试机构', defaultParameters: {} })
    state.scenarios.push({ id: detail.scenario.id, versionId: detail.version.id }); await checkpoint()
    const id = detail.version.id
    const indicators = [{ indicatorVersionId: version, displayOrder: 0, required: true, periodType: period, dimensionGrain: [] }]
    detail = await api('PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators })
    check(`${name}保存精确指标版本关联`, detail.version.indicators.length === 1 && detail.version.indicators[0].indicatorVersionId === version)
    await reject(`${name}重复指标版本关联被拒绝`, 'PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators: [...indicators, indicators[0]] })
    const preview = await get(`/scenario-versions/${id}/merged-preview`)
    check(`${name}场景周期覆盖生效`, preview.indicators[0].effectivePeriodType === period && preview.indicators[0].defaultPeriodType === 'MONTHLY', preview)
    const validation = await api('POST', `/scenario-versions/${id}/validate`, {})
    check(`${name}校验通过`, validation.valid, validation)
    detail = await api('POST', `/scenario-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
    check(`${name}发布版本指针一致`, detail.scenario.currentPublishedVersionId === id)
    const reverse = await get(`/indicators/${state.indicators[0].id}/scenarios?size=100`)
    check(`${name}反向关联可追溯准确版本`, rows(reverse).some(item => item.id === detail.scenario.id && item.scenarioVersionId === id), reverse)
    await reject(`${name}发布版本不能原地修改`, 'PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators: [] })
    const copy = await api('POST', `/scenarios/${detail.scenario.id}/versions`, { copyFromVersionId: id })
    check(`${name}复制场景保留关联`, copy.version.id !== id && copy.version.publicationStatus === 'DRAFT' && copy.version.indicators[0].indicatorVersionId === version)
  })
}

if (mode === '政策') {
  state.policies ||= []
  assert.ok(state.files.length >= 2)
  state.files = await Promise.all(state.files.map(async file => (await api('POST', '/meta/file-objects/check', { sha256: file.sha256, originalName: file.originalName, fileSizeBytes: file.fileSizeBytes })).file))
  await checkpoint()
  for (const [index, name, file] of [[0, '出院人次统计规范', state.files[0]], [1, '中药费用统计规范', state.files[1]], [2, '复合指标费用统计规范', state.files[1]]]) await run(`政策${name}`, async () => {
    const existing = state.policies[index]
    if (existing && (await get(`/meta/policy-files/${existing.id}`)).policyFile.currentPublishedVersionId) return
    let detail = existing ? await get(`/meta/policy-files/${existing.id}`) : await api('POST', '/meta/policy-files', { code: `${tag}_POLICY${index}`, name: `全量验收${name}`, category: 'QUALITY', issuingOrganization: '验收测试机构', documentNumber: `测试文号${index + 1}` })
    const id = detail.policyFile.id
    state.policies[index] = { id }; await checkpoint()
    detail = await api('POST', `/meta/policy-files/${id}/versions`, { issueDate: '2026-01-01', effectiveStartDate: '2026-02-01', fileObjectId: file.id, contentHash: file.sha256 })
    const version = detail.versions[0]
    const validation = await api('POST', `/meta/policy-file-versions/${version.id}/validate`, {})
    check(`${name}真实附件校验通过`, validation.valid, validation)
    const fresh = await get(`/meta/policy-file-versions/${version.id}`)
    detail = await api('POST', `/meta/policy-files/${id}/versions/${version.id}/publish`, { resourceVersion: fresh.resourceVersion })
    check(`${name}发布版本引用正确附件`, detail.policyFile.currentPublishedVersionId === version.id && detail.versions.some(v => v.fileObjectId === file.id && v.contentHash === file.sha256))
    const indicatorVersionId = state.indicators[index].versionId
    const ref = await api('POST', `/mappings/indicator-versions/${indicatorVersionId}/policy-references`, { policyFileVersionId: version.id, citationLocation: '计算公式', citationText: '仅用于系统验收，不作为临床规范', relationRole: 'SOURCE' })
    check(`${name}政策关联写入准确版本`, ref.indicatorVersionId === indicatorVersionId && ref.policyFileVersionId === version.id)
    const list = await get(`/mappings/indicator-versions/${indicatorVersionId}/policy-references`)
    check(`${name}政策关联读写一致`, rows(list).some(item => item.id === ref.id))
    await reject(`${name}伪造附件哈希被拒绝`, 'POST', `/meta/policy-files/${id}/versions`, { fileObjectId: file.id, issueDate: '2026-03-01', contentHash: '0'.repeat(64) })
  })
}

if (mode === '预警') {
  state.rules ||= []
  const realVersion = '102027642461313071'
  const candidates = await get('/analysis/warning-rules/recipient-options')
  check('预警接收人只包含工号姓名不泄露内部用户标识', rows(candidates).every(item => item.userId == null && item.id == null), rows(candidates).slice(0, 3))
  const scopes = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${realVersion}`)
  await save('预警可选范围', scopes)
  const target = scopes.find(item => item.dimensions?.includes('OUT_DEPT_CODE'))
  assert.ok(target)
  const member = await get(`/analysis/warning-rules/member-options?indicatorVersionId=${realVersion}&targetCode=${encodeURIComponent(target.targetCode)}&dimension=OUT_DEPT_CODE&search=9012&size=50`)
  check('科室成员按字典检索到真实编码', member.values.includes('9012'), member)
  await reject('不能查询目标外的分组字段', 'GET', `/analysis/warning-rules/member-options?indicatorVersionId=${realVersion}&targetCode=${encodeURIComponent(target.targetCode)}&dimension=错误维度`)
  for (const [index, name, scope] of [
    [0, '总体结果嵌套规则', { mode: 'MAIN' }],
    [1, '指定科室分组嵌套规则', { mode: 'GROUPED', targetCode: target.targetCode, dimensions: target.dimensions, members: { OUT_DEPT_CODE: ['9012'] } }],
    [2, '全部结果嵌套规则', { mode: 'ALL' }]
  ]) await run(name, async () => {
    const condition = { logic: 'OR', children: [{ logic: 'AND', children: [{ operator: 'GT', threshold: '0.4' }, { logic: 'NOT', children: [{ operator: 'GTE', threshold: '1' }] }] }, { operator: 'EQ', threshold: '0.25' }] }
    const payload = { code: `${tag}_W${index}`, name: `全量验收${name}`, warningType: 'THRESHOLD', indicatorVersionId: realVersion, periodType: 'MONTHLY', severity: 'HIGH', condition,
      scopePolicy: { includeNoScenario: true, resultScope: scope }, notificationPolicy: { channels: ['IN_APP'], recipientUsernames: ['300112'] }, effectiveStartDate: '2099-01-01' }
    let detail = await api('POST', '/analysis/warning-rules', payload)
    state.rules.push({ id: detail.id, versionId: detail.version.id }); await checkpoint()
    check(`${name}创建草稿默认禁用`, detail.enableStatus === 'DISABLED' && detail.version.publicationStatus === 'DRAFT')
    check(`${name}嵌套与或非树不被展平`, isDeepStrictEqual(detail.version.condition, condition), detail.version.condition)
    check(`${name}结果范围保持独立`, detail.version.scopePolicy.resultScope.mode === scope.mode, detail.version.scopePolicy)
    await reject(`${name}非运算只能有一个子条件`, 'PATCH', `/analysis/warning-rule-versions/${detail.version.id}`, { ...payload, resourceVersion: detail.version.resourceVersion, condition: { logic: 'NOT', children: [{ operator: 'GT', threshold: '0.4' }, { operator: 'LT', threshold: '1' }] } })
    detail = await api('POST', `/analysis/warning-rule-versions/${detail.version.id}/publish`, { resourceVersion: detail.version.resourceVersion })
    check(`${name}发布不擅自启用发送通知`, detail.enableStatus === 'DISABLED' && detail.currentPublishedVersionId === detail.version.id)
    await reject(`${name}发布版本不可修改阈值`, 'PATCH', `/analysis/warning-rule-versions/${detail.version.id}`, { ...payload, resourceVersion: detail.version.resourceVersion })
  })
}

if (mode === '回收站') {
  for (const [index, type, name] of [[0, 'factors', '普通因子'], [1, 'indicators', '普通指标'], [2, 'factors', '嵌套条件因子']]) await run(`回收站${name}`, async () => {
    const payload = { code: `${tag}_RECYCLE${index}`, name: fixtureName(`全量验收回收站${name}`) }
    if (type === 'factors') payload.dsl = buildFactorDsl({ tableName: 'vmq_surgeryinfo', aggregation: 'COUNT', calculationMode: 'STATIC', filters: { nodeType: 'TRUE' } })
    let resource = await remember(type, await api('POST', `/${type}`, payload))
    const id = resource.id
    const impact = await get(`/${type}/${id}/deletion-impact`)
    check(`${name}独立草稿可删除`, impact.deletable)
    await reject(`${name}过期版本不能删除`, 'DELETE', `/${type}/${id}`, { resourceVersion: resource.resourceVersion + 100, deleteReason: '全量验收并发冲突' })
    await api('DELETE', `/${type}/${id}`, { resourceVersion: resource.resourceVersion, deleteReason: '全量验收回收站恢复验证' })
    const recycled = await get(`/${type}/recycle-bin/${id}`)
    check(`${name}回收站记录原因和原身份`, recycled.resource.resourceId === id && recycled.resource.deleteReason === '全量验收回收站恢复验证')
    await reject(`${name}删除后活跃详情不可访问`, 'GET', `/${type}/${id}`, undefined, [404, 410])
    await reject(`${name}过期版本不能恢复`, 'POST', `/${type}/recycle-bin/${id}/restore`, { resourceVersion: recycled.resource.resourceVersion + 100 })
    await api('POST', `/${type}/recycle-bin/${id}/restore`, { resourceVersion: recycled.resource.resourceVersion })
    resource = await get(`/${type}/${id}`)
    check(`${name}恢复保留身份名称和状态`, resource.id === id && resource.name === payload.name && resource.code === payload.code && resource.status === 'DRAFT')
    await api('DELETE', `/${type}/${id}`, { resourceVersion: resource.resourceVersion, deleteReason: '全量验收完成，再次移入回收站' })
  })
}

if (mode === '调度') {
  for (const [index, periodType, cronExpression, name] of [[0, 'MONTHLY', '0 0 2 1 * *', '月度'], [1, 'QUARTERLY', '0 0 3 1 1,4,7,10 *', '季度'], [2, 'YEARLY', '0 0 4 1 1 *', '年度']]) await run(`${name}调度`, async () => {
    const ownerVersionId = state.factors[0].draftVersionId
    const payload = { scheduleCode: `${tag}_S${index}`, scheduleName: `全量验收${name}禁用调度`, ownerType: 'FACTOR', ownerVersionId, cronExpression, timezone: 'Asia/Shanghai', periodType, periodOffset: 1, enabled: false }
    await reject(`${name}非法时区被拒绝`, 'POST', '/calc/schedules', { ...payload, timezone: '错误时区' })
    await reject(`${name}非法表达式被拒绝`, 'POST', '/calc/schedules', { ...payload, cronExpression: '错误表达式' })
    const created = await api('POST', '/calc/schedules', payload)
    state.schedules ||= []; state.schedules.push(created); await checkpoint()
    const stored = await get(`/calc/schedules/${created.id}`)
    check(`${name}禁用调度不产生下次触发时间`, stored.status === 'PAUSED' && stored.nextTriggerAt == null && stored.ownerVersionId === ownerVersionId && stored.cronExpression === cronExpression)
    const disabled = await api('PATCH', `/calc/schedules/${created.id}/status`, { enabled: false })
    check(`${name}重复停用保持幂等`, disabled.status === 'PAUSED' && disabled.nextTriggerAt == null)
  })
}

await finish(mode)
