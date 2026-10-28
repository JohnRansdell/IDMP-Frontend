import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { api, get, rows, state, save, checkpoint, check, run, reject, sql, close, remember, finish, origin, folder, poll, fixtureName } from './comprehensive-client.mjs'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'

const mode = process.argv[2], tag = `${state.tag}_EXTRA`

if (['关联与路径', '物理关联'].includes(mode)) {
  const seed = rows(await get('/meta/physical-table-relations')).find(item => item.status === 'PUBLISHED')
  assert.ok(seed)
  for (const [index, joinType, cardinality] of [[0, 'INNER', 'MANY_TO_ONE'], [1, 'LEFT', 'MANY_TO_ONE'], [2, 'INNER', 'ONE_TO_ONE']]) await run(`关联表第${index + 1}种配置`, async () => {
    const payload = { ...seed, code: `${tag}_JOIN${index}` }
    delete payload.id
    payload.joinType = joinType; payload.cardinality = cardinality
    let relation = await api('POST', '/meta/physical-table-relations', payload)
    try {
      check(`关联${index + 1}两端物理表与键字段准确保存`, relation.leftPhysicalTableBindingId === seed.leftPhysicalTableBindingId && relation.rightPhysicalTableBindingId === seed.rightPhysicalTableBindingId && JSON.stringify(relation.leftKeySpec) === JSON.stringify(seed.leftKeySpec))
      const bad = { resourceVersion: relation.resourceVersion, joinType, cardinality, leftKeySpec: { fieldCode: '不存在的字段' }, rightKeySpec: seed.rightKeySpec }
      relation = await api('PATCH', `/meta/physical-table-relations/${relation.id}`, bad)
      const invalid = await api('POST', `/meta/physical-table-relations/${relation.id}/validate`, {})
      check(`关联${index + 1}无效键不能通过元数据校验`, !invalid.valid && invalid.diagnostics.some(d => d.severity === 'ERROR'))
      await reject(`关联${index + 1}无效键不能发布`, 'POST', `/meta/physical-table-relations/${relation.id}/publish`, { resourceVersion: relation.resourceVersion })
      relation = await api('PATCH', `/meta/physical-table-relations/${relation.id}`, { ...bad, resourceVersion: relation.resourceVersion, leftKeySpec: seed.leftKeySpec })
      check(`关联${index + 1}正确键可通过校验`, (await api('POST', `/meta/physical-table-relations/${relation.id}/validate`, {})).valid)
      relation = await api('POST', `/meta/physical-table-relations/${relation.id}/publish`, { resourceVersion: relation.resourceVersion })
      check(`关联${index + 1}发布保留连接语义`, relation.status === 'PUBLISHED' && relation.joinType === joinType && relation.cardinality === cardinality)
      await reject(`关联${index + 1}过期版本不能覆盖`, 'PATCH', `/meta/physical-table-relations/${relation.id}`, { ...bad, resourceVersion: 0 })
    } finally {
      relation = await get(`/meta/physical-table-relations/${relation.id}`)
      await api('POST', `/meta/physical-table-relations/${relation.id}/disable`, { resourceVersion: relation.resourceVersion })
    }
  })
  const organization = await get('/meta/drill-path-versions/102027642460761110')
  if (mode !== '物理关联') for (const [index, subjectType] of ['INDICATOR_RESULT', 'FACTOR_RESULT', 'DQ_ISSUE'].entries()) await run(`中文自定义下钻路径${index + 1}`, async () => {
    const levels = organization.levels.slice(index === 1 ? 1 : 0).map((level, order) => ({ ...level, levelName: ['医院', '科室', '医生'][order + (index === 1 ? 1 : 0)] }))
    const payload = { pathCode: `${tag}_PATH${index}`, pathName: `全量验收${['指标', '因子', '质量问题'][index]}组织链路`, subjectType, levels }
    let path = await api('POST', '/meta/drill-paths', payload)
    check(`路径${index + 1}字段标识顺序和中文名称保存`, path.levels.length === levels.length && path.levels.every((l, i) => l.dimensionSemanticFieldId === levels[i].dimensionSemanticFieldId && l.levelName === levels[i].levelName))
    const validation = await api('POST', `/meta/drill-path-versions/${path.version.id}/validate`, {})
    check(`路径${index + 1}已发布元数据校验通过`, validation.valid, validation)
    path = await api('POST', `/meta/drill-path-versions/${path.version.id}/publish`, { version: validation.resourceVersion })
    check(`路径${index + 1}发布指针与版本一致`, path.path.currentPublishedVersionId === path.version.id && path.version.publicationStatus === 'PUBLISHED')
    await reject(`路径${index + 1}发布后不能原地改写`, 'PATCH', `/meta/drill-path-versions/${path.version.id}`, { ...payload, version: path.version.resourceVersion })
    const copied = await api('POST', `/meta/drill-paths/${path.path.id}/versions`, { copyFromVersionId: path.version.id })
    check(`路径${index + 1}新草稿不覆盖已发布版本`, copied.version.id !== path.version.id && copied.version.publicationStatus === 'DRAFT' && copied.path.currentPublishedVersionId === path.version.id)
    await save(`补充下钻路径${index + 1}`, { path, copied })
  })
}

