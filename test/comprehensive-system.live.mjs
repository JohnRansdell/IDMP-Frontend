import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { api, get, rows, state, save, checkpoint, check, run, reject, poll, sql, close, remember, finish, admin, base, fixtureName } from './comprehensive-client.mjs'
import { buildFactorDsl } from '../src/idmp/utils/dslBuilder.js'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { buildArithmeticFormula } from '../src/idmp/features/indicator/arithmeticFormula.js'

const mode = process.argv[2] || '目录'
const time = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters: {} }
const tag = state.tag
const valid = compilation => ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status)

if (mode === '恢复清单') {
  state.costFactors ||= {}
  for (const item of rows(await get('/factors?size=100')).filter(item => item.code.startsWith(`${tag}_COST_`))) {
    const detail = await get(`/factors/${item.id}`)
    state.costFactors[item.code.slice(`${tag}_COST_`.length).toLowerCase()] = { ...detail, draftVersionId: detail.draftVersionId || item.publishedVersionId }
    if (!state.resources.some(resource => resource.id === item.id)) state.resources.push({ type: 'factors', id: item.id, name: item.name })
  }
  state.indicators ||= []
  for (const item of rows(await get('/indicators?size=100')).filter(item => item.code.startsWith(`${tag}_I`))) {
    const versions = rows(await get(`/indicators/${item.id}/versions`))
    state.indicators = state.indicators.filter(resource => resource.id !== item.id)
    state.indicators.push({ ...item, versionId: versions[0].id })
    if (!state.resources.some(resource => resource.id === item.id)) state.resources.push({ type: 'indicators', id: item.id, name: item.name })
  }
  check('独立验收资源清单恢复完整', Object.keys(state.costFactors).length === 4 && state.indicators.length === 3)
}

if (mode === '目录') {
  state.inventory = {}
  const paths = ['/health', '/auth/me', '/system/users', '/system/roles', '/system/depts', '/system/menus',
    '/me/notifications?page=1&size=5', '/me/notifications/unread-count', '/me/notification-bindings',
    '/indicators?page=1&size=100', '/indicator-versions?page=1&size=100', '/factors?page=1&size=100', '/factor-versions?page=1&size=100',
    '/factor-templates?page=1&size=100', '/scenarios?page=1&size=100', '/mappings/groups?page=1&size=100', '/mappings?page=1&size=100',
    '/meta/data-domains', '/meta/source-tables', '/meta/source-mappings?page=1&size=100', '/meta/physical-table-relations', '/meta/domain-relations',
    '/meta/value-sets?page=1&size=100', '/meta/drill-paths?page=1&size=100', '/meta/policy-files?page=1&size=100', '/meta/departments?page=1&size=500',
    '/analysis/warning-rules?page=1&size=100', '/analysis/warnings?page=1&size=100', '/analysis/dashboards', '/analysis/dashboard-data-sources',
    '/calc/schedules?page=1&size=100', '/factors/recycle-bin?page=1&size=100', '/indicators/recycle-bin?page=1&size=100']
  for (const path of paths) await run(`目录读取：${path}`, async () => {
    const data = await get(path)
    state.inventory[path.split('?')[0]] = data
    const list = rows(data), identified = list.filter(item => item.id != null)
    check(`资源标识无重复：${path}`, new Set(identified.map(item => String(item.id))).size === identified.length)
    if (data?.total != null) check(`分页总数合法：${path}`, Number(data.total) >= list.length)
  })
  await save('目录快照', state.inventory)
}

if (mode === '分页') {
  for (const path of ['/factors', '/indicators', '/factor-versions', '/indicator-versions', '/factor-templates', '/scenarios', '/mappings', '/meta/value-sets', '/meta/policy-files', '/analysis/warnings', '/analysis/warning-rules']) await run(`分页：${path}`, async () => {
    const first = await get(`${path}?page=1&size=3`), second = await get(`${path}?page=2&size=3`), combined = await get(`${path}?page=1&size=6`)
    const keys = data => rows(data).map(item => String(item.id))
    check(`跨页无重复无遗漏：${path}`, isDeepStrictEqual([...keys(first), ...keys(second)], keys(combined)))
    check(`更换页大小总数不变：${path}`, first.total === second.total && second.total === combined.total)
    const beyond = await get(`${path}?page=${Math.ceil(Number(first.total) / 3) + 1}&size=3`)
    check(`越界分页为空而非第一页：${path}`, rows(beyond).length === 0 && beyond.total === first.total)
  })
}

