import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { parseJsonPreservingLargeIntegers as parse } from '../src/idmp/api/request.js'
import { buildFactorDsl } from '../src/idmp/utils/dslBuilder.js'
import { createArithmeticNode, buildArithmeticFormula, arithmeticFormulaError } from '../src/idmp/features/indicator/arithmeticFormula.js'
import { newDerivedFactor } from '../src/idmp/utils/derivedFactor.js'
import { tableRelationPayload } from '../src/idmp/utils/tableRelation.js'

const base = `${process.env.IDMP_FRONTEND_URL || 'http://127.0.0.1:5177'}/api/v1`
const folder = '.tmp/full-system-audit-20261023'
await mkdir(folder, { recursive: true })
const state = await readFile(`${folder}/resources.json`).then(JSON.parse).catch(() => ({ tag: `QA_ALL_${Date.now()}`, factors: [], indicators: [] }))
const checks = [], calls = []
const save = (name, data) => writeFile(`${folder}/${name}.json`, JSON.stringify(data, null, 2))
const checkpoint = () => save('resources', state)
const rows = data => Array.isArray(data) ? data : data?.records || data?.items || data?.rows || []
const mode = process.argv[2] || 'inventory'
const exec = promisify(execFile)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function check(name, ok, detail) {
  checks.push({ name, passed: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${String(JSON.stringify(detail)).slice(0, 1800)}`}`)
}
async function run(name, work) { try { await work() } catch (error) { check(name, false, { message: error.message, stack: error.stack?.split('\n').slice(0, 4) }) } }
async function api(method, path, body, { allowError = false, headers = {} } = {}) {
  const started = performance.now()
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) })
  const result = parse(await response.text())
  calls.push({ method, path, http: response.status, code: result.code, ms: Math.round(performance.now() - started) })
  if (allowError) return { ...result, http: response.status }
  assert.ok(response.ok && ['OK', 'ACCEPTED', '0'].includes(String(result.code)), `${method} ${path}: ${response.status} ${result.message}`)
  return result.data
}
const get = path => api('GET', path)
async function expectRejected(name, method, path, body, statuses = [400, 409, 422]) {
  const error = await api(method, path, body, { allowError: true })
  check(name, statuses.includes(error.http) && !/Exception|StackTrace|SQLSyntax|org\.springframework/i.test(error.message || ''), { http: error.http, code: error.code, message: error.message })
  return error
}
async function sql(database, query, columns) {
  assert.ok(['SOURCE', 'PLATFORM'].includes(database))
  assert.match(query.trim(), /^(SELECT|WITH)\b/i)
  const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`
  const { stdout } = await exec('ssh', ['lab-server', `python3 /home/tjg/idmp-deploy/inspect-departments.py ${database} ${quote(query)}`], { timeout: 120000, maxBuffer: 12 * 1024 * 1024 })
  return stdout.trimEnd().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('\t').map((value, index) => [columns[index], value === 'NULL' ? null : value])))
}
async function poll(path, completed = ['SUCCEEDED', 'SUCCESS', 'COMPLETED'], limit = 120000) {
  const deadline = Date.now() + limit
  while (Date.now() < deadline) {
    const result = await get(path)
    if (completed.includes(result.status)) return result
    assert.ok(!['FAILED', 'PARTIAL_FAILED', 'CLEANUP_FAILED', 'CANCELLED'].includes(result.status), JSON.stringify(result).slice(0, 3000))
    await pause(1000)
  }
  throw new Error(`Timeout polling ${path}`)
}
const close = (a, b, tolerance = 1e-8) => a == null || b == null ? a == b : Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) <= tolerance
const time = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00', parameters: {} }

if (mode === 'inventory') {
  const inventory = {}
  for (const path of ['/health', '/system/users', '/me/notifications?page=1&size=5', '/me/notifications/unread-count',
    '/indicators?page=1&size=100', '/indicator-versions?page=1&size=100', '/factors?page=1&size=100', '/factor-versions?page=1&size=100',
    '/factor-templates?publicationStatus=&page=1&size=100', '/scenarios?page=1&size=100', '/mappings/groups?page=1&size=100', '/mappings?page=1&size=100',
    '/meta/data-domains', '/meta/source-tables', '/meta/source-mappings?page=1&size=100', '/meta/physical-table-relations', '/meta/domain-relations',
    '/meta/value-sets?page=1&size=100', '/meta/drill-paths?page=1&size=100', '/meta/policy-files?page=1&size=100',
    '/analysis/warning-rules?page=1&size=100', '/analysis/warnings?page=1&size=100', '/analysis/dashboards', '/analysis/dashboard-data-sources',
    '/calc/schedules?page=1&size=100', '/factors/recycle-bin?page=1&size=100', '/indicators/recycle-bin?page=1&size=100']) await run(`inventory ${path}`, async () => {
    const data = await get(path)
    inventory[path.split('?')[0]] = data
    const records = rows(data)
    check(`inventory ${path} identities`, records.filter(item => item.id != null).length === new Set(records.filter(item => item.id != null).map(item => item.id)).size, { count: records.length, total: data?.total })
    if (data?.total != null) check(`inventory ${path} page count`, Number(data.total) >= records.length, { count: records.length, total: data.total })
    console.log(JSON.stringify({ path, count: records.length, total: data?.total, sample: records.slice(0, 1) }).slice(0, 1600))
  })
  await save('inventory', inventory)
  for (const path of ['/auth/me', '/me/notification-bindings']) await run(`anonymous ${path}`, async () => {
    const result = await api('GET', path, undefined, { allowError: true })
    check(`anonymous ${path} refuses identity`, result.http === 401, { http: result.http, code: result.code })
  })
}

if (mode === 'factors') await run('factor lifecycle and oracle', async () => {
  const dsl = buildFactorDsl({ tableName: 'vmq_basicinformationba', aggregation: 'COUNT', periodColumn: 'out_date',
    filters: { nodeType: 'AND', children: [{ nodeType: 'OR', children: [
      { nodeType: 'PREDICATE', fieldCode: 'sex', operator: 'EQ', value: '1' },
      { nodeType: 'PREDICATE', fieldCode: 'out_status', operator: 'EQ', value: '4' }
    ] }, { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'out_dept_code', operator: 'EQ', value: '9012' } }] } })
  let factor = await api('POST', '/factors', { code: `${state.tag}_NESTED_F`, name: `男性或死亡且非指定科室 ${state.tag}`, category: 'QUALITY', dsl })
  state.factors.push({ id: factor.id, versionId: factor.draftVersionId, code: factor.code }); await checkpoint()
  let version = await get(`/factor-versions/${factor.draftVersionId}`)
  check('factor nested DSL round trip', isDeepStrictEqual(version.dsl.filters, dsl.filters), version.dsl.filters)
  const updatedDsl = { ...dsl, missingRowPolicy: 'ZERO' }
  factor = await api('PATCH', `/factors/${factor.id}`, { name: factor.name, description: 'isolated all-function audit', category: 'QUALITY', resourceVersion: factor.resourceVersion,
    dsl: updatedDsl, factorVersionId: version.id, versionResourceVersion: version.resourceVersion })
  version = await get(`/factor-versions/${version.id}`)
  check('draft factor DSL editable', version.dsl.missingRowPolicy === 'ZERO')
  await expectRejected('stale factor metadata version rejected', 'PATCH', `/factors/${factor.id}`, { name: 'stale write', resourceVersion: Number(factor.resourceVersion) - 1 })
  const compilation = await api('POST', `/factor-versions/${version.id}/compile`, {})
  await save('factor-compilation', compilation)
  check('nested physical-source factor compilation valid', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  const [source] = await sql('SOURCE', "SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' AND (sex='1' OR out_status='4') AND NOT(out_dept_code='9012')", ['value'])
  const result = await api('POST', `/factor-versions/${version.id}/query`, time)
  await save('factor-query', { result, source })
  check('nested AND OR NOT value matches source', rows(result.results || result).length === 1 && close(rows(result.results || result)[0].factor_value, source.value), { result, source })
  const accepted = await api('POST', `/factor-versions/${version.id}/trial`, time, { headers: { 'X-Idempotency-Key': `${state.tag}_F_TRIAL` } })
  state.factorTrial = accepted; await checkpoint()
  const replay = await api('POST', `/factor-versions/${version.id}/trial`, time, { headers: { 'X-Idempotency-Key': `${state.tag}_F_TRIAL` } })
  check('same factor trial key reuses task', accepted.taskId === replay.taskId && accepted.batchId === replay.batchId, { accepted, replay })
  const task = await poll(`/async-tasks/${accepted.taskId}`)
  const results = await get(`/factor-versions/${version.id}/trials/${accepted.batchId}/results?page=1&size=100`)
  check('saved factor trial matches independent source', rows(results.results).length === 1 && close(rows(results.results)[0].valueDecimal, source.value), { task, results, source })
  await save('factor-trial', { task, results, source })
  const published = await api('POST', `/factor-versions/${version.id}/publish`, {})
  check('factor published version identity preserved', published.id === version.id || published.factorVersionId === version.id, published)
  factor = await get(`/factors/${factor.id}`); version = await get(`/factor-versions/${version.id}`)
  await expectRejected('published DSL immutable', 'PATCH', `/factors/${factor.id}`, { name: factor.name, resourceVersion: factor.resourceVersion, dsl: { ...updatedDsl, filters: { nodeType: 'TRUE' } }, factorVersionId: version.id, versionResourceVersion: version.resourceVersion })
  state.nestedFactor = { factor, version, source }; await checkpoint()
})

if (mode === 'factor-review') await run('factor evidence review', async () => {
  const { version } = state.nestedFactor
  const expected = { nodeType: 'AND', children: [{ nodeType: 'OR', children: [
    { nodeType: 'PREDICATE', fieldCode: 'sex', operator: 'EQ', value: '1' }, { nodeType: 'PREDICATE', fieldCode: 'out_status', operator: 'EQ', value: '4' }
  ] }, { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'out_dept_code', operator: 'EQ', value: '9012' } }] }
  check('factor nested DSL round trip independent of JSON key order', isDeepStrictEqual((await get(`/factor-versions/${version.id}`)).dsl.filters, expected))
  const [source] = await sql('SOURCE', "SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' AND (sex='1' OR out_status='4') AND NOT(out_dept_code='9012')", ['value'])
  const query = await api('POST', `/factor-versions/${version.id}/query`, time)
  const trial = await get(`/factor-versions/${version.id}/trials/${state.factorTrial.batchId}/results?page=1&size=100`)
  check('factor ad hoc independent source reconciliation', rows(query).length === 1 && close(rows(query)[0].factor_value, source.value), { query, source })
  check('factor saved trial independent source reconciliation', rows(trial.results).length === 1 && close(rows(trial.results)[0].valueDecimal, source.value), { trial, source })
})

if (mode === 'valuesets') {
  for (const continuous of [false, true]) await run(`valueset ${continuous ? 'range' : 'exact'} lifecycle`, async () => {
    const suffix = continuous ? 'RANGE_ITEMS' : 'DISCRETE'
    let detail = await api('POST', '/meta/value-sets', { code: `${state.tag}_${suffix}`, name: `${suffix} ${state.tag}`,
      matchMode: continuous ? 'RANGE' : 'EXACT', valueType: continuous ? 'DECIMAL' : 'STRING' })
    ;(state.valuesets ||= []).push({ id: detail.valueSet.id, versionId: detail.version.id, code: detail.valueSet.code }); await checkpoint()
    const id = detail.version.id
    const items = continuous ? [{ code: 'EARLY', valueStart: '0', valueEnd: '48', label: '48 hours', sortOrder: 0 }, { code: 'LATE', valueStart: '49', valueEnd: '120', label: 'late', sortOrder: 1 }]
      : [{ code: 'MALE', value: '1', label: 'male', sortOrder: 0 }, { code: 'FEMALE', value: '2', label: 'female', sortOrder: 1 }]
    detail = await api('PUT', `/meta/value-set-versions/${id}/items`, { resourceVersion: detail.version.resourceVersion, items })
    check(`${suffix} item round trip`, detail.version.items.length === 2 && items.every((item, index) => Object.entries(item).every(([key, value]) => detail.version.items[index][key] === value)), detail)
    await expectRejected(`${suffix} stale items rejected`, 'PUT', `/meta/value-set-versions/${id}/items`, { resourceVersion: detail.version.resourceVersion - 1, items })
    const validation = await api('POST', `/meta/value-set-versions/${id}/validate`, {})
    check(`${suffix} valid metadata`, validation.valid, validation)
    detail = await api('POST', `/meta/value-sets/${detail.valueSet.id}/versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
    check(`${suffix} published pointer`, detail.valueSet.currentPublishedVersionId === id && detail.version.publicationStatus === 'PUBLISHED', detail)
    await expectRejected(`${suffix} published items immutable`, 'PUT', `/meta/value-set-versions/${id}/items`, { resourceVersion: detail.version.resourceVersion, items: [] })
    const copied = await api('POST', `/meta/value-sets/${detail.valueSet.id}/versions`, { copyFromVersionId: id })
    check(`${suffix} copy preserves items but new identity`, copied.version.id !== id && copied.version.items.length === 2 && copied.version.publicationStatus === 'DRAFT', copied)
    const invalid = items.map(item => ({ ...item }))
    if (continuous) { invalid[1].valueStart = '40' } else { invalid[1].value = '1' }
    const invalidWrite = await api('PUT', `/meta/value-set-versions/${copied.version.id}/items`, { resourceVersion: copied.version.resourceVersion, items: invalid }, { allowError: true })
    if (invalidWrite.http >= 400) check(`${suffix} invalid duplicate or overlap refused at save`, [400, 409, 422].includes(invalidWrite.http), invalidWrite)
    else {
      const invalidValidation = await api('POST', `/meta/value-set-versions/${copied.version.id}/validate`, {})
      check(`${suffix} invalid duplicate or overlap fails validation`, !invalidValidation.valid && invalidValidation.diagnostics.length > 0, invalidValidation)
    }
    await save(`valueset-${suffix}`, { detail, copied, invalidWrite })
  })
  await run('continuous specification lifecycle', async () => {
    const previous = state.valuesets.find(item => item.code.endsWith('_RANGE'))
    let detail = await get(`/meta/value-set-versions/${previous.versionId}`)
    const spec = { unit: 'HOUR', precision: 10, scale: 2, minimumValue: '0', maximumValue: '48', minimumInclusive: true, maximumInclusive: true }
    detail = await api('PATCH', `/meta/value-set-versions/${previous.versionId}`, { resourceVersion: detail.version.resourceVersion, name: detail.valueSet.name, matchMode: 'CONTINUOUS', valueType: 'DECIMAL', continuousSpec: spec })
    check('continuous bounds persist exactly', isDeepStrictEqual(detail.version.continuousSpec, { ...spec, timeGranularity: null, timezone: null }), detail)
    await expectRejected('continuous valueset refuses enum items', 'PUT', `/meta/value-set-versions/${previous.versionId}/items`, { resourceVersion: detail.version.resourceVersion, items: [] })
    const validation = await api('POST', `/meta/value-set-versions/${previous.versionId}/validate`, {})
    check('continuous specification validates', validation.valid, validation)
    detail = await api('POST', `/meta/value-sets/${previous.id}/versions/${previous.versionId}/publish`, { resourceVersion: validation.resourceVersion })
    check('continuous publish preserves boundary inclusivity', detail.version.publicationStatus === 'PUBLISHED' && detail.version.continuousSpec.maximumInclusive === true)
    const copy = await api('POST', `/meta/value-sets/${previous.id}/versions`, { copyFromVersionId: previous.versionId })
    await expectRejected('continuous minimum greater than maximum rejected', 'PATCH', `/meta/value-set-versions/${copy.version.id}`, { resourceVersion: copy.version.resourceVersion, name: detail.valueSet.name, matchMode: 'CONTINUOUS', valueType: 'DECIMAL', continuousSpec: { ...spec, minimumValue: '49' } })
  })
}