if (mode === '运行参数') await run('原生SQL多参数与周期完整链路', async () => {
  const dsl = { schemaVersion: '1.0', dslType: 'FACTOR', definitionType: 'SQL', calculationMode: 'TEMPORAL', periodColumn: 'b.out_date',
    sqlTemplate: 'SELECT COUNT(*) AS factor_value FROM vmq_basicinformationba b WHERE b.out_date>=:periodStart AND b.out_date<:periodEnd [[AND b.out_dept_code={{department}}]] [[AND b.sex={{sex}}]]',
    parameters: [{ code: 'department', type: 'STRING', required: false, parameterMode: 'TEMPORARY' }, { code: 'sex', type: 'STRING', required: false, parameterMode: 'TEMPORARY' }], output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', grain: [] } }
  let factor = rows(await get(`/factors?code=${tag}_PARAM`)).find(item => item.code === `${tag}_PARAM`)
  if (factor) {
    factor = await get(`/factors/${factor.id}`)
    const version = await get(`/factor-versions/${factor.draftVersionId}`)
    factor = await api('PATCH', `/factors/${factor.id}`, { name: factor.name, resourceVersion: factor.resourceVersion, dsl, factorVersionId: version.id, versionResourceVersion: version.resourceVersion })
  } else factor = await remember('factors', await api('POST', '/factors', { code: `${tag}_PARAM`, name: fixtureName('全量验收按科室性别查询出院人次'), dsl }))
  const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
  check('SQL运行参数因子编译通过', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status))
  for (const [label, parameters, where] of [['不填写可选参数', {}, ''], ['骨科男性', { department: '15', sex: '1' }, " AND out_dept_code='15' AND sex='1'"], ['呼吸科全部性别', { department: '16' }, " AND out_dept_code='16'"], ['不存在的组合', { department: '不存在的科室', sex: '1' }, " AND out_dept_code='不存在的科室' AND sex='1'"], ['空白参数', { department: '  ', sex: '' }, '']]) {
    const query = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters }
    const actual = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, query)
    const expected = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'${where}`, ['value']))[0]
    check(`${label}严格等于独立源表统计`, close(rows(actual)[0]?.factor_value, expected.value), { actual, expected })
  }
  await reject('未声明参数不能悄悄忽略', 'POST', `/factor-versions/${factor.draftVersionId}/query`, { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters: { unknown: '15' } })
  await reject('非法周期必须返回明确错误', 'POST', `/factor-versions/${factor.draftVersionId}/query`, { periodStart: '不是日期', periodEnd: '2026-02-01T00:00:00', parameters: {} })
  state.runtimeFactor = factor; await checkpoint()
})