if (mode === '因子') {
  state.factors ||= []
  const cases = [
    ['男性出院人次', 'COUNT', '', { nodeType: 'PREDICATE', fieldCode: 'sex', operator: 'EQ', value: '1' }, "sex='1'", 'COUNT(*)'],
    ['非指定科室男性或死亡人次', 'COUNT', '', { nodeType: 'AND', children: [
      { nodeType: 'OR', children: [{ nodeType: 'PREDICATE', fieldCode: 'sex', operator: 'EQ', value: '1' }, { nodeType: 'PREDICATE', fieldCode: 'out_status', operator: 'EQ', value: '4' }] },
      { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'out_dept_code', operator: 'EQ', value: '9012' } }
    ] }, "(sex='1' OR out_status='4') AND NOT(out_dept_code='9012')", 'COUNT(*)'],
    ['出院总费用', 'SUM', 'total_cost', { nodeType: 'TRUE' }, '1=1', 'SUM(total_cost)']
  ]
  for (const [index, [name, aggregation, fieldCode, filters, where, aggregate]] of cases.entries()) await run(`因子生命周期：${name}`, async () => {
    const dsl = buildFactorDsl({ tableName: 'vmq_basicinformationba', aggregation, fieldCode, periodColumn: 'out_date', filters })
    const factor = await remember('factors', await api('POST', '/factors', { code: `${tag}_F${index}`, name: fixtureName(`全量验收${name}`), category: 'QUALITY', dsl }))
    const id = factor.draftVersionId
    state.factors.push({ ...factor, oracle: { where, aggregate } }); await checkpoint()
    const version = await get(`/factor-versions/${id}`)
    check(`${name}条件树保存不丢失`, isDeepStrictEqual(version.dsl.filters, filters))
    const compiled = await api('POST', `/factor-versions/${id}/compile`, {})
    check(`${name}编译通过`, valid(compiled), compiled)
    for (const month of [1, 2, 3]) {
      const start = `2026-0${month}-01`, end = `2026-0${month + 1}-01`
      const source = await sql('SOURCE', `SELECT ${aggregate} FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' AND (${where})`, ['value'])
      const query = await api('POST', `/factor-versions/${id}/query`, { ...time, periodStart: `${start}T00:00:00`, periodEnd: `${end}T00:00:00` })
      check(`${name}${month}月即时查询等于源数据`, rows(query).length === 1 && close(rows(query)[0].factor_value, source[0].value), { query, source })
      await save(`因子${index}月份${month}`, { query, source })
    }
    await reject(`${name}非法日期明确拒绝`, 'POST', `/factor-versions/${id}/query`, { ...time, periodStart: '错误日期' })
    const trial = await api('POST', `/factor-versions/${id}/trial`, time, { headers: { 'X-Idempotency-Key': `${tag}_F${index}_TRIAL` } })
    const repeat = await api('POST', `/factor-versions/${id}/trial`, time, { headers: { 'X-Idempotency-Key': `${tag}_F${index}_TRIAL` } })
    check(`${name}试算重放不重复计算`, trial.batchId === repeat.batchId && trial.taskId === repeat.taskId)
    await poll(`/async-tasks/${trial.taskId}`)
    const stored = await get(`/factor-versions/${id}/trials/${trial.batchId}/results?page=1&size=100`)
    const january = await import('node:fs/promises').then(fs => fs.readFile(`${process.env.IDMP_AUDIT_FOLDER || '.tmp/系统全量验收20261025'}/因子${index}月份1.json`, 'utf8')).then(JSON.parse)
    check(`${name}试算落库结果等于源数据`, rows(stored.results).length === 1 && close(rows(stored.results)[0].valueDecimal, january.source[0].value), stored)
    await api('POST', `/factor-versions/${id}/publish`, {})
    const published = await get(`/factor-versions/${id}`), fresh = await get(`/factors/${factor.id}`)
    check(`${name}发布状态正确`, published.status === 'PUBLISHED')
    await reject(`${name}已发布定义不可改`, 'PATCH', `/factors/${factor.id}`, { name: factor.name, resourceVersion: fresh.resourceVersion, factorVersionId: id, versionResourceVersion: published.resourceVersion, dsl: { ...dsl, filters: { nodeType: 'TRUE' } } })
  })
}