if (mode === 'metadata') await run('isolated domain physical binding', async () => {
  const domain = await api('POST', '/meta/data-domains', { code: `${state.tag}_DOMAIN`, name: `domain ${state.tag}`, description: 'isolated test domain' })
  state.domain = domain; await checkpoint()
  const tableName = 'vmq_basicinformationba'
  const binding = await api('POST', `/meta/data-domains/${domain.id}/physical-tables`, { tableName })
  check('domain physical table identity', binding.domainId === domain.id && binding.tableName.toLowerCase() === tableName, binding)
  const definitions = [
    { sourceFieldName: 'sex', code: 'QA_SEX', name: 'gender', dataType: 'STRING', semanticKind: 'DIMENSION', sensitive: false },
    { sourceFieldName: 'out_date', code: 'QA_OUT_DATE', name: 'discharge date', dataType: 'DATETIME', semanticKind: 'TIME', sensitive: false },
    { sourceFieldName: 'out_dept_code', code: 'QA_DEPT', name: 'department', dataType: 'STRING', semanticKind: 'DIMENSION', sensitive: false }
  ]
  const fields = []
  for (const definition of definitions) fields.push(await api('POST', `/meta/data-domains/${domain.id}/physical-tables/${tableName}/semantic-fields`, definition))
  check('semantic fields preserve source mapping and types', definitions.every((definition, index) => fields[index].code === definition.code && fields[index].dataType === definition.dataType && fields[index].sourceFieldName.toLowerCase() === definition.sourceFieldName), fields)
  await api('PATCH', `/meta/data-domains/${domain.id}/physical-tables/${tableName}/default-time-field`, { semanticFieldCode: 'QA_OUT_DATE' })
  check('default date field round trip', rows(await get(`/meta/data-domains/${domain.id}/physical-tables`)).some(item => item.defaultTimeSemanticFieldCode === 'QA_OUT_DATE'))
  await expectRejected('non-time field cannot be default date', 'PATCH', `/meta/data-domains/${domain.id}/physical-tables/${tableName}/default-time-field`, { semanticFieldCode: 'QA_SEX' })
  const valueSet = state.valuesets.find(item => item.code.endsWith('DISCRETE'))
  await api('PUT', `/meta/semantic-fields/${fields[0].id}/value-set`, { valueSetVersionId: valueSet.versionId })
  const association = await get(`/meta/semantic-fields/${fields[0].id}/value-set`)
  check('semantic field binds exact published value set version', association.valueSetVersionId === valueSet.versionId, association)
  const dsl = buildFactorDsl({ domainCode: domain.code, tableName, aggregation: 'COUNT', periodColumn: 'QA_OUT_DATE', filters: { nodeType: 'PREDICATE', fieldCode: 'QA_SEX', operator: 'EQ', value: '1' } })
  const factor = await api('POST', '/factors', { code: `${state.tag}_DOMAIN_F`, name: `domain male ${state.tag}`, dsl })
  state.factors.push({ id: factor.id, versionId: factor.draftVersionId, code: factor.code }); await checkpoint()
  const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
  check('domain semantic factor compiles', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  const result = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, time)
  const [source] = await sql('SOURCE', "SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' AND sex='1'", ['value'])
  check('domain semantic query equals physical source oracle', rows(result).length === 1 && close(rows(result)[0].factor_value, source.value), { result, source })
  await save('metadata-domain', { domain, binding, fields, association, result, source })
})