if (mode === '目标值页面') await run('空目标零目标非零目标的真实图表及报告', async () => {
  const { chromium } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
  const { readFile } = await import('node:fs/promises')
  const credentials = JSON.parse(await readFile('.tmp/forced-login-admin-20261024.json', 'utf8'))
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const { id, versionId } = state.eventTest.indicator
  const original = await get(`/indicator-versions/${versionId}/performance-target`)
  try {
    await page.goto(`${origin}/login`)
    await page.getByLabel('工号', { exact: true }).fill(credentials.username)
    await page.getByLabel('密码', { exact: true }).fill(credentials.password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL(url => !url.pathname.includes('login'))
    for (const [index, value, label] of [[0, null, '空目标'], [1, 0, '零目标'], [2, 0.003, '非零百分比目标']]) {
      const before = await get(`/indicator-versions/${versionId}/performance-target`)
      const saved = await api('PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: value, improvementDirection: value === null ? null : 'LOWER_IS_BETTER', resourceVersion: before.resourceVersion })
      check(`${label}实际持久化不混淆空与零`, saved.targetValue === null ? value === null : close(saved.targetValue, value), saved)
      await page.goto(`${origin}/analysis?indicator=${id}&indicatorVersionId=${versionId}&granularity=MONTHLY&periodStart=2026-01-01&periodEnd=2026-01-31`)
      await page.waitForFunction(() => {
        let c = document.querySelector('.indicator-analysis')?.__vueParentComponent
        while (c && c.type.__name !== 'IndicatorAnalysis') c = c.parent
        return c?.setupState.trendBackendAnalysis && !c.setupState.analysisLoading
      }, undefined, { timeout: 60000 })
      const snapshot = await page.locator('.indicator-analysis').evaluate(node => {
        let c = node.__vueParentComponent
        while (c && c.type.__name !== 'IndicatorAnalysis') c = c.parent
        const s = c.setupState
        return JSON.parse(JSON.stringify({ profile: s.currentProfile, option: s.trendOption, rows: s.trendTableRows, analysis: s.trendBackendAnalysis }))
      })
      const target = snapshot.option.series?.[0]?.markLine
      check(`${label}趋势线坐标符合百分比转换`, value === null ? !target && snapshot.profile.markLineValue === null : close(target?.data?.[0]?.yAxis, value * 100), snapshot.profile)
      check(`${label}目标文案真实无伪造`, value === null ? snapshot.profile.targetLabel === '目标值未配置' : snapshot.profile.targetLabel === `目标值：${index === 1 ? '0.00%' : '0.30%'}`, snapshot.profile.targetLabel)
      const downloadEvent = page.waitForEvent('download', { timeout: 60000 })
      await page.getByRole('button', { name: '导出PDF', exact: true }).click()
      const download = await downloadEvent
      await download.saveAs(`${folder}/指标分析${label}.pdf`)
      check(`${label}导出报告成功且非空`, !(await download.failure()))
      await page.screenshot({ path: `${folder}/指标分析${label}.png`, fullPage: true })
      await save(`目标值页面${label}`, snapshot)
    }
    check('目标值页面及导出无运行错误', !errors.length, errors)
  } finally {
    const current = await get(`/indicator-versions/${versionId}/performance-target`)
    await api('PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: original.targetValue, improvementDirection: original.improvementDirection, resourceVersion: current.resourceVersion })
    await browser.close()
  }
})
if (mode === '复合因子') {
  const ref = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id, alignmentPolicy: 'STRICT_EQUAL' })
  const binary = (operator, left, right) => ({ nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) })
  const source = (await sql('SOURCE', "SELECT SUM(total_cost),SUM(drug_cost),SUM(material_cost),COUNT(DISTINCT VISIT_ID) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'", ['total', 'drug', 'material', 'visits']))[0]
  state.derivedFactors ||= []
  for (const [index, name, dimension, expected] of [[0, '药品与耗材总费用', 'SUM', Number(source.drug) + Number(source.material)], [1, '除药品耗材外医疗费用', 'SUM', Number(source.total) - Number(source.drug) - Number(source.material)], [2, '每出院人次非药非耗材费用', 'SUM_PER_COUNT', (Number(source.total) - Number(source.drug) - Number(source.material)) / Number(source.visits)]]) await run(`多层复合因子${name}`, async () => {
    const expression = index === 0 ? binary('ADD', ref(state.costFactors.drug.draftVersionId), ref(state.costFactors.material.draftVersionId)) : index === 1 ? binary('SUB', ref(state.costFactors.total.draftVersionId), ref(state.derivedFactors[0].draftVersionId)) : binary('DIV', ref(state.derivedFactors[1].draftVersionId), ref(state.costFactors.visits.draftVersionId))
    const dsl = { schemaVersion: '1.1', dslType: 'FACTOR', definitionKind: 'DERIVED', calculationMode: 'STATIC', primaryDomain: { domainCode: state.domain.code }, expression, output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension, grain: [] } }
    const factor = await remember('factors', await api('POST', '/factors', { code: `${tag}_DERIVED${index}`, name: fixtureName(`全量验收${name}复合因子`), dsl }))
    state.derivedFactors[index] = factor; await checkpoint()
    const compiled = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    check(`${name}冻结依赖编译通过`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)
    assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status))
    const trial = await api('POST', `/factor-versions/${factor.draftVersionId}/trial`, { parameters: {} })
    await poll(`/async-tasks/${trial.taskId}`)
    const results = await get(`/factor-versions/${factor.draftVersionId}/trials/${trial.batchId}/results?size=100`)
    check(`${name}试算与源库独立运算一致`, close(rows(results.results)[0]?.valueDecimal, expected), { results, expected })
    await api('POST', `/factor-versions/${factor.draftVersionId}/publish`, {})
    const instant = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { parameters: {} })
    check(`${name}即时查询与多层试算一致`, close(rows(instant)[0]?.factor_value, expected), instant)
    const batch = await get(`/calc/batches/${trial.batchId}`)
    const nodes = batch.targets.flatMap(target => target.nodes).filter(node => node.nodeType === 'FACTOR')
    check(`${name}依赖执行节点去重且全部成功`, nodes.length === new Set(nodes.map(node => node.nodeCode)).size && nodes.every(node => node.status === 'SUCCEEDED'), nodes)
    await save(`复合因子${name}`, { factor, compiled, results, source, batch })
  })
}