if (mode === '值集') {
  state.valueSets ||= []
  for (const [index, config] of [
    { name: '全量验收性别枚举', matchMode: 'EXACT', valueType: 'STRING', items: [{ code: 'MALE', value: '1', label: '男性', sortOrder: 0 }, { code: 'FEMALE', value: '2', label: '女性', sortOrder: 1 }] },
    { name: '全量验收转科小时范围', matchMode: 'RANGE', valueType: 'DECIMAL', items: [{ code: 'EARLY', valueStart: '0', valueEnd: '48', label: '入院四十八小时内', sortOrder: 0 }, { code: 'LATE', valueStart: '49', valueEnd: '120', label: '入院四十八小时后', sortOrder: 1 }] },
    { name: '全量验收住院小时连续范围', matchMode: 'CONTINUOUS', valueType: 'DECIMAL', continuousSpec: { unit: 'HOUR', precision: 12, scale: 6, minimumValue: '0', maximumValue: `48.${tag.replace(/\D/g, '').slice(-6)}`, minimumInclusive: true, maximumInclusive: true } }
  ].entries()) await run(config.name, async () => {
    const { items, ...payload } = config
    let detail = await api('POST', '/meta/value-sets', { ...payload, code: `${tag}_VS${index}` })
    state.valueSets.push({ id: detail.valueSet.id, versionId: detail.version.id, ...config }); await checkpoint()
    const id = detail.version.id
    if (items) detail = await api('PUT', `/meta/value-set-versions/${id}/items`, { resourceVersion: detail.version.resourceVersion, items })
    const stored = await get(`/meta/value-set-versions/${id}`)
    check(`${config.name}边界与标签完整保存`, items ? items.every((item, i) => Object.entries(item).every(([key, value]) => stored.version.items[i][key] === value)) : Object.entries(config.continuousSpec).every(([key, value]) => stored.version.continuousSpec[key] === value))
    const validation = await api('POST', `/meta/value-set-versions/${id}/validate`, {})
    check(`${config.name}校验通过`, validation.valid, validation)
    detail = await api('POST', `/meta/value-sets/${detail.valueSet.id}/versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
    check(`${config.name}发布版本指针一致`, detail.valueSet.currentPublishedVersionId === id && detail.version.publicationStatus === 'PUBLISHED')
    const copy = await api('POST', `/meta/value-sets/${detail.valueSet.id}/versions`, { copyFromVersionId: id })
    check(`${config.name}复制为新草稿且不丢定义`, copy.version.id !== id && copy.version.publicationStatus === 'DRAFT' && (items ? copy.version.items.length === 2 : copy.version.continuousSpec.maximumValue === config.continuousSpec.maximumValue))
    if (items) {
      const bad = structuredClone(items)
      if (config.matchMode === 'EXACT') bad[1].value = '1'
      else bad[1].valueStart = '40'
      const written = await api('PUT', `/meta/value-set-versions/${copy.version.id}/items`, { resourceVersion: copy.version.resourceVersion, items: bad }, { allowError: true })
      const negative = written.http === 200 ? await api('POST', `/meta/value-set-versions/${copy.version.id}/validate`, {}) : null
      check(`${config.name}重复或重叠值不能发布`, negative ? !negative.valid : [400, 409, 422].includes(written.http), written)
    } else await reject(`${config.name}最小值不能大于最大值`, 'PATCH', `/meta/value-set-versions/${copy.version.id}`, { resourceVersion: copy.version.resourceVersion, ...payload, continuousSpec: { ...config.continuousSpec, minimumValue: '49' } })
  })
}

if (mode === '看板') {
  const board = rows(await get('/analysis/dashboards')).find(item => item.name === '质量安全看板真实指标验收')
  assert.ok(board)
  state.boardId = board.id
  const definition = await get(`/analysis/dashboards/${board.id}`)
  state.board = definition; await checkpoint()
  const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
  for (const [name, periodStart, periodEnd, granularity] of [
    ['一月', '2026-01-01', '2026-02-01', 'MONTHLY'], ['一季度', '2026-01-01', '2026-04-01', 'QUARTERLY'], ['二至四月自定义', '2026-02-01', '2026-05-01', 'CUSTOM']
  ]) await run(`看板${name}`, async () => {
    const payload = { periodStart, periodEnd, granularity, responseFormat: 'FULL', widgetCodes: definition.version.widgets.filter(widget => !/warning|alert/i.test(widget.type)).map(widget => widget.code) }
    const full = await api('POST', `/analysis/dashboards/${board.id}/query`, payload)
    const compact = expandDashboardResponse(await api('POST', `/analysis/dashboards/${board.id}/query`, { ...payload, responseFormat: 'COLUMNAR' }))
    const scoped = await api('POST', `/analysis/dashboards/${board.id}/query`, payload, { token: analyst })
    for (const [code, widget] of Object.entries(full.widgets)) {
      check(`${name}${code}无异常组件`, widget.status === 'READY' || widget.status === 'EMPTY', { status: widget.status, message: widget.message })
      check(`${name}${code}精简与完整响应值相同`, isDeepStrictEqual(widget.rows, compact.widgets[code]?.rows), { full: widget.rows?.length, compact: compact.widgets[code]?.rows?.length })
      const ratios = (widget.rows || []).filter(row => row.numeratorValue != null && Number(row.denominatorValue) > 0)
      check(`${name}${code}所有行比率等于分子除分母`, ratios.every(row => close(row.value, Number(row.numeratorValue) / Number(row.denominatorValue))), ratios.filter(row => !close(row.value, Number(row.numeratorValue) / Number(row.denominatorValue))))
      const own = scoped.widgets[code]
      check(`${name}${code}本科室无加载错误或安全拒绝全院结果`, ['READY', 'EMPTY'].includes(own?.status) || own?.status === 'FORBIDDEN' && own.rows?.length === 0 && /科室/.test(own.message), { status: own?.status, message: own?.message })
      for (const row of own?.rows || []) for (const [key, value] of Object.entries(row)) if (/^(out_?dept_?code|dept_?code|科室)$/i.test(key)) check(`${name}${code}无跨科室数据`, String(value) === '15', { key, value })
    }
    await save(`看板${name}`, { payload, full, compact, scoped })
  })
}

if (mode === '指标') {
  state.costFactors ||= {}
  const filters = { nodeType: 'AND', children: [
    { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'GTE', value: '2026-01-01 00:00:00' },
    { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'LT', value: '2026-02-01 00:00:00' }
  ] }
  const source = (await sql('SOURCE', "SELECT SUM(total_cost),SUM(drug_cost),SUM(material_cost),COUNT(DISTINCT VISIT_ID) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'", ['total', 'drug', 'material', 'visits']))[0]
  state.costSource = source
  for (const [key, name, aggregation, fieldCode] of [['total', '出院总费用', 'SUM', 'total_cost'], ['drug', '出院药品费用', 'SUM', 'drug_cost'], ['material', '出院耗材费用', 'SUM', 'material_cost'], ['visits', '出院患者去重人次', 'COUNT_DISTINCT', 'VISIT_ID']]) {
    if (state.costFactors[key]) continue
    const dsl = buildFactorDsl({ tableName: 'vmq_basicinformationba', aggregation, fieldCode, calculationMode: 'STATIC', filters })
    const factor = await remember('factors', await api('POST', '/factors', { code: `${tag}_COST_${key.toUpperCase()}`, name: fixtureName(`全量验收一月${name}`), dsl }))
    state.costFactors[key] = factor; await checkpoint()
    const compiled = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    check(`${name}静态编译通过`, valid(compiled), compiled)
    const trial = await api('POST', `/factor-versions/${factor.draftVersionId}/trial`, { parameters: {} })
    await poll(`/async-tasks/${trial.taskId}`)
    await api('POST', `/factor-versions/${factor.draftVersionId}/publish`, {})
    const result = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { parameters: {} })
    check(`${name}源数据一致`, close(rows(result)[0]?.factor_value, source[key]), { result, source })
  }
  const ref = key => ({ nodeType: 'FACTOR_REF', factorVersionId: state.costFactors[key].draftVersionId })
  const c = (value, dimension = 'ONE') => ({ nodeType: 'CONST', value: String(value), typeDescriptor: { unit: 'ONE', dimension, valueType: 'DECIMAL' } })
  const b = (operator, left, right, policy = 'RETURN_NULL') => ({ nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: policy } : {}) })
  const f = (functionCode, args, extra = {}) => ({ nodeType: 'FUNCTION', functionCode, arguments: args, ...extra })
  const net = () => b('SUB', ref('total'), b('ADD', ref('drug'), ref('material')))
  const ratio = () => b('DIV', ref('drug'), ref('total'))
  const cases = [
    ['每百出院人次非药非耗材费用', f('ROUND', [b('MUL', b('DIV', net(), ref('visits')), c(100))], { scale: 2, roundingMode: 'HALF_UP' }), Math.round((Number(source.total) - Number(source.drug) - Number(source.material)) / Number(source.visits) * 10000) / 100],
    ['住院药品费用比例限幅', f('CLAMP', [ratio(), c(0, 'RATIO'), c(1, 'RATIO')]), Math.max(0, Math.min(1, Number(source.drug) / Number(source.total)))],
    ['药费超三成时每人次非药费用', f('IF', [{ nodeType: 'COMPARE', comparator: 'GT', left: ratio(), right: c('0.3', 'RATIO') }, b('DIV', b('SUB', ref('total'), ref('drug')), ref('visits')), b('DIV', ref('total'), ref('visits'))]), Number(source.drug) / Number(source.total) > 0.3 ? (Number(source.total) - Number(source.drug)) / Number(source.visits) : Number(source.total) / Number(source.visits)]
  ]
  state.indicators ||= []
  for (const [index, [name, root, expected]] of cases.entries()) await run(`多因子指标：${name}`, async () => {
    const existing = state.indicators.find(item => item.code === `${tag}_I${index}`)
    const indicator = existing || await remember('indicators', await api('POST', '/indicators', { code: `${tag}_I${index}`, name: `全量验收${name}`, category: 'QUALITY' }))
    const formula = buildArithmeticFormula(root, { calculationMode: 'STATIC', display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' } })
    let version
    if (existing) {
      version = await get(`/indicator-versions/${existing.versionId}`)
      await api('PUT', `/indicator-versions/${version.id}/formula`, { formula, resourceVersion: version.version })
      version = await get(`/indicator-versions/${version.id}`)
    } else version = await api('POST', `/indicators/${indicator.id}/versions`, { calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [], formula })
    state.indicators = state.indicators.filter(item => item.code !== indicator.code)
    state.indicators.push({ ...indicator, versionId: version.id, expected, formula }); await checkpoint()
    check(`${name}公式树往返一致`, isDeepStrictEqual(version.formula.root, formula.root))
    const compiled = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
    check(`${name}编译通过`, valid(compiled), compiled)
    assert.ok(valid(compiled))
    const query = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} })
    check(`${name}即时数值与独立源表运算一致`, rows(query).length === 1 && close(rows(query)[0].value, expected), { query, expected })
    const trial = await api('POST', `/indicator-versions/${version.id}/trial`, { parameters: {} })
    await poll(`/async-tasks/${trial.taskId}`)
    const results = await get(`/indicator-versions/${version.id}/trials/${trial.batchId}/results?page=1&size=100`)
    check(`${name}试算数值与独立源表运算一致`, close(rows(results.results || results.targets?.[0]?.results)[0]?.resultValue, expected), { results, expected })
    await api('POST', `/indicator-versions/${version.id}/publish`, {})
    version = await get(`/indicator-versions/${version.id}`)
    await reject(`${name}发布后公式不可修改`, 'PUT', `/indicator-versions/${version.id}/formula`, { formula, resourceVersion: version.version })
    const formal = await api('POST', '/calc/batches', { ownerType: 'INDICATOR', ownerVersionId: version.id, batchType: 'FULL', periodType: 'STATIC' }, { headers: { 'X-Idempotency-Key': `${tag}_FORMAL${index}` } })
    await poll(`/async-tasks/${formal.taskId}`)
    const batch = await get(`/calc/batches/${formal.batchId}`)
    const formulaNode = batch.targets.flatMap(t => t.nodes).find(node => node.nodeType === 'FORMULA')
    check(`${name}正式结果与即时试算一致`, close(formulaNode?.resultSummary?.singleResult?.value, expected), formulaNode)
    const trace = await get(`/analysis/results/${formulaNode.resultSummary.singleResult.resultId}/factors`)
    check(`${name}血缘批次与配置快照对应`, String(trace.context.calculationBatchId) === String(formal.batchId) && trace.factors.every(item => item.resultMatched))
    for (const node of batch.targets.flatMap(t => t.nodes).filter(n => ['FACTOR', 'FORMULA'].includes(n.nodeType))) {
      const detail = await get(`/calc/nodes/${node.nodeId}/results?pageNum=1&pageSize=20`)
      check(`${name}节点分页结果和概览一致`, close(rows(detail.results)[0]?.value ?? rows(detail.results)[0]?.resultValue ?? rows(detail.results)[0]?.valueDecimal, node.resultSummary.singleResult.value), detail)
    }
    await save(`指标${index}完整链路`, { query, results, formal, batch, trace, source, expected })
  })
}

if (mode === '文件') {
  const options = await get('/meta/file-objects/upload-options')
  check('政策上传限制为一百兆', Number(options.maxBytes) === 100 * 1024 * 1024, options)
  state.files ||= []
  for (const [index, content] of ['医疗质量验收政策依据\n男性出院人次除以全部出院人次。', '中药费用除以药品费用，按科室和医生分别计算。\n'.repeat(1000), ''].entries()) await run(`文件样例${index + 1}`, async () => {
    const bytes = Buffer.from(content), hash = createHash('sha256').update(bytes).digest('hex'), name = `全量验收政策依据${index + 1}.txt`
    const form = new FormData(); form.append('file', new Blob([bytes]), name); form.append('sha256', hash)
    const response = await fetch(base + '/meta/file-objects/upload', { method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: form })
    const result = parse(await response.text())
    if (!bytes.length) { check('空政策文件明确拒绝', [400, 422].includes(response.status), result); return }
    assert.equal(response.status, 200, result.message)
    const file = result.data.file
    state.files.push(file); await checkpoint()
    check(`${name}大小和哈希与内容一致`, Number(file.fileSizeBytes) === bytes.length && file.sha256 === hash)
    const downloaded = await fetch(`${base}/meta/file-objects/${file.id}/content`, { headers: { Authorization: `Bearer ${admin}` } })
    check(`${name}下载字节完全相同`, downloaded.ok && Buffer.from(await downloaded.arrayBuffer()).equals(bytes))
    const partial = await fetch(`${base}/meta/file-objects/${file.id}/content`, { headers: { Authorization: `Bearer ${admin}`, Range: 'bytes=0-15' } })
    const actual = Buffer.from(await partial.arrayBuffer())
    check(`${name}范围下载不损坏内容`, partial.status === 206 ? actual.equals(bytes.subarray(0, 16)) : partial.status === 200 && actual.equals(bytes))
    const dedup = await api('POST', '/meta/file-objects/check', { sha256: hash, originalName: name, fileSizeBytes: bytes.length })
    check(`${name}去重返回同一文件`, dedup.instantUpload && dedup.file.id === file.id)
  })
}

await finish(mode)