if (mode === 'templates') await run('parameterized template lifecycle', async () => {
  const dsl = buildFactorDsl({ domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', aggregation: 'COUNT', calculationMode: 'STATIC', filters: { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: '3' } })
  dsl.filters.value = { parameterRef: 'level' }
  const parameters = [{ code: 'level', displayName: 'surgery level', dataType: 'STRING', required: true, exposed: true, valueSourceType: 'MANUAL', defaultValue: '3', displayOrder: 0 }]
  let detail = await get(`/factor-template-versions/${state.template.versionId}`)
  detail = await api('PATCH', `/factor-template-versions/${detail.version.id}`, { resourceVersion: detail.version.resourceVersion, templateDefinition: dsl, parameters })
  state.template = { id: detail.template.id, versionId: detail.version.id }; await checkpoint()
  const id = detail.version.id
  await expectRejected('draft template cannot instantiate', 'POST', `/factor-template-versions/${id}/instantiate`, { factorCode: `${state.tag}_BAD_TPL`, factorName: 'not published', parameterValues: {} })
  const validation = await api('POST', `/factor-template-versions/${id}/validate`, {})
  check('parameterized template validation', validation.valid, validation)
  detail = await api('POST', `/factor-template-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
  check('published template pointer', detail.template.currentPublishedVersionId === id && detail.version.publicationStatus === 'PUBLISHED', detail)
  const schema = await get(`/factor-templates/${detail.template.id}/parameter-schema`)
  check('template exposed parameter schema', schema.parameters.some(item => item.code === 'level' && item.exposed && item.defaultValue === '3'), schema)
  for (const level of ['3', '4']) {
    const instance = await api('POST', `/factor-template-versions/${id}/instantiate`, { factorCode: `${state.tag}_TPL_F${level}`, factorName: `level ${level} surgery ${state.tag}`, category: 'QUALITY', parameterValues: { level } })
    state.factors.push({ id: instance.factor.id, versionId: instance.factor.draftVersionId, code: instance.factor.code }); await checkpoint()
    check(`template substitutes parameter ${level}`, instance.generatedDsl.filters.value === level && instance.effectiveParameters.level === level, instance)
    check(`template instance origin ${level}`, instance.factor.origin?.templateVersionId === id, instance.factor.origin)
    const compiled = await api('POST', `/factor-versions/${instance.factor.draftVersionId}/compile`, {})
    check(`template instance compiles ${level}`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)
    const query = await api('POST', `/factor-versions/${instance.factor.draftVersionId}/query`, { parameters: {} })
    const [source] = await sql('SOURCE', `SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='${level}'`, ['value'])
    check(`template level ${level} matches independent source`, rows(query).length === 1 && close(rows(query)[0].factor_value, source.value), { query, source })
    await save(`template-instance-${level}`, { instance, query, source })
  }
  check('template reverse instance list contains both', rows(await get(`/factor-template-versions/${id}/instances?page=1&size=100`)).filter(item => item.code.startsWith(state.tag)).length === 2)
  await expectRejected('published template immutable', 'PATCH', `/factor-template-versions/${id}`, { resourceVersion: detail.version.resourceVersion, templateDefinition: dsl, parameters })
  const copied = await api('POST', `/factor-templates/${detail.template.id}/versions`, { copyFromVersionId: id })
  check('template copy retains definition and parameters', copied.version.id !== id && isDeepStrictEqual(copied.version.templateDefinition, dsl) && copied.version.parameters.length === 1, copied)
})

if (mode === 'template-review') await run('normalized template evidence', async () => {
  const schema = await get(`/factor-templates/${state.template.id}/parameter-schema`)
  check('template normalized parameter code and default', schema.parameters.some(item => item.code === 'LEVEL' && item.defaultValue === '3' && item.exposed), schema)
  for (const level of ['3', '4']) {
    const evidence = JSON.parse(await readFile(`${folder}/template-instance-${level}.json`, 'utf8'))
    check(`template normalized substitution ${level}`, evidence.instance.effectiveParameters.LEVEL === level && evidence.instance.generatedDsl.filters.value === level)
    check(`template distinct source oracle ${level}`, close(rows(evidence.query)[0].factor_value, evidence.source.value), evidence)
  }
})

if (mode === 'metadata-review') await run('domain binding and value set oracle', async () => {
  const domain = state.domain, tableName = 'vmq_basicinformationba'
  const fields = rows(await get(`/meta/data-domains/${domain.id}/physical-tables/${tableName}/semantic-fields`))
  const field = fields.find(item => item.code === 'QA_SEX')
  const current = await get(`/meta/semantic-fields/${field.id}`)
  const valueSet = state.valuesets.find(item => item.code.endsWith('DISCRETE'))
  const binding = await get(`/meta/semantic-fields/${field.id}/value-set`)
  const association = await api('PUT', `/meta/semantic-fields/${field.id}/value-set`, { valueSetId: valueSet.id, resourceVersion: binding.resourceVersion ?? current.resourceVersion ?? current.field?.resourceVersion ?? 0 })
  check('semantic binding selects published version of value set', association.valueSet?.id === valueSet.id && association.publishedVersion?.id === valueSet.versionId, association)
  const dsl = buildFactorDsl({ domainCode: domain.code, tableName, aggregation: 'COUNT', periodColumn: 'QA_OUT_DATE', filters: { nodeType: 'PREDICATE', fieldCode: 'QA_SEX', operator: 'EQ', value: '1' } })
  const factor = await api('POST', '/factors', { code: `${state.tag}_DOMAIN_F`, name: `domain male ${state.tag}`, dsl })
  state.factors.push({ id: factor.id, versionId: factor.draftVersionId, code: factor.code }); await checkpoint()
  const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
  check('domain semantic factor compiles', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, time)
  const [source] = await sql('SOURCE', "SELECT COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' AND sex='1'", ['value'])
  check('semantic-to-physical factor equals independent source', rows(query).length === 1 && close(rows(query)[0].factor_value, source.value), { query, source })
  await save('domain-query', { query, source, association, compilation })
})

if (mode === 'indicators') await run('four factor arithmetic lifecycle', async () => {
  state.arithmetic ||= { factors: {} }; await checkpoint()
  const where = { nodeType: 'AND', children: [
    { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'GTE', value: '2026-01-01 00:00:00' },
    { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'LT', value: '2026-02-01 00:00:00' }
  ] }
  for (const [key, aggregation, fieldCode] of [['TOTAL', 'SUM', 'total_cost'], ['DRUG', 'SUM', 'drug_cost'], ['MATERIAL', 'SUM', 'material_cost'], ['VISITS', 'COUNT_DISTINCT', 'VISIT_ID']]) {
    if (state.arithmetic.factors[key]) continue
    const dsl = buildFactorDsl({ tableName: 'vmq_basicinformationba', aggregation, fieldCode, calculationMode: 'STATIC', filters: where })
    const existing = state.factors.find(item => item.code === `${state.tag}_${key}`)
    let factor
    if (existing) {
      factor = await get(`/factors/${existing.id}`)
      const current = await get(`/factor-versions/${existing.versionId}`)
      factor = await api('PATCH', `/factors/${existing.id}`, { name: factor.name, resourceVersion: factor.resourceVersion, factorVersionId: existing.versionId, versionResourceVersion: current.resourceVersion, dsl })
    } else {
      factor = await api('POST', '/factors', { code: `${state.tag}_${key}`, name: `${key} January source snapshot ${state.tag}`, dsl })
      state.factors.push({ id: factor.id, versionId: factor.draftVersionId, code: factor.code }); await checkpoint()
    }
    const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    check(`arithmetic ${key} compiles`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
    assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status))
    const trial = await api('POST', `/factor-versions/${factor.draftVersionId}/trial`, { parameters: {} }, { headers: { 'X-Idempotency-Key': `${state.tag}_${key}_STATIC` } })
    await poll(`/async-tasks/${trial.taskId}`)
    await api('POST', `/factor-versions/${factor.draftVersionId}/publish`, {})
    state.arithmetic.factors[key] = factor; await checkpoint()
  }
  const [source] = await sql('SOURCE', "SELECT SUM(total_cost),SUM(drug_cost),SUM(material_cost),COUNT(DISTINCT VISIT_ID),ROUND((SUM(total_cost)-(SUM(drug_cost)+SUM(material_cost)))/COUNT(DISTINCT VISIT_ID)*100,2) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01'", ['TOTAL', 'DRUG', 'MATERIAL', 'VISITS', 'value'])
  state.arithmetic.source = source; await checkpoint()
  for (const [key, factor] of Object.entries(state.arithmetic.factors)) {
    const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { parameters: {} })
    check(`arithmetic ${key} source reconciliation`, close(rows(query)[0]?.factor_value, source[key]), { query, expected: source[key] })
  }
  const ref = key => ({ nodeId: `ref_${key}`, nodeType: 'FACTOR_REF', factorVersionId: state.arithmetic.factors[key].draftVersionId })
  const binary = (nodeId, operator, left, right) => ({ nodeId, nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) })
  const formula = { astType: 'INDICATOR_FORMULA', schemaVersion: '1.0', calculationMode: 'STATIC', display: { scale: 2, format: 'NUMBER', multiplier: '1', roundingMode: 'HALF_UP' },
    root: { nodeType: 'FUNCTION', nodeId: 'round', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [
      binary('per_hundred', 'MUL', binary('per_visit', 'DIV', binary('net_cost', 'SUB', ref('TOTAL'), binary('drug_material', 'ADD', ref('DRUG'), ref('MATERIAL'))), ref('VISITS')),
        { nodeType: 'CONST', nodeId: 'hundred', value: '100', typeDescriptor: { unit: 'ONE', dimension: 'ONE', valueType: 'DECIMAL' } })
    ] } }
  let indicator = state.arithmetic.indicator
  if (!indicator) {
    indicator = await api('POST', '/indicators', { code: `${state.tag}_ARITHMETIC`, name: `每百出院人次非药非耗材费用 ${state.tag}`, category: 'QUALITY', unit: '元/百人次' })
    state.arithmetic.indicator = indicator; state.indicators.push({ id: indicator.id, code: indicator.code }); await checkpoint()
  }
  let version = state.arithmetic.version
  if (!version) {
    version = await api('POST', `/indicators/${indicator.id}/versions`, { formula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
    state.arithmetic.version = version; await checkpoint()
  }
  version = await get(`/indicator-versions/${version.id}`)
  check('nested formula tree round trip', isDeepStrictEqual(version.formula.root, formula.root), version.formula)
  const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
  check('nested ADD SUB MUL DIV ROUND compiles', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status))
  version = await get(`/indicator-versions/${version.id}`)
  const query = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} })
  await save('arithmetic-query', { query, source, formula, compilation })
  console.log(JSON.stringify({ query }).slice(0, 5000))
  const accepted = await api('POST', `/indicator-versions/${version.id}/trial`, { parameters: {} }, { headers: { 'X-Idempotency-Key': `${state.tag}_I_TRIAL` } })
  state.arithmetic.trial = accepted; await checkpoint()
  const task = await poll(`/async-tasks/${accepted.taskId}`)
  const results = await get(`/indicator-versions/${version.id}/trials/${accepted.batchId}/results?page=1&size=100`)
  await save('arithmetic-trial', { task, results, source })
  console.log(JSON.stringify({ results }).slice(0, 7000))
  const published = await api('POST', `/indicator-versions/${version.id}/publish`, {})
  state.arithmetic.publication = published; state.arithmetic.version = await get(`/indicator-versions/${version.id}`); await checkpoint()
  check('static arithmetic published', state.arithmetic.version.status === 'PUBLISHED', published)
  await expectRejected('published nested formula immutable', 'PUT', `/indicator-versions/${version.id}/formula`, { resourceVersion: state.arithmetic.version.version, formula })
})

if (mode === 'arithmetic-review') await run('complex results and batch node oracle', async () => {
  const { indicator, version, source, trial } = state.arithmetic
  const query = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} })
  const saved = await get(`/indicator-versions/${version.id}/trials/${trial.batchId}/results?page=1&size=100`)
  const expected = (Number(source.TOTAL) - Number(source.DRUG) - Number(source.MATERIAL)) / Number(source.VISITS) * 100
  check('independent JS arithmetic agrees with SQL ROUND', close(Math.round(expected * 100) / 100, source.value, 0.000001), { source, expected })
  check('ad hoc complex result equals source arithmetic', rows(query).length === 1 && close(rows(query)[0].value, source.value), { query, source })
  check('persistent trial complex result equals source arithmetic', rows(saved.results).length === 1 && close(rows(saved.results)[0].resultValue, source.value), { saved, source })
  check('static mode explicitly excludes runtime period', query.periodStart == null && query.periodEnd == null && saved.periodStart === '1000-01-01' && saved.periodEnd === '9999-12-31')
  const payload = { ownerType: 'INDICATOR', ownerVersionId: version.id, batchType: 'FULL', periodType: 'STATIC' }
  const accepted = await api('POST', '/calc/batches', payload, { headers: { 'X-Idempotency-Key': `${state.tag}_FORMAL` } })
  state.arithmetic.formal = accepted; await checkpoint()
  const replay = await api('POST', '/calc/batches', payload, { headers: { 'X-Idempotency-Key': `${state.tag}_FORMAL` } })
  check('formal batch idempotency reuses same task', accepted.batchId === replay.batchId && accepted.taskId === replay.taskId, { accepted, replay })
  await poll(`/async-tasks/${accepted.taskId}`)
  const batch = await get(`/calc/batches/${accepted.batchId}`)
  await save('arithmetic-formal-batch', { batch, source })
  console.log(JSON.stringify(batch).slice(0, 10000))
  check('static publication does not create periodic schedules', !rows(await get('/calc/schedules')).some(schedule => schedule.ownerVersionId === version.id && schedule.enabled))
  const binding = await get(`/meta/semantic-fields/${(rows(await get(`/meta/data-domains/${state.domain.id}/physical-tables/vmq_basicinformationba/semantic-fields`))).find(item => item.code === 'QA_SEX').id}/value-set`)
  check('value set binding exact identity', binding.bound && binding.valueSet.id === state.valuesets.find(item => item.code.endsWith('DISCRETE')).id && binding.publishedVersion.items.length === 2, binding)
})

if (mode === 'scenarios') await run('scenario version and effective configuration', async () => {
  const { indicator, version } = state.arithmetic
  let detail = await api('POST', '/scenarios', { code: `${state.tag}_SCENE`, name: `cost audit ${state.tag}`, type: 'QUALITY_CONTROL', defaultPeriodType: 'MONTHLY', defaultParameters: { auditMarker: 'base' }, governingOrgName: 'QA only' })
  state.scenario = { id: detail.scenario.id, versionId: detail.version.id }; await checkpoint()
  const id = detail.version.id
  const indicators = [{ indicatorVersionId: version.id, displayOrder: 0, required: true, reportRequirementText: 'per 100 discharge net costs', mappingOriginType: 'MANUAL', periodType: 'QUARTERLY', dimensionGrain: [] }]
  detail = await api('PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators })
  check('scenario binds exact published indicator version', detail.version.indicators[0].indicatorVersionId === version.id, detail)
  await expectRejected('scenario duplicate version rejected', 'PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators: [...indicators, indicators[0]] })
  await expectRejected('scenario stale save rejected', 'PATCH', `/scenario-versions/${id}`, { resourceVersion: detail.version.resourceVersion - 1, name: detail.scenario.name, defaultPeriodType: 'MONTHLY' })
  const overrides = [{ indicatorVersionId: version.id, overrideType: 'PARAMETER', targetNodePath: 'auditMarker', overrideValue: 'override', displayText: 'isolated marker', priority: 10 }]
  detail = await api('PUT', `/scenario-versions/${id}/overrides`, { resourceVersion: detail.version.resourceVersion, overrides })
  const preview = await get(`/scenario-versions/${id}/merged-preview`)
  check('scenario indicator-specific period overrides default', preview.indicators[0].defaultPeriodType === 'MONTHLY' && preview.indicators[0].effectivePeriodType === 'QUARTERLY', preview)
  check('scenario parameter override beats default', preview.indicators[0].effectiveParameters.auditMarker === 'override', preview)
  const validation = await api('POST', `/scenario-versions/${id}/validate`, {})
  check('scenario validation', validation.valid, validation)
  detail = await api('POST', `/scenario-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
  check('scenario published pointer exact', detail.scenario.currentPublishedVersionId === id && detail.version.publicationStatus === 'PUBLISHED')
  check('indicator reverse scene association', rows(await get(`/indicators/${indicator.id}/scenarios?page=1&size=100`)).some(item => item.scenarioId === detail.scenario.id || item.id === detail.scenario.id))
  await expectRejected('published scenario indicators immutable', 'PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators })
  const copied = await api('POST', `/scenarios/${detail.scenario.id}/versions`, { copyFromVersionId: id })
  check('scenario copy retains associations and overrides', copied.version.id !== id && copied.version.indicators[0].indicatorVersionId === version.id && copied.version.overrides[0].value === 'override', copied)
  state.scenario.copyVersionId = copied.version.id; await checkpoint()
  await save('scenario-lifecycle', { detail, preview, copied })
})

if (mode === 'mappings') await run('mapping review lifecycle and difference', async () => {
  const original = state.arithmetic.version
  const changedFormula = structuredClone(original.formula)
  changedFormula.root.arguments[0].right.value = '1'
  const indicator = await api('POST', '/indicators', { code: `${state.tag}_PER_VISIT`, name: `每出院人次非药非耗材费用 ${state.tag}`, category: 'QUALITY', unit: '元/人次' })
  state.indicators.push({ id: indicator.id, code: indicator.code }); await checkpoint()
  let version = await api('POST', `/indicators/${indicator.id}/versions`, { formula: changedFormula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
  state.perVisit = { indicator, version }; await checkpoint()
  await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
  const trial = await api('POST', `/indicator-versions/${version.id}/trial`, { parameters: {} })
  await poll(`/async-tasks/${trial.taskId}`)
  const result = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} })
  const expected = (Number(state.arithmetic.source.TOTAL) - Number(state.arithmetic.source.DRUG) - Number(state.arithmetic.source.MATERIAL)) / Number(state.arithmetic.source.VISITS)
  check('per visit and per hundred distinguish factor 100', close(rows(result)[0]?.value, Math.round(expected * 100) / 100), { result, expected })
  await api('POST', `/indicator-versions/${version.id}/publish`, {})
  version = await get(`/indicator-versions/${version.id}`)
  state.perVisit.version = version; await checkpoint()
  const difference = await get(`/mappings/compare?sourceIndicatorVersionId=${original.id}&targetIndicatorVersionId=${version.id}`)
  await save('mapping-difference', difference)
  check('mapping snapshots retain distinct formula constants', JSON.stringify(difference.sourceSnapshot).includes('100') && JSON.stringify(difference.targetSnapshot).includes('"value":"1"'), difference.difference)
  const group = await api('POST', '/mappings/groups', { code: `${state.tag}_GROUP`, name: `net cost mappings ${state.tag}`, canonicalIndicatorVersionId: original.id })
  state.mappingGroup = group; await checkpoint()
  let detail = await api('POST', '/mappings', { code: `${state.tag}_MAP`, name: `scale 100 to 1 ${state.tag}`, groupId: group.id, targetIndicatorVersionId: version.id, mappingType: 'SAME_CONCEPT', comparability: 'CONDITIONAL', evidence: { description: 'divide per hundred value by 100', conversionFactor: '0.01' } })
  state.mapping = { id: detail.mapping.id }; await checkpoint()
  const id = detail.mapping.id
  await expectRejected('mapping cannot approve draft', 'POST', `/mappings/${id}/approve`, { resourceVersion: detail.mapping.resourceVersion, comment: 'negative test' })
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  check('mapping submitted', detail.mapping.reviewStatus === 'PENDING', detail.mapping)
  await expectRejected('mapping reject needs reason', 'POST', `/mappings/${id}/reject`, { resourceVersion: detail.mapping.resourceVersion, comment: '' })
  detail = await api('POST', `/mappings/${id}/reject`, { resourceVersion: detail.mapping.resourceVersion, comment: 'need explicit conversion' })
  check('mapping rejection persisted', detail.mapping.reviewStatus === 'REJECTED' && detail.version.reviewComment === 'need explicit conversion', detail)
  detail = await api('PATCH', `/mappings/${id}`, { resourceVersion: detail.mapping.resourceVersion, name: detail.mapping.name, mappingType: 'SAME_CONCEPT', comparability: 'CONDITIONAL', evidence: { description: 'value source/100 -> target; different rounding is documented' } })
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  detail = await api('POST', `/mappings/${id}/approve`, { resourceVersion: detail.mapping.resourceVersion, comment: 'isolated QA approval' })
  check('mapping approved and published', detail.mapping.reviewStatus === 'APPROVED' && detail.mapping.publicationStatus === 'PUBLISHED', detail)
  check('approved mapping reverse association', rows(await get(`/mappings/by-indicator-version/${original.id}`)).some(item => item.id === id))
  await expectRejected('mapping stale invalidation rejected', 'POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion - 1, reason: 'stale test' })
  detail = await api('POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion, reason: `${state.tag} audit complete` })
  check('mapping invalidation retains reason', detail.invalidateReason === `${state.tag} audit complete`, detail)
  await save('mapping-final', detail)
})

if (mode === 'sql-import') await run('complex CTE SQL parse trial resume abandon', async () => {
  const sqlText = `WITH all_surgery AS (SELECT COUNT(b.id) total_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3'), emergency_surgery AS (SELECT COUNT(b.id) emergency_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3' AND b.surgery_classfy='2') SELECT total_cnt admissions, emergency_cnt emergency, ROUND(emergency_cnt*100.0/total_cnt,2) rate_percent FROM all_surgery CROSS JOIN emergency_surgery`
  const tables = rows(await get('/meta/data-domains/102027642460334973/physical-tables'))
  const tableMappings = { vmq_surgeryinfo: tables.find(item => item.tableName.toLowerCase() === 'vmq_surgeryinfo').id }
  const countStar = await api('POST', '/sql-imports', { sql: 'WITH total AS (SELECT COUNT(*) n FROM vmq_surgeryinfo b) SELECT n FROM total', tableMappings, definitionType: 'DSL' }, { allowError: true })
  check('SQL COUNT star supported in DSL import', countStar.http === 200 && countStar.code === 'OK', countStar)
  await save('sql-count-star-probe', countStar)
  if (countStar.data?.importId) { await api('POST', `/sql-imports/${countStar.data.importId}/abandon`, { reason: `${state.tag} parser probe cleanup` }); await poll(`/sql-imports/${countStar.data.importId}`, ['ABANDONED']) }
  let task = await api('POST', '/sql-imports', { sql: sqlText, tableMappings, definitionType: 'DSL' }, { headers: { 'Idempotency-Key': `${state.tag}_IMPORT` } })
  state.sqlImport = task; await checkpoint()
  const id = task.importId
  const replay = await api('POST', '/sql-imports', { sql: sqlText, tableMappings, definitionType: 'DSL' }, { headers: { 'Idempotency-Key': `${state.tag}_IMPORT` } })
  check('SQL import idempotency', replay.importId === id)
  task = await get(`/sql-imports/${id}`)
  await save('sql-import-parsed', task)
  console.log(JSON.stringify(task).slice(0, 6500))
  const metadata = { scope: 'FACTORS_AND_INDICATOR', category: 'QUALITY', indicatorCode: `${state.tag}_SQL_I`, indicatorName: `三级手术急诊比例 ${state.tag}`, factors: task.preview.factors.map((factor, index) => ({ key: factor.key, code: `${state.tag}_SQL_F${index}`, name: `SQL surgery ${index} ${state.tag}`, calculationMode: 'STATIC' })) }
  await api('PUT', `/sql-imports/${id}/metadata`, metadata)
  const resumed = await get(`/sql-imports/${id}`)
  check('SQL resume retains user codes names', resumed.metadata.indicatorCode === metadata.indicatorCode && resumed.metadata.factors.length === 2, resumed.metadata)
  task = await api('POST', `/sql-imports/${id}/trial`, { parameters: {} }, { headers: { 'Idempotency-Key': `${state.tag}_IMPORT_TRIAL` } })
  task = await poll(`/sql-imports/${id}`, ['TRIAL_SUCCEEDED'])
  state.sqlImport = task; await checkpoint()
  const result = await get(`/indicator-versions/${task.result.indicatorVersionId}/trials/${task.result.trialBatchId}/results?page=1&size=100`)
  const [source] = await sql('SOURCE', "SELECT COUNT(*),SUM(surgery_classfy='2'),ROUND(SUM(surgery_classfy='2')*100.0/COUNT(*),2) FROM vmq_surgeryinfo WHERE surgery_level='3'", ['total', 'emergency', 'percentage'])
  await save('sql-import-trial', { task, result, source })
  const row = rows(result.targets[0].results)[0]
  check('SQL imported numerator and denominator source match', close(row.numeratorValue, source.emergency) && close(row.denominatorValue, source.total), { row, source })
  check('SQL imported raw ratio and percent display independently correct', close(row.resultValue, Number(source.emergency) / Number(source.total)) && row.displayValue === `${source.percentage}%`, { row, source })
  await api('POST', `/sql-imports/${id}/abandon`, { reason: `${state.tag} isolated QA cleanup` })
  task = await poll(`/sql-imports/${id}`, ['ABANDONED'])
  check('SQL abandon removes only generated unpublished resources', task.status === 'ABANDONED' && task.resources.every(resource => ['DELETED', 'RETAINED', 'SKIPPED', 'NOT_CREATED'].includes(resource.cleanup)), task)
  await save('sql-import-abandoned', task)
})

if (mode === 'scenario-review') await run('scenario validation guard and clean publication', async () => {
  const id = state.scenario.versionId, indicator = state.arithmetic.indicator, version = state.arithmetic.version
  let detail = await get(`/scenario-versions/${id}`)
  const negative = await api('POST', `/scenario-versions/${id}/validate`, {})
  check('unauthorized override fails validation', !negative.valid && negative.diagnostics.some(item => item.code === 'OVERRIDE_NOT_ALLOWED'), negative)
  await expectRejected('unauthorized override cannot publish', 'POST', `/scenario-versions/${id}/publish`, { resourceVersion: negative.resourceVersion })
  detail = await api('PUT', `/scenario-versions/${id}/overrides`, { resourceVersion: negative.resourceVersion, overrides: [] })
  const validation = await api('POST', `/scenario-versions/${id}/validate`, {})
  check('scenario without unauthorized overrides validates', validation.valid, validation)
  detail = await api('POST', `/scenario-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
  check('published scenario pointer exact', detail.scenario.currentPublishedVersionId === id && detail.version.publicationStatus === 'PUBLISHED')
  const reverse = await get(`/indicators/${indicator.id}/scenarios?page=1&size=100`)
  check('indicator reverse scene references published version', rows(reverse).some(item => item.id === detail.scenario.id && item.scenarioVersionId === id), reverse)
  await expectRejected('published scenario refuses indicator edits', 'PUT', `/scenario-versions/${id}/indicators`, { resourceVersion: detail.version.resourceVersion, indicators: [{ indicatorVersionId: version.id, displayOrder: 0, required: true }] })
  const copy = await api('POST', `/scenarios/${state.scenario.id}/versions`, { copyFromVersionId: id })
  check('scenario copy retains exact linked version', copy.version.id !== id && copy.version.publicationStatus === 'DRAFT' && copy.version.indicators[0].indicatorVersionId === version.id)
  state.scenario.copyVersionId = copy.version.id; await checkpoint()
  await save('scenario-final', { detail, copy, reverse })
})

if (mode === 'policies') await run('policy upload byte identity and publish lifecycle', async () => {
  const content = Buffer.from(`QA fixture ${state.tag}\nNet non-drug non-material cost per 100 discharged patients\nFormula: (total_cost - (drug_cost + material_cost)) / distinct visits * 100\nWindow: 2026-01-01 <= out_date < 2026-02-01\n`)
  const hash = createHash('sha256').update(content).digest('hex')
  const originalName = `${state.tag}.txt`
  const limits = await get('/meta/file-objects/upload-options')
  check('upload max and txt contract', limits.maxBytes === 100 * 1024 * 1024 && limits.extensions.includes('txt'), limits)
  const upload = async (digest = hash, name = originalName) => {
    const form = new FormData(); form.append('file', new Blob([content], { type: 'text/plain' }), name); form.append('sha256', digest)
    const response = await fetch(`${base}/meta/file-objects/upload`, { method: 'POST', body: form })
    return { http: response.status, ...parse(await response.text()) }
  }
  const first = await upload()
  check('real file upload succeeds', first.http === 200 && first.code === 'OK', first)
  assert.equal(first.code, 'OK')
  const file = first.data.file
  state.policyFileObject = file; await checkpoint()
  check('uploaded file metadata matches hash and bytes', file.sha256 === hash && Number(file.fileSizeBytes) === content.length, file)
  const checked = await api('POST', '/meta/file-objects/check', { sha256: hash, originalName, fileSizeBytes: content.length })
  check('hash dedup returns same file identity', checked.instantUpload && checked.file.id === file.id, checked)
  const parallel = await Promise.all([upload(), upload()])
  check('concurrent same-content uploads reuse identity', parallel.every(result => result.code === 'OK' && result.data.file.id === file.id), parallel)
  const wrong = await upload('0'.repeat(64))
  check('content hash mismatch rejected', [400, 422].includes(wrong.http), wrong)
  const unsupported = await upload(hash, `${state.tag}.exe`)
  check('unsupported extension rejected even for dedup hash', [400, 422].includes(unsupported.http), unsupported)
  const response = await fetch(`${base}/meta/file-objects/${file.id}/content`)
  const downloaded = Buffer.from(await response.arrayBuffer())
  check('policy download exact byte round trip', response.ok && downloaded.equals(content), { status: response.status, bytes: downloaded.length })
  check('policy download response safe headers', response.headers.get('x-content-type-options') === 'nosniff' && /no-store/.test(response.headers.get('cache-control')), Object.fromEntries(response.headers))
  const range = await fetch(`${base}/meta/file-objects/${file.id}/content`, { headers: { Range: 'bytes=0-15' } })
  const rangeBytes = Buffer.from(await range.arrayBuffer())
  check('range either valid partial or documented full response', range.status === 206 ? rangeBytes.equals(content.subarray(0, 16)) && range.headers.get('content-range') === `bytes 0-15/${content.length}` : range.status === 200 && rangeBytes.equals(content), { status: range.status, contentRange: range.headers.get('content-range'), bytes: rangeBytes.length })
  let detail = await api('POST', '/meta/policy-files', { code: `${state.tag}_POLICY`, name: `Isolated net cost protocol ${state.tag}`, category: 'QUALITY', issuingOrganization: 'QA acceptance only', documentNumber: state.tag })
  state.policy = { id: detail.policyFile.id }; await checkpoint()
  detail = await api('POST', `/meta/policy-files/${detail.policyFile.id}/versions`, { issueDate: '2026-01-01', effectiveStartDate: '2026-01-01', fileObjectId: file.id, contentHash: hash })
  let version = detail.versions[0]
  state.policy.versionId = version.id; await checkpoint()
  const validation = await api('POST', `/meta/policy-file-versions/${version.id}/validate`, {})
  check('policy file version validates', validation.valid, validation)
  version = await get(`/meta/policy-file-versions/${version.id}`)
  detail = await api('POST', `/meta/policy-files/${state.policy.id}/versions/${version.id}/publish`, { resourceVersion: version.resourceVersion })
  check('published policy points exact content', detail.policyFile.currentPublishedVersionId === version.id && detail.versions.find(item => item.id === version.id).contentHash === hash, detail)
  for (const indicatorVersionId of [state.arithmetic.version.id, state.perVisit.version.id]) {
    const reference = await api('POST', `/mappings/indicator-versions/${indicatorVersionId}/policy-references`, { policyFileVersionId: version.id, citationLocation: 'Formula', citationText: 'QA-only protocol, not a clinical policy', relationRole: 'SOURCE' })
    check(`indicator policy real reference ${indicatorVersionId}`, reference.policyFileVersionId === version.id && reference.indicatorVersionId === indicatorVersionId, reference)
  }
  await expectRejected('policy hash substitution rejected', 'POST', `/meta/policy-files/${state.policy.id}/versions`, { issueDate: '2026-01-01', fileObjectId: file.id, contentHash: '0'.repeat(64) })
  await save('policy-lifecycle', { detail, file, limits, hash, download: Object.fromEntries(response.headers), rangeStatus: range.status })
})

if (mode === 'mapping-review') await run('mapping reviewed lifecycle with actual policy evidence', async () => {
  const id = state.mapping.id
  let detail = await get(`/mappings/${id}`)
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  check('mapping review pending', detail.mapping.reviewStatus === 'PENDING_REVIEW', detail.mapping)
  await expectRejected('mapping reject requires reason', 'POST', `/mappings/${id}/reject`, { resourceVersion: detail.mapping.resourceVersion, comment: '' })
  detail = await api('POST', `/mappings/${id}/reject`, { resourceVersion: detail.mapping.resourceVersion, comment: 'document scale difference' })
  check('mapping rejection and reason saved', detail.mapping.reviewStatus === 'REJECTED' && detail.version.reviewComment === 'document scale difference', detail)
  detail = await api('PATCH', `/mappings/${id}`, { resourceVersion: detail.mapping.resourceVersion, name: detail.mapping.name, mappingType: 'SAME_CONCEPT', comparability: 'CONDITIONAL', evidence: { description: 'divide per hundred cost by 100; rounded at different scale' } })
  detail = await api('POST', `/mappings/${id}/submit`, { resourceVersion: detail.mapping.resourceVersion })
  detail = await api('POST', `/mappings/${id}/approve`, { resourceVersion: detail.mapping.resourceVersion, comment: 'QA approval' })
  check('mapping approved and published', detail.mapping.reviewStatus === 'APPROVED' && detail.mapping.publicationStatus === 'PUBLISHED', detail)
  check('mapping reverse lookup published identity', rows(await get(`/mappings/by-indicator-version/${state.arithmetic.version.id}`)).some(item => item.id === id))
  await expectRejected('mapping stale invalidation rejected', 'POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion - 1, reason: 'stale test' })
  detail = await api('POST', `/mappings/${id}/invalidate`, { resourceVersion: detail.mapping.resourceVersion, reason: `${state.tag} audit complete` })
  check('mapping invalidation reason preserved', detail.invalidateReason === `${state.tag} audit complete`, detail)
  await save('mapping-reviewed', detail)
})

if (mode === 'dashboard') await run('isolated dashboard version lifecycle and numerical equivalence', async () => {
  const existing = await get('/analysis/dashboards/1189225114584501123')
  const widgets = [0, 3, 4, 5].map((index, position) => ({ ...existing.version.widgets[index], code: `QA_WIDGET_${position}`, position: { x: position % 2 * 12, y: Math.floor(position / 2) * 8, w: 12, h: 8 } }))
  const schema = { name: `isolated real quality ${state.tag}`, type: 'CUSTOM', layout: { columns: 24, float: false }, globalFilters: existing.version.globalFilters, widgets }
  let detail = await api('POST', '/analysis/dashboards', { ...schema, code: `${state.tag}_DASHBOARD` })
  state.dashboard = { id: detail.dashboard.id, code: detail.dashboard.code }; await checkpoint()
  const id = detail.dashboard.id
  check('dashboard widgets retain binding and source IDs', detail.version.widgets.every((widget, index) => widget.indicatorVersionId === widgets[index].indicatorVersionId && isDeepStrictEqual(widget.fieldBindings, widgets[index].fieldBindings)), detail)
  detail = await api('PUT', `/analysis/dashboards/${id}`, { ...schema, name: `${schema.name} revision 1`, resourceVersion: detail.version.resourceVersion })
  check('dashboard draft save round trip', (await get(`/analysis/dashboards/${id}`)).dashboard.name.endsWith('revision 1'))
  await expectRejected('dashboard stale version rejected', 'PUT', `/analysis/dashboards/${id}`, { ...schema, resourceVersion: detail.version.resourceVersion - 1 })
  detail = await api('POST', `/analysis/dashboards/${id}/publish`, { resourceVersion: detail.version.resourceVersion })
  const publishedId = detail.version.id
  check('dashboard publication pins version', detail.dashboard.currentPublishedVersionId === publishedId && detail.version.publicationStatus === 'PUBLISHED')
  const query = await api('POST', `/analysis/dashboards/${id}/query`, { periodStart: '2026-01-01', periodEnd: '2026-02-01', granularity: 'MONTHLY', responseFormat: 'FULL' })
  const original = await api('POST', '/analysis/dashboards/1189225114584501123/query', { periodStart: '2026-01-01', periodEnd: '2026-02-01', granularity: 'MONTHLY', responseFormat: 'FULL', widgetCodes: widgets.map((_, index) => existing.version.widgets[[0, 3, 4, 5][index]].code) })
  await save('dashboard-query', { query, original })
  console.log(JSON.stringify(query).slice(0, 3500))
  const copied = await api('POST', `/analysis/dashboards/${id}/copy`, { code: `${state.tag}_DASH_COPY`, name: `copy ${state.tag}` })
  state.dashboard.copyId = copied.dashboard.id; await checkpoint()
  check('dashboard copy new identities same bindings', copied.dashboard.id !== id && copied.version.widgets.length === widgets.length && copied.version.widgets[0].indicatorVersionId === widgets[0].indicatorVersionId && copied.dashboard.status === 'DRAFT', copied.dashboard)
  detail = await api('PUT', `/analysis/dashboards/${id}`, { ...schema, name: `${schema.name} revision 2`, resourceVersion: detail.version.resourceVersion })
  detail = await api('POST', `/analysis/dashboards/${id}/publish`, { resourceVersion: detail.version.resourceVersion })
  const history = await get(`/analysis/dashboards/${id}/versions`)
  check('dashboard history retains two immutable snapshots', rows(history).filter(item => item.publicationStatus === 'PUBLISHED').length === 2, history)
  const restored = await api('POST', `/analysis/dashboards/${id}/versions/${publishedId}/restore`, {})
  check('restored dashboard snapshot retains widgets', restored.version.widgets.length === widgets.length && restored.version.id !== publishedId, restored)
  await save('dashboard-lifecycle', { detail, copied, history, restored })
})

if (mode === 'transforms') await run('isolated source standardization lifecycle and source profile', async () => {
  const fields = rows(await get(`/meta/data-domains/${state.domain.id}/physical-tables/vmq_basicinformationba/semantic-fields`))
  const field = fields.find(item => item.code === 'QA_SEX'), mappingId = field.sourceFieldMappingId
  const profile = await get(`/meta/source-field-mappings/${mappingId}/value-profile?page=1&size=100`)
  const source = await sql('SOURCE', 'SELECT sex,COUNT(*) FROM vmq_basicinformationba GROUP BY sex', ['value', 'count'])
  check('source profile total matches independent full source', Number(profile.totalCount) === source.reduce((sum, row) => sum + Number(row.count), 0), { profile, source })
  check('source profile every bucket equals source SQL', profile.items.every(item => source.some(row => row.value === item.value && Number(row.count) === Number(item.count))), { profile, source })
  const payload = { name: `gender mapping ${state.tag}`, unmatchedPolicy: 'KEEP_SOURCE', nullPolicy: 'KEEP_NULL', normalizers: ['TRIM'], mappings: [{ sourceValue: '1', targetItemCode: 'MALE' }, { sourceValue: '2', targetItemCode: 'FEMALE' }] }
  let detail = await api('POST', `/meta/source-field-mappings/${mappingId}/transform-rules`, payload)
  state.transform = { id: detail.rule.id, versionId: detail.version.id, mappingId }; await checkpoint()
  const id = detail.version.id
  await expectRejected('normalization collision rejected', 'PUT', `/transform-rule-versions/${id}`, { ...payload, resourceVersion: detail.version.resourceVersion, mappings: [...payload.mappings, { sourceValue: ' 1 ', targetItemCode: 'MALE' }] })
  const preview = await api('POST', `/transform-rule-versions/${id}/preview`, { limit: 100 })
  check('transform preview resolves correct values', preview.items.filter(item => ['1', '2'].includes(item.sourceValue)).every(item => item.targetValue === item.sourceValue && item.targetItemCode === (item.sourceValue === '1' ? 'MALE' : 'FEMALE')), preview)
  check('transform preview bucket conservation', Number(preview.matchedCount) + Number(preview.unmatchedCount) === source.reduce((sum, row) => sum + Number(row.count), 0), { preview, source })
  const validation = await api('POST', `/transform-rule-versions/${id}/validate`, {})
  check('source standardization validates', validation.valid, validation)
  detail = await api('POST', `/transform-rule-versions/${id}/publish`, { resourceVersion: validation.resourceVersion })
  check('transform publishes exact rule version', detail.version.publicationStatus === 'PUBLISHED' && detail.rule.currentPublishedVersionId === id, detail)
  await expectRejected('published standardization immutable', 'PUT', `/transform-rule-versions/${id}`, { ...payload, resourceVersion: detail.version.resourceVersion })
  await save('transform-lifecycle', { detail, profile, preview, source })
})

if (mode === 'node-results') await run('batch node and result lineage consistency', async () => {
  const batch = await get(`/calc/batches/${state.arithmetic.formal.batchId}`)
  const nodes = batch.targets[0].nodes
  check('formal graph has all four factors and dependent formula', nodes.filter(node => node.nodeType === 'FACTOR').length === 4 && nodes.find(node => node.nodeType === 'FORMULA').dependencies.length === 4)
  for (const node of nodes.filter(node => ['FACTOR', 'FORMULA'].includes(node.nodeType))) {
    const detail = await get(`/calc/nodes/${node.nodeId}/results?pageNum=1&pageSize=20`)
    await save(`node-${node.nodeType}-${node.ownerVersionId}`, detail)
    console.log(JSON.stringify(detail).slice(0, 2400))
    const key = Object.keys(state.arithmetic.factors).find(key => state.arithmetic.factors[key].draftVersionId === node.ownerVersionId)
    const expected = key ? state.arithmetic.source[key] : state.arithmetic.source.value
    check(`DAG node summary source value ${key || 'FORMULA'}`, close(node.resultSummary.singleResult.value, expected), { node: node.nodeId, expected, actual: node.resultSummary.singleResult })
    const records = rows(detail.results || detail)
    check(`DAG paged results equal summary ${key || 'FORMULA'}`, records.length === 1 && close(records[0].value ?? records[0].resultValue ?? records[0].valueDecimal, expected), detail)
  }
  const resultId = nodes.find(node => node.nodeType === 'FORMULA').resultSummary.singleResult.resultId
  const trace = await get(`/analysis/results/${resultId}/factors`)
  await save('formal-lineage', trace)
  console.log(JSON.stringify(trace).slice(0, 7000))
  check('lineage tracks current formal result identity', JSON.stringify(trace).includes(resultId), trace)
})

if (mode === 'formula-functions') {
  const factor = state.arithmetic.factors.VISITS.draftVersionId
  let sequence = 0
  const ref = () => ({ nodeType: 'FACTOR_REF', nodeId: `n${++sequence}`, factorVersionId: factor })
  const c = value => ({ nodeType: 'CONST', nodeId: `n${++sequence}`, value: String(value), typeDescriptor: { unit: 'ONE', dimension: 'RATIO', valueType: 'DECIMAL' } })
  const b = (operator, left, right, policy = 'RETURN_NULL') => ({ nodeType: 'BINARY', nodeId: `n${++sequence}`, operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: policy } : {}) })
  const one = () => b('DIV', ref(), ref())
  const f = (functionCode, args, extra = {}) => ({ nodeType: 'FUNCTION', nodeId: `n${++sequence}`, functionCode, arguments: args, ...extra })
  const cases = [
    ['MIN', () => f('MIN', [one(), c(3), c(7), c(11)]), 1],
    ['MAX', () => f('MAX', [one(), c(3), c(7), c(11)]), 11],
    ['AVG', () => f('AVG', [one(), c(3), c(7), c(11)]), 5.5],
    ['MEDIAN', () => f('MEDIAN', [one(), c(3), c(7), c(11)]), 5],
    ['PERCENTILE', () => f('PERCENTILE', [one(), c(3), c(7), c(11)], { percentile: '0.75' }), 8],
    ['CLAMP', () => f('CLAMP', [b('MUL', one(), c(12)), c(0), c(10)]), 10],
    ['ABS', () => f('ABS', [b('SUB', one(), c(8))]), 7],
    ['IF', () => f('IF', [{ nodeType: 'COMPARE', nodeId: `n${++sequence}`, comparator: 'GE', left: one(), right: c(1) }, c(6), b('DIV', one(), c(0), 'ERROR')]), 6],
    ['COALESCE', () => f('COALESCE', [b('DIV', one(), c(0)), c(7)]), 7],
    ['ZERO_NULL', () => b('DIV', one(), c(0)), null],
    ['ZERO_ZERO', () => b('DIV', one(), c(0), 'RETURN_ZERO'), 0],
    ['ZERO_ERROR', () => b('DIV', one(), c(0), 'ERROR'), 'ERROR']
  ]
  state.functionVersions ||= []
  for (const [name, root, expected] of cases) await run(`formula function ${name}`, async () => {
    const formula = { astType: 'INDICATOR_FORMULA', schemaVersion: '1.0', calculationMode: 'STATIC', display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' }, root: root() }
    const version = await api('POST', `/indicators/${state.perVisit.indicator.id}/versions`, { formula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
    state.functionVersions.push({ id: version.id, name, expected }); await checkpoint()
    const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
    check(`${name} typed compilation valid`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
    assert.ok(['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status))
    const query = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} }, { allowError: expected === 'ERROR' })
    if (expected === 'ERROR') check('zero ERROR returns controlled conflict', query.http === 409, query)
    else {
      check(`${name} independent numerical expectation`, rows(query).length === 1 && close(rows(query)[0].value, expected), { query, expected })
      if (expected === null) check('zero NULL not disguised as zero', rows(query)[0].value === null && rows(query)[0].displayValue == null)
      if (name === 'ZERO_ZERO') check('coerced zero has non-passed quality', rows(query)[0].qualityFlag !== 'PASSED', query)
    }
    await save(`function-${name}`, { formula, compilation, query, expected })
  })
}

if (mode === 'warnings') await run('warning nested rule lifecycle disabled for safety', async () => {
  const users = rows(await get('/system/users'))
  assert.ok(users.length)
  const condition = { logic: 'OR', children: [
    { logic: 'AND', children: [{ operator: 'GT', threshold: '900000' }, { logic: 'NOT', children: [{ operator: 'GTE', threshold: '1000000' }] }] },
    { operator: 'EQ', threshold: '0' }
  ] }
  const payload = { code: `${state.tag}_WARNING`, name: `nested cost guard ${state.tag}`, warningType: 'THRESHOLD', indicatorVersionId: state.arithmetic.version.id, periodType: 'MONTHLY', severity: 'HIGH',
    condition, scopePolicy: { includeNoScenario: true, resultScope: { mode: 'MAIN' } }, notificationPolicy: { channels: ['IN_APP'], recipientUserIds: [JSON.rawJSON(String(users[0].id))] } }
  let detail = await api('POST', '/analysis/warning-rules', payload)
  state.warning = { id: detail.id, versionId: detail.version.id }; await checkpoint()
  check('warning draft disabled before publish', detail.enableStatus === 'DISABLED' && detail.version.publicationStatus === 'DRAFT')
  check('warning nested condition round trip', isDeepStrictEqual(detail.version.condition, condition), detail)
  await expectRejected('warning stale edit rejected', 'PATCH', `/analysis/warning-rule-versions/${detail.version.id}`, { ...payload, resourceVersion: detail.version.resourceVersion + 100 })
  await expectRejected('warning NOT accepts only one child', 'PATCH', `/analysis/warning-rule-versions/${detail.version.id}`, { ...payload, resourceVersion: detail.version.resourceVersion, condition: { logic: 'NOT', children: [{ operator: 'GT', threshold: '1' }, { operator: 'LT', threshold: '2' }] } })
  detail = await api('POST', `/analysis/warning-rule-versions/${detail.version.id}/publish`, { resourceVersion: detail.version.resourceVersion })
  check('warning published remains disabled no notifications', detail.enableStatus === 'DISABLED' && detail.currentPublishedVersionId === detail.version.id)
  await expectRejected('published warning condition immutable', 'PATCH', `/analysis/warning-rule-versions/${detail.version.id}`, { ...payload, resourceVersion: detail.version.resourceVersion })
  const options = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${state.arithmetic.version.id}`)
  await save('warning-scope-options', options)
  console.log(JSON.stringify(options).slice(0, 4500))
  await save('warning-disabled-rule', detail)
})

if (mode === 'pagination') {
  for (const path of ['/factors', '/indicators', '/factor-versions', '/indicator-versions', '/scenarios', '/mappings', '/meta/value-sets', '/analysis/warnings', '/analysis/warning-rules']) await run(`${path} pagination`, async () => {
    const first = await get(`${path}?page=1&size=7`), second = await get(`${path}?page=2&size=7`)
    const combined = await get(`${path}?page=1&size=14`)
    const keys = list => rows(list).map(item => String(item.id))
    check(`${path} page boundaries preserve order and no duplication`, isDeepStrictEqual([...keys(first), ...keys(second)], keys(combined)), { first: keys(first), second: keys(second), combined: keys(combined) })
    check(`${path} total stable across page sizes`, first.total === second.total && second.total === combined.total)
    const outside = await get(`${path}?page=${Math.ceil(Number(first.total) / 7) + 1}&size=7`)
    check(`${path} beyond last page empty with same total`, rows(outside).length === 0 && outside.total === first.total, outside)
  })
  for (const [path, payload] of [
    ['/factor-versions/' + state.nestedFactor.version.id + '/query', { periodStart: 'invalid', periodEnd: '2026-02-01', parameters: {} }],
    ['/factor-versions/' + state.nestedFactor.version.id + '/query', { periodStart: '2026-02-01T00:00:00', periodEnd: '2026-01-01T00:00:00', parameters: {} }]
  ]) await expectRejected('invalid runtime date controlled error', 'POST', path, payload)
  await expectRejected('anonymous current user unavailable', 'GET', '/auth/me', undefined, [401])
  await expectRejected('unknown account cannot login', 'POST', '/auth/login', { username: state.tag, password: 'not-a-real-account-!QA' }, [401, 403])
  await expectRejected('refresh without CSRF forbidden', 'POST', '/auth/refresh', {}, [403])
}

if (mode === 'contract-review') await run('corrected contract evidence and SQL regression', async () => {
  const scenario = await get(`/indicators/${state.arithmetic.indicator.id}/scenarios?page=1&size=100`)
  check('scenario reverse association exact version and indicator', rows(scenario).some(item => item.id === state.scenario.id && item.scenarioVersionId === state.scenario.versionId && item.references.some(ref => ref.indicatorVersionId === state.arithmetic.version.id)), scenario)
  const imported = JSON.parse(await readFile(`${folder}/sql-import-trial.json`, 'utf8'))
  const row = rows(imported.result.targets[0].results)[0]
  check('imported raw unscaled ratio correct', close(row.resultValue, Number(imported.source.emergency) / Number(imported.source.total)), { row, source: imported.source })
  check('imported percent formatted after division without premature rounding', row.displayValue === `${imported.source.percentage}%`, { row, source: imported.source })
  const mappings = JSON.parse(await readFile(`${folder}/mapping-reviewed.json`, 'utf8'))
  check('mapping completed entire review cycle and invalidation', mappings.mapping.reviewStatus === 'INVALIDATED' && mappings.invalidateReason === `${state.tag} audit complete`, { status: mappings.mapping.reviewStatus, reason: mappings.invalidateReason })
  const options = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${state.arithmetic.version.id}`)
  check('non-grouped test indicator has no fabricated group options', rows(options).every(item => !(item.dimensions || []).length), options)
  const published = await get('/indicator-versions/102027642461313071')
  assert.equal(published.status, 'PUBLISHED')
  state.realWarningVersion = published.id; await checkpoint()
  const grouped = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${published.id}`)
  await save('real-warning-scopes', grouped)
  console.log(JSON.stringify(grouped).slice(0, 5000))
  const tables = rows(await get('/meta/data-domains/102027642460334973/physical-tables'))
  const tableMappings = { vmq_surgeryinfo: tables.find(item => item.tableName.toLowerCase() === 'vmq_surgeryinfo').id }
  const countStar = await api('POST', '/sql-imports', { sql: 'WITH total AS (SELECT COUNT(*) n FROM vmq_surgeryinfo b) SELECT n FROM total', tableMappings, definitionType: 'DSL' }, { allowError: true })
  await save('sql-count-star-confirmed', { sql: 'WITH total AS (SELECT COUNT(*) n FROM vmq_surgeryinfo b) SELECT n FROM total', tableMappings, response: countStar })
  check('CTE COUNT star DSL support', countStar.http === 200 && countStar.code === 'OK', countStar)
  if (countStar.data?.importId) { await api('POST', `/sql-imports/${countStar.data.importId}/abandon`, { reason: `${state.tag} parser probe cleanup` }); await poll(`/sql-imports/${countStar.data.importId}`, ['ABANDONED']) }
})

if (['final-review', 'warning-review'].includes(mode)) {
  if (mode === 'final-review') await run('isolated dashboard row-for-row equivalence and independent mortality oracle', async () => {
    const { query, original } = JSON.parse(await readFile(`${folder}/dashboard-query.json`, 'utf8'))
    const originalWidgets = Object.values(original.widgets)
    for (const [index, widget] of Object.values(query.widgets).entries()) {
      check(`copied dashboard widget ${index} exact rows unchanged`, isDeepStrictEqual(widget.rows, originalWidgets[index].rows), { count: widget.rows.length })
      check(`copied dashboard widget ${index} ready and same field contract`, widget.status === 'READY' && isDeepStrictEqual(widget.fields, originalWidgets[index].fields))
    }
    const source = await sql('SOURCE', "SELECT out_dept_code,COUNT(*),SUM(out_status='4') FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-02-01' GROUP BY out_dept_code", ['code', 'total', 'deaths'])
    for (const row of query.widgets.QA_WIDGET_3.rows) {
      const expected = source.find(item => item.code === row.out_dept_code)
      check(`dashboard table source mortality ${row.out_dept_code}`, expected && close(row.numeratorValue, expected.deaths) && close(row.denominatorValue, expected.total) && close(row.value, Number(expected.deaths) / Number(expected.total)), { row, expected })
    }
    const total = query.widgets.QA_WIDGET_0.rows[0]
    check('dashboard KPI equals pooled deaths not average department ratios', close(total.numeratorValue, source.reduce((n, item) => n + Number(item.deaths), 0)) && close(total.denominatorValue, source.reduce((n, item) => n + Number(item.total), 0)) && close(total.value, 55 / 14187), total)
    await save('dashboard-final-oracle', { source, total })
  })
  if (mode === 'final-review') await run('lineage exact identity and each source factor value', async () => {
    const batch = await get(`/calc/batches/${state.arithmetic.formal.batchId}`)
    const trace = JSON.parse(await readFile(`${folder}/formal-lineage.json`, 'utf8'))
    check('lineage same batch and snapshot as result graph', trace.context.calculationBatchId === batch.batchId && trace.context.configSnapshotId === batch.targets[0].snapshotId, { context: trace.context, batch: { batchId: batch.batchId, snapshotId: batch.targets[0].snapshotId } })
    check('lineage exactly four distinct factor results', trace.factors.length === 4 && new Set(trace.factors.map(item => item.result.factorResultId)).size === 4)
    for (const [key, factor] of Object.entries(state.arithmetic.factors)) {
      const item = trace.factors.find(item => item.factorVersionId === factor.draftVersionId)
      const node = batch.targets[0].nodes.find(item => item.ownerVersionId === factor.draftVersionId)
      check(`lineage ${key} exact result and source value`, item?.resultMatched && item.result.factorResultId === node.resultSummary.singleResult.resultId && item.result.calcNodeId === node.nodeId && close(item.result.value, state.arithmetic.source[key]), item?.result)
    }
  })
  await run('real grouped warning member pagination and dimension isolation', async () => {
    const id = '102027642461313071'
    const options = await get(`/analysis/warning-rules/scope-options?indicatorVersionId=${id}`)
    check('warning exposes actual composite grain and drill scopes separately', options.some(item => item.targetCode === 'BASE' && item.dimensions.includes('IN_ICD10')) && options.some(item => item.targetCode === 'DRILL:ORGANIZATION:OUT_DEPT'))
    const dictionary = { records: [] }
    for (let page = 1; ; page++) {
      const data = await get(`/meta/departments?page=${page}&size=500`)
      dictionary.records.push(...data.records)
      if (dictionary.records.length >= Number(data.total)) break
    }
    await save('warning-department-dictionary', dictionary)
    let after, all = [], pages = []
    for (let i = 0; i < 200; i++) {
      const params = new URLSearchParams({ indicatorVersionId: id, targetCode: 'BASE', dimension: 'OUT_DEPT_CODE', size: '50', ...(after ? { after } : {}) })
      const data = await get(`/analysis/warning-rules/member-options?${params}`)
      pages.push(data); all.push(...data.values)
      if (!data.nextAfter) break
      assert.notEqual(data.nextAfter, after); after = data.nextAfter
    }
    const dictRows = rows(dictionary)
    const codes = dictRows.map(item => String(item.code ?? item.deptCode ?? item.departmentCode))
    check('warning dept members exactly authoritative dictionary no loss or duplicates', all.length > 0 && new Set(all).size === all.length && isDeepStrictEqual([...all].sort(), [...codes].sort()), { count: all.length, dictRows: dictRows.slice(0, 2), codesCount: codes.length })
    const searched = await get(`/analysis/warning-rules/member-options?${new URLSearchParams({ indicatorVersionId: id, targetCode: 'BASE', dimension: 'OUT_DEPT_CODE', size: '50', search: '9012' })}`)
    check('warning member search includes exact existing code', searched.values.includes('9012'), searched)
    await expectRejected('warning rejects dimension not in selected target', 'GET', `/analysis/warning-rules/member-options?indicatorVersionId=${id}&targetCode=BASE&dimension=NOT_A_DIMENSION`, undefined)
    await save('warning-members-paged', { options, pages, all, searched })
  })
  if (mode === 'final-review') await run('corrected typed CLAMP numerical contract', async () => {
    const c = (value, dimension = 'RATIO') => ({ ...createArithmeticNode('CONST'), value: String(value), typeDescriptor: { valueType: 'DECIMAL', dimension, unit: 'ONE' } })
    const ref = () => ({ nodeType: 'FACTOR_REF', factorVersionId: state.arithmetic.factors.VISITS.draftVersionId })
    const one = { nodeType: 'BINARY', operator: 'DIV', left: ref(), right: ref(), zeroDenominatorPolicy: 'RETURN_NULL' }
    const root = { nodeType: 'FUNCTION', functionCode: 'CLAMP', arguments: [{ nodeType: 'BINARY', operator: 'MUL', left: one, right: c(12, 'ONE') }, c(0), c(10)] }
    const formula = buildArithmeticFormula(root, { display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' }, calculationMode: 'STATIC' })
    const version = await api('POST', `/indicators/${state.perVisit.indicator.id}/versions`, { formula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
    state.clampReviewVersionId = version.id; await checkpoint()
    const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
    const query = await api('POST', `/indicator-versions/${version.id}/query`, { parameters: {} })
    check('CLAMP correctly typed range clips twelve to ten', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status) && close(rows(query)[0]?.value, 10), { compilation, query })
    await save('clamp-corrected', { formula, compilation, query })
  })
  if (mode === 'final-review') await run('production frontend formula common-type compatibility', async () => {
    const ref = () => ({ nodeType: 'FACTOR_REF', factorVersionId: state.arithmetic.factors.VISITS.draftVersionId })
    const ratio = () => ({ nodeType: 'BINARY', operator: 'DIV', left: ref(), right: ref(), zeroDenominatorPolicy: 'RETURN_NULL' })
    const c = value => ({ ...createArithmeticNode('CONST'), value: String(value) })
    for (const [name, root] of [
      ['CLAMP', { nodeType: 'FUNCTION', functionCode: 'CLAMP', arguments: [ratio(), c(0), c(1)] }],
      ['IF_COMPARE', { nodeType: 'FUNCTION', functionCode: 'IF', arguments: [{ nodeType: 'COMPARE', comparator: 'GT', left: ratio(), right: c(0) }, ratio(), ratio()] }]
    ]) {
      check(`frontend ${name} visual validation accepts complete formula`, arithmeticFormulaError(root) === '')
      const formula = buildArithmeticFormula(root, { display: { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' }, calculationMode: 'STATIC' })
      const version = await api('POST', `/indicators/${state.perVisit.indicator.id}/versions`, { formula, calculationMode: 'STATIC', dimensionGrain: [], drillPaths: [] })
      ;(state.frontendFormulaProbes ||= []).push({ name, versionId: version.id }); await checkpoint()
      const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version }, { allowError: true })
      check(`frontend ${name} generated formula backend accepts types`, compilation.http === 200 && ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.data?.status), compilation)
      await save(`frontend-generated-${name}`, { formula, version, compilation })
    }
  })
}

if (mode === 'recycle') await run('isolated soft-delete and restoration lifecycle', async () => {
  const dsl = buildFactorDsl({ tableName: 'vmq_surgeryinfo', aggregation: 'COUNT', calculationMode: 'STATIC' })
  const factor = await api('POST', '/factors', { code: `${state.tag}_RECYCLE_F`, name: `recycle factor ${state.tag}`, dsl })
  const indicator = await api('POST', '/indicators', { code: `${state.tag}_RECYCLE_I`, name: `recycle indicator ${state.tag}`, category: 'QUALITY' })
  state.recycle = { factor: factor.id, indicator: indicator.id }; await checkpoint()
  for (const [plural, resource] of [['factors', factor], ['indicators', indicator]]) {
    assert.ok(resource.code.startsWith(state.tag))
    const impact = await get(`/${plural}/${resource.id}/deletion-impact`)
    await save(`recycle-${plural}-impact`, impact)
    await expectRejected(`${plural} stale delete refused`, 'DELETE', `/${plural}/${resource.id}`, { resourceVersion: resource.resourceVersion + 100, deleteReason: state.tag })
    await api('DELETE', `/${plural}/${resource.id}`, { resourceVersion: resource.resourceVersion, deleteReason: `${state.tag} restoration audit` })
    const detail = await get(`/${plural}/recycle-bin/${resource.id}`)
    check(`${plural} deleted exact resource recorded with reason`, detail.resource.resourceId === resource.id && detail.resource.resourceCode === resource.code && detail.resource.deleteReason === `${state.tag} restoration audit`, detail.resource)
    await expectRejected(`${plural} deleted unavailable from active detail`, 'GET', `/${plural}/${resource.id}`, undefined, [404, 410])
    await expectRejected(`${plural} stale restore refused`, 'POST', `/${plural}/recycle-bin/${resource.id}/restore`, { resourceVersion: detail.resource.resourceVersion + 100 })
    await api('POST', `/${plural}/recycle-bin/${resource.id}/restore`, { resourceVersion: detail.resource.resourceVersion })
    const restored = await get(`/${plural}/${resource.id}`)
    check(`${plural} restore preserves identity code name and draft status`, restored.id === resource.id && restored.code === resource.code && restored.name === resource.name && restored.status === 'DRAFT', restored)
    if (plural === 'factors') check('restored factor retains original DSL', isDeepStrictEqual((await get(`/factor-versions/${resource.draftVersionId}`)).dsl, dsl))
    await save(`recycle-${plural}`, { original: resource, detail, restored })
  }
})

if (mode === 'schedules') await run('disabled isolated schedule persistence and validation', async () => {
  const ownerVersionId = state.nestedFactor.version.id
  const payload = { scheduleCode: `${state.tag}_SCHED`, scheduleName: `disabled audit ${state.tag}`, ownerType: 'FACTOR', ownerVersionId: JSON.rawJSON(ownerVersionId), cronExpression: '0 0 2 1 * *', timezone: 'Asia/Shanghai', periodType: 'MONTHLY', periodOffset: 1, enabled: false }
  await expectRejected('invalid cron rejected', 'POST', '/calc/schedules', { ...payload, scheduleCode: `${state.tag}_BADCRON`, cronExpression: 'not a cron' })
  await expectRejected('invalid timezone rejected', 'POST', '/calc/schedules', { ...payload, scheduleCode: `${state.tag}_BADTZ`, timezone: 'not/a/timezone' })
  const schedule = state.schedule || await api('POST', '/calc/schedules', payload)
  state.schedule = schedule; await checkpoint()
  const stored = await get(`/calc/schedules/${schedule.id}`)
  check('disabled schedule correctly persisted without next trigger', stored.status === 'PAUSED' && stored.nextTriggerAt === null && stored.ownerVersionId === ownerVersionId && stored.cronExpression === payload.cronExpression && stored.timezone === 'Asia/Shanghai', stored)
  const disabled = await api('PATCH', `/calc/schedules/${schedule.id}/status`, { enabled: false })
  check('idempotent disable never starts execution', disabled.status === 'PAUSED' && disabled.nextTriggerAt === null, disabled)
  await save('disabled-schedule', { payload, stored, disabled })
})

if (mode === 'governance') {
  await run('isolated reusable drill path lifecycle', async () => {
    const fields = rows(await get(`/meta/data-domains/${state.domain.id}/physical-tables/vmq_basicinformationba/semantic-fields`))
    const dept = fields.find(item => item.code === 'QA_DEPT'), sex = fields.find(item => item.code === 'QA_SEX')
    assert.ok(dept && sex)
    const levels = [
      { levelCode: 'DEPT', levelName: 'department', dimensionSemanticFieldId: dept.id, memberKeySemanticFieldId: dept.id, allowedColumns: ['QA_DEPT'] },
      { levelCode: 'SEX', levelName: 'gender', dimensionSemanticFieldId: sex.id, memberKeySemanticFieldId: sex.id, allowedColumns: ['QA_SEX'] }
    ]
    let detail = await api('POST', '/meta/drill-paths', { pathCode: `${state.tag}_DRILL`, pathName: `department gender ${state.tag}`, subjectType: 'INDICATOR_RESULT', displayText: 'Department / gender', levels })
    state.drillPath = { id: detail.path.id, versionId: detail.version.id }; await checkpoint()
    check('drill path ordered field identities round trip', detail.levels.every((item, index) => item.dimensionSemanticFieldId === levels[index].dimensionSemanticFieldId && item.levelNo === index + 1), detail)
    const validation = await api('POST', `/meta/drill-path-versions/${detail.version.id}/validate`, {})
    check('drill path metadata validation valid', validation.valid, validation)
    detail = await api('POST', `/meta/drill-path-versions/${detail.version.id}/publish`, { version: validation.resourceVersion })
    check('drill publication pins exact immutable version', detail.path.currentPublishedVersionId === state.drillPath.versionId && detail.version.publicationStatus === 'PUBLISHED')
    await expectRejected('published drill path cannot mutate levels', 'PATCH', `/meta/drill-path-versions/${detail.version.id}`, { version: detail.version.resourceVersion, pathName: 'should not update', levels })
    const copied = await api('POST', `/meta/drill-paths/${detail.path.id}/versions`, { copyFromVersionId: detail.version.id })
    check('drill path copy preserves ordered semantics new draft', copied.version.publicationStatus === 'DRAFT' && copied.levels[1].dimensionSemanticFieldId === sex.id && copied.version.id !== detail.version.id)
    await expectRejected('drill path minimum two levels', 'POST', '/meta/drill-paths', { pathCode: `${state.tag}_DRILL_BAD`, pathName: 'invalid', subjectType: 'INDICATOR_RESULT', levels: levels.slice(0, 1) })
    await save('drill-path-lifecycle', { detail, copied, validation })
  })
  await run('real cross-table relation and join oracle', async () => {
    const source = { physicalTableBindingId: '102027642460323816', domainId: '102027642460323815', domainCode: 'JOIN_TRANSFER_20260910103944', tableName: 'vmq_inpatienttransferdetail' }
    const target = { id: '102027642460323700', domainId: '102027642460323699', tableName: 'vmq_basicinformationzy' }
    const fields = async table => rows(await get(`/meta/data-domains/${table.domainId}/physical-tables/${table.tableName}/semantic-fields`)).map(item => ({ ...item, semanticFieldCode: item.code, relationDataType: item.dataType }))
    const left = await fields(source), right = await fields(target)
    const leftKey = left.find(item => item.sourceFieldName.toLowerCase() === 'in_hospital_id'), rightKey = right.find(item => item.sourceFieldName.toLowerCase() === 'in_hospital_id')
    const payload = tableRelationPayload(source, target, { joinType: 'INNER', cardinality: 'MANY_TO_ONE', keys: [{ left: leftKey.code, right: rightKey.code }] }, left, right)
    let relation = await api('POST', '/meta/physical-table-relations', { code: `${state.tag}_JOIN`, ...payload })
    state.relation = { id: relation.id }; await checkpoint()
    const validation = await api('POST', `/meta/physical-table-relations/${relation.id}/validate`, {})
    check('physical join real keys validation valid', validation.valid, validation)
    relation = await get(`/meta/physical-table-relations/${relation.id}`)
    relation = await api('POST', `/meta/physical-table-relations/${relation.id}/publish`, { resourceVersion: relation.resourceVersion })
    check('published relation exact keys and many-to-one semantics retained', relation.status === 'PUBLISHED' && relation.leftKeySpec.fieldCodes[0] === leftKey.code && relation.rightKeySpec.fieldCodes[0] === rightKey.code && relation.cardinality === 'MANY_TO_ONE')
    const dsl = buildFactorDsl({ domainCode: source.domainCode, tableName: source.tableName, sourceAlias: 'base', joins: [{ relationId: relation.id, fromAlias: 'base', sourceAlias: 'join1' }], aggregation: 'COUNT', periodColumn: 'in_dept_date', filters: { nodeType: 'TRUE' } })
    const factor = await api('POST', '/factors', { code: `${state.tag}_JOIN_F`, name: `join source check ${state.tag}`, dsl })
    state.relation.factorId = factor.id; await checkpoint()
    const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-01-02T00:00:00', parameters: {} })
    const [sourceValue] = await sql('SOURCE', "SELECT COUNT(*) FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON t.in_hospital_id=b.in_hospital_id WHERE t.in_dept_date>='2026-01-01' AND t.in_dept_date<'2026-01-02'", ['value'])
    check('configured join query equals independent source join nonempty', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status) && Number(sourceValue.value) > 0 && close(query.rows[0].factor_value, sourceValue.value), { query, sourceValue })
    const impact = await get(`/factors/${factor.id}/deletion-impact`)
    check('unpublished join factor deletable after query', impact.deletable, impact)
    const fresh = await get(`/factors/${factor.id}`); assert.equal(fresh.code, `${state.tag}_JOIN_F`)
    await api('DELETE', `/factors/${factor.id}`, { resourceVersion: fresh.resourceVersion, deleteReason: `${state.tag} join audit complete` })
    relation = await get(`/meta/physical-table-relations/${relation.id}`)
    const disabled = await api('POST', `/meta/physical-table-relations/${relation.id}/disable`, { resourceVersion: relation.resourceVersion })
    check('test relation disabled without touching shared existing definitions', disabled.enableStatus === 'DISABLED')
    await save('join-lifecycle', { relation, validation, compilation, query, sourceValue, disabled })
  })
  await run('isolated derived factor numerical oracle and dependency protection', async () => {
    const dsl = { ...newDerivedFactor(), calculationMode: 'STATIC', primaryDomain: { domainCode: state.domain.code }, output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: 'RATIO', unit: 'ONE', grain: [] }, expression: {
      nodeType: 'BINARY', operator: 'DIV', zeroDenominatorPolicy: 'RETURN_NULL', left: { nodeType: 'FACTOR_REF', factorVersionId: state.arithmetic.factors.DRUG.draftVersionId, alignmentPolicy: 'STRICT_EQUAL' }, right: { nodeType: 'FACTOR_REF', factorVersionId: state.arithmetic.factors.TOTAL.draftVersionId, alignmentPolicy: 'STRICT_EQUAL' }
    } }
    const factor = await api('POST', '/factors', { code: `${state.tag}_DERIVED`, name: `drug cost fraction ${state.tag}`, dsl })
    state.derived = { id: factor.id, versionId: factor.draftVersionId }; await checkpoint()
    const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`, {})
    check('derived factor freezes two published source dependencies', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
    const query = await api('POST', `/factor-versions/${factor.draftVersionId}/query`, { parameters: {} })
    const expected = Number(state.arithmetic.source.DRUG) / Number(state.arithmetic.source.TOTAL)
    check('derived drug cost fraction equals raw sums division', query.rows.length === 1 && close(query.rows[0].factor_value, expected), { query, expected })
    const graph = await get(`/factor-versions/${factor.draftVersionId}/dependency-graph`)
    check('derived dependency graph retains exact leaf version IDs', JSON.stringify(graph).includes(state.arithmetic.factors.DRUG.draftVersionId) && JSON.stringify(graph).includes(state.arithmetic.factors.TOTAL.draftVersionId))
    const impact = await get(`/factors/${state.arithmetic.factors.DRUG.id}/deletion-impact`)
    check('source factor deletion blocked by published indicator dependencies', impact.deletable === false, impact)
    await save('derived-factor', { factor, compilation, query, expected, graph, impact })
  })
  await run('isolated performance target persistence and optimistic lock', async () => {
    const versionId = state.uiFormula.versionId
    const before = await get(`/indicator-versions/${versionId}/performance-target`)
    const target = await api('PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: '0.95', improvementDirection: 'HIGHER_IS_BETTER', resourceVersion: before.resourceVersion })
    check('performance target exact fractional value not percent scaled twice', close(target.targetValue, 0.95) && target.improvementDirection === 'HIGHER_IS_BETTER', target)
    await expectRejected('stale performance target update refused', 'PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: '0.5', improvementDirection: 'LOWER_IS_BETTER', resourceVersion: before.resourceVersion })
    await expectRejected('half-configured target not persisted', 'PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: '0.5', resourceVersion: target.resourceVersion })
    const cleared = await api('PUT', `/indicator-versions/${versionId}/performance-target`, { targetValue: null, improvementDirection: null, resourceVersion: target.resourceVersion })
    check('performance target explicit clearing preserves null', cleared.targetValue === null && cleared.improvementDirection === null, cleared)
    await save('performance-target', { before, target, cleared })
  })
}

if (mode === 'recovery') await run('isolated calculation cancellation retry and idempotency', async () => {
  const id = state.nestedFactor.version.id
  const header = { headers: { 'X-Idempotency-Key': `${state.tag}_CANCEL_RETRY` } }
  const accepted = await api('POST', `/factor-versions/${id}/trial`, time, header)
  state.recovery = accepted; await checkpoint()
  await api('POST', `/calc/batches/${accepted.batchId}/cancel`, {})
  const replay = await api('POST', `/factor-versions/${id}/trial`, time, header)
  check('cancelled or running trial idempotent replay preserves original batch', replay.batchId === accepted.batchId)
  await expectRejected('same key different date window conflict not stale data', 'POST', `/factor-versions/${id}/trial`, { ...time, periodEnd: '2026-03-01T00:00:00' }, [409])
  let batch = await poll(`/calc/batches/${accepted.batchId}`, ['SUCCEEDED', 'CANCELLED'])
  const cancelled = batch.targets.flatMap(target => target.nodes).filter(node => node.status === 'CANCELLED')
  check('cancel terminal graph consistent no running nodes left', batch.targets.flatMap(target => target.nodes).every(node => !['PENDING', 'RUNNING', 'LEASED'].includes(node.status)), batch)
  await save('recovery-cancelled', batch)
  if (cancelled.length) {
    await api('POST', `/calc/nodes/${cancelled[0].nodeId}/retry`, {})
    const deadline = Date.now() + 60000
    do {
      batch = await get(`/calc/batches/${accepted.batchId}`)
      if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIAL_SUCCEEDED'].includes(batch.status)) break
      await pause(1000)
    } while (Date.now() < deadline)
    check('retry cancelled node succeeds instead of retaining cancellation', batch.status === 'SUCCEEDED', batch)
    check('retry increments attempt without duplicating logical node', batch.targets.flatMap(target => target.nodes).some(node => Number(node.attemptNo) >= 2), batch)
  } else check('fast completion won cancellation race without corrupting success', batch.status === 'SUCCEEDED')
  if (batch.status === 'SUCCEEDED') {
    const result = await get(`/factor-versions/${id}/trials/${accepted.batchId}/results?page=1&size=100`)
    check('recovered trial value still exact independent source', rows(result.results).length === 1 && close(rows(result.results)[0].valueDecimal, state.nestedFactor.source.value), result)
    const node = batch.targets.flatMap(target => target.nodes).find(node => node.status === 'SUCCEEDED')
    await expectRejected('successful node cannot be retried', 'POST', `/calc/nodes/${node.nodeId}/retry`, {}, [409])
    await api('POST', `/calc/batches/${accepted.batchId}/cancel`, {})
    check('late cancellation does not invalidate completed results', (await get(`/calc/batches/${accepted.batchId}`)).status === 'SUCCEEDED')
  }
  await save('recovery-final', batch)
})

if (mode === 'recovery-review') await run('cancelled execution state and true idempotency conflict', async () => {
  const id = state.nestedFactor.version.id, batchId = state.recovery.batchId
  const conflict = await api('POST', `/factor-versions/${id}/trial`, { ...time, periodEnd: '2026-03-01T00:00:00' }, { allowError: true, headers: { 'X-Idempotency-Key': `${state.tag}_CANCEL_RETRY` } })
  check('same supplied idempotency key with different period returns conflict', conflict.http === 409, conflict)
  const batch = await get(`/calc/batches/${batchId}`)
  check('cancelled batch has all latest node attempts cancelled not pending', batch.status === 'CANCELLED' && batch.targets.flatMap(target => target.nodes).every(node => node.status === 'CANCELLED'), batch)
  const node = batch.targets[0].nodes.find(node => node.nodeType === 'FACTOR')
  const retry = await api('POST', `/calc/nodes/${node.nodeId}/retry`, {}, { allowError: true })
  check('cancelled batch factor is eligible for retry', retry.http === 200, retry)
  if (retry.http === 200) await save('recovery-retry-accepted', await poll(`/calc/batches/${batchId}`, ['SUCCEEDED', 'CANCELLED']))
  const completedId = state.arithmetic.formal.batchId
  const completed = await get(`/calc/batches/${completedId}`)
  await api('POST', `/calc/batches/${completedId}/cancel`, {})
  const after = await get(`/calc/batches/${completedId}`)
  check('cancel completed isolated formal batch is no-op preserving results', completed.status === 'SUCCEEDED' && isDeepStrictEqual(completed.targets, after.targets))
  await expectRejected('successful node retry rejected without changing formal result', 'POST', `/calc/nodes/${completed.targets[0].nodes[0].nodeId}/retry`, {}, [409])
  await save('recovery-confirmed', { conflict, batch, retry, completed, after })
})

if (mode === 'closure') await run('retained audit resources safe execution state', async () => {
  const warning = await get(`/analysis/warning-rules/${state.warning.id}`)
  check('isolated warning remains disabled no real-user notification generation', warning.enableStatus === 'DISABLED', { id: warning.id, enableStatus: warning.enableStatus })
  const schedule = await get(`/calc/schedules/${state.schedule.id}`)
  check('isolated schedule remains paused no future trigger', schedule.status === 'PAUSED' && schedule.nextTriggerAt === null, schedule)
  const relation = await get(`/meta/physical-table-relations/${state.relation.id}`)
  check('isolated physical relation remains disabled after verification', relation.enableStatus === 'DISABLED')
  const cancellationRows = await sql('PLATFORM', `SELECT n.id,n.node_execution_status,e.node_execution_status FROM job_calc_node n JOIN job_calc_target t ON t.id=n.calc_target_id JOIN job_calc_node_execution e ON e.calc_node_id=n.id WHERE t.batch_id=${state.recovery.batchId} ORDER BY n.id,e.attempt_no`, ['nodeId', 'logicalStatus', 'attemptStatus'])
  await save('cancellation-database-confirmed', cancellationRows)
  check('cancelled logical node vs latest attempt consistency', cancellationRows.length > 0 && cancellationRows.every(item => item.logicalStatus === item.attemptStatus), cancellationRows)
  const auxiliary = await sql('PLATFORM', `SELECT id,calculation_execution_status FROM job_calc_batch WHERE id>${state.recovery.batchId} AND id<102027642463618000 ORDER BY id`, ['id', 'status'])
  check('auxiliary period trial finished no audit worker left running', auxiliary.every(item => !['QUEUED', 'RUNNING', 'CREATED', 'CANCELLING'].includes(item.status)), auxiliary)
  state.auxiliaryBatches = auxiliary; await checkpoint()
  await save('closure', { warning: { id: warning.id, enableStatus: warning.enableStatus }, schedule, relation: { id: relation.id, enableStatus: relation.enableStatus }, cancellationRows, auxiliary })
})

await checkpoint()
await save(`${mode}-summary`, { mode, base, tag: state.tag, checks, calls })
console.log(JSON.stringify({ mode, passed: checks.filter(item => item.passed).length, failed: checks.filter(item => !item.passed).length, calls: calls.length, folder }))
if (checks.some(item => !item.passed)) process.exitCode = 1