if (mode === '定时触发') {
  for (const [index, label, periodType, offset, start, end] of [[0, '月度', 'MONTHLY', 9, '2026-01-01', '2026-02-01'], [1, '季度', 'QUARTERLY', 3, '2026-01-01', '2026-04-01'], [2, '年度', 'YEARLY', 1, '2025-01-01', '2026-01-01']]) await run(`${label}定时触发完整链路`, async () => {
    const ownerVersionId = state.factors[0].draftVersionId
    const schedule = await api('POST', '/calc/schedules', { scheduleCode: `${tag}_LIVE${index}_${Date.now()}`, scheduleName: `全量验收${label}一次触发后停用`, ownerType: 'FACTOR', ownerVersionId, cronExpression: '*/20 * * * * *', timezone: 'Asia/Shanghai', periodType, periodOffset: offset, enabled: true })
    state.liveSchedules ||= []; state.liveSchedules.push(schedule); await checkpoint()
    let saved
    try {
      const deadline = Date.now() + 125000
      do {
        saved = await get(`/calc/schedules/${schedule.id}`)
        if (saved.lastTriggerAt || saved.lastError) break
        await new Promise(resolve => setTimeout(resolve, 1000))
      } while (Date.now() < deadline)
      check(`${label}由服务定时器实际触发且无错误`, Boolean(saved.lastTriggerAt) && !saved.lastError, saved)
      assert.ok(saved.lastTriggerAt && !saved.lastError)
    } finally {
      await api('PATCH', `/calc/schedules/${schedule.id}/status`, { enabled: false })
    }
    const dispatch = (await sql('PLATFORM', `SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.lastBatchId')) FROM job_calc_task WHERE id=${schedule.id}`, ['batch']))[0]
    assert.ok(dispatch.batch)
    const batch = await poll(`/calc/batches/${dispatch.batch}`, ['SUCCEEDED'])
    const period = (await sql('PLATFORM', `SELECT period_start_date,period_end_date FROM job_calc_batch WHERE id=${batch.batchId}`, ['start', 'end']))[0]
    check(`${label}按计划偏移生成正确周期`, period.start === start && period.end === end, period)
    const results = await sql('PLATFORM', `SELECT value_decimal FROM rsl_factor_result WHERE calc_target_id=${batch.targets[0].targetId} AND factor_version_id=${ownerVersionId}`, ['value'])
    const source = (await sql('SOURCE', `SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}'`, ['value']))[0]
    check(`${label}自动计算结果与相同周期源表一致`, results.length === 1 && close(results[0]?.value, source.value), { results, source })
    const stopped = await get(`/calc/schedules/${schedule.id}`)
    check(`${label}测试后立即停用且没有下次触发`, stopped.status === 'PAUSED' && stopped.nextTriggerAt === null)
    await save(`实际${label}触发证据`, { schedule, saved, stopped, batch, results, source })
  })
}

if (mode === '会话安全') {
  const { request } = createRequire(process.env.IDMP_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright')
  const role = (await get('/system/roles')).find(r => r.role.roleKey === 'DEPARTMENT_ANALYST')
  for (let index = 0; index < 3; index++) await run(`工号会话安全场景${index + 1}`, async () => {
    const username = `audit_session_${Date.now()}`, password = crypto.randomUUID()
    const userId = await api('POST', '/system/users', { user: { userName: username, nickName: `全量验收会话用户${index + 1}`, deptId: 2, status: '0', sex: '2', roleIds: [role.roleId] }, password })
    const client = await request.newContext({ baseURL: origin })
    try {
      await reject(`会话${index + 1}错误密码不颁发凭据`, 'POST', '/auth/login', { username, password: `${password}错` }, [401], { token: '' })
      const login = parse(await (await client.post('/api/v1/auth/login', { data: { username, password } })).text())
      assert.equal(login.code, 'OK', login.message)
      const token = login.data.accessToken
      const cookies = (await client.storageState()).cookies
      check(`会话${index + 1}刷新凭据只存HttpOnly Cookie`, cookies.some(c => /refresh/i.test(c.name) && c.httpOnly) && !login.data.refreshToken)
      const csrf = cookies.find(c => /csrf/i.test(c.name)); assert.ok(csrf)
      check(`会话${index + 1}CSRF Cookie对页面可读且路径正确`, !csrf.httpOnly && csrf.path === '/')
      const withoutCsrf = await client.post('/api/v1/auth/refresh')
      check(`会话${index + 1}无CSRF头刷新被拒绝`, withoutCsrf.status() === 403)
      const forgedOrigin = await client.post('/api/v1/auth/refresh', { headers: { 'X-CSRF-Token': csrf.value, Origin: new URL('https://伪造来源.invalid').origin } })
      check(`会话${index + 1}不可信来源刷新被拒绝`, forgedOrigin.status() === 403)
      const refreshResponse = await client.post('/api/v1/auth/refresh', { headers: { 'X-CSRF-Token': csrf.value } })
      const refreshed = parse(await refreshResponse.text())
      check(`会话${index + 1}合法刷新返回新访问凭据`, refreshResponse.status() === 200 && refreshed.data?.accessToken && refreshed.data.accessToken !== token)
      assert.ok(refreshed.data?.accessToken, refreshed.message)
      if (index === 0) {
        const latestCsrf = (await client.storageState()).cookies.find(c => /csrf/i.test(c.name))
        const logout = await client.post('/api/v1/auth/logout', { headers: { Authorization: `Bearer ${refreshed.data.accessToken}`, 'X-CSRF-Token': latestCsrf.value } })
        check('退出登录撤销当前会话', logout.status() === 200)
        await reject('退出后不能继续访问当前会话', 'GET', '/auth/me', undefined, [401], { token: refreshed.data.accessToken })
      } else if (index === 1) {
        await api('POST', '/auth/logout-all', {}, { token: refreshed.data.accessToken })
        await reject('全端退出使原凭据失效', 'GET', '/auth/me', undefined, [401], { token })
        await reject('全端退出使新凭据失效', 'GET', '/auth/me', undefined, [401], { token: refreshed.data.accessToken })
      } else {
        const detail = await get(`/system/users/${userId}`)
        await api('PUT', `/system/users/${userId}`, { ...detail.user, roleIds: [role.roleId], status: '1' })
        await reject('停用用户立即失去既有会话', 'GET', '/auth/me', undefined, [401, 403], { token: refreshed.data.accessToken })
        await reject('停用用户不能再次登录', 'POST', '/auth/login', { username, password }, [401, 403], { token: '' })
      }
    } finally {
      await client.dispose()
      await api('DELETE', `/system/users/${userId}`)
    }
  })
}
await finish(`补充${mode}`)
