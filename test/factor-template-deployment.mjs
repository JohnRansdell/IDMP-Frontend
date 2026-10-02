import { api, check, checks, finish, pause, poll, run, save } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const prefix = 'TEMPLATE_FIX_' + Date.now()
const fixtures = { factors: [], templates: [] }
const paths = await db('PLATFORM', "SELECT JSON_OBJECT('id',id) FROM meta_drill_path_version WHERE status='PUBLISHED' AND publication_status='PUBLISHED' ORDER BY id DESC LIMIT 1")
try {
  for (const mode of ['STATIC', 'TEMPORAL']) await run(mode + '-template-lifecycle', async () => {
    const temporal = mode === 'TEMPORAL'
    const filter = { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: { parameterRef: 'LEVEL' } }
    const definition = {
      schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: mode,
      primaryDomain: { domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', sourceAlias: 'base' },
      aggregation: { function: 'COUNT', ...(!temporal ? { fieldCode: { parameterRef: 'FIELD' } } : {}) },
      filters: temporal ? { nodeType: 'AND', children: [filter, { nodeType: 'PREDICATE', fieldCode: 'SurgeryStartTime', operator: 'BETWEEN', parameter: 'period' }] } : filter,
      groupBy: [], parameters: [], output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO',
      allowedGrains: ['MONTHLY', 'YEARLY'], drillPathVersionIds: paths.map(path => String(path.id)),
    }
    const parameters = [{ code: 'LEVEL', displayName: '手术级别', dataType: 'STRING', required: true, exposed: true, defaultValue: temporal ? null : '3', valueSourceType: 'MANUAL', displayOrder: 0 }, ...(!temporal ? [{ code: 'FIELD', displayName: '计数字段', dataType: 'FIELD_REF', required: true, exposed: true, defaultValue: null, valueSourceType: 'FIXED', displayOrder: 1 }] : [])]
    let template = await api('POST', '/factor-templates', { code: prefix + '_' + mode, name: '物理表模板修复验收 ' + prefix + ' ' + mode, factorTypeScope: 'AGGREGATE', templateDefinition: definition, parameters })
    fixtures.templates.push({ id: template.template.id, versionId: template.version.id })
    await save('fixtures', fixtures)
    const version = template.version.id
    if (!temporal) {
      for (const [name, mutate, expected] of [
        ['missing-table', dsl => { delete dsl.primaryDomain.tableName }, 'PHYSICAL_TABLE_REQUIRED'],
        ['foreign-field', dsl => { dsl.filters.fieldCode = 'foreign_table_field' }, 'DSL-RESOLVE-004'],
        ['raw-sql', dsl => { dsl.whereSql = '1=1' }, 'RAW_SQL_FORBIDDEN'],
      ]) {
        const bad = structuredClone(definition); mutate(bad)
        template = await api('PATCH', `/factor-template-versions/${version}`, { resourceVersion: template.version.resourceVersion, templateDefinition: bad, parameters })
        const validation = await api('POST', `/factor-template-versions/${version}/validate`)
        check(name + '-rejected', !validation.valid && validation.diagnostics.some(item => item.code === expected), validation)
        template = await api('GET', `/factor-template-versions/${version}`)
      }
      await api('PATCH', `/factor-template-versions/${version}`, { resourceVersion: template.version.resourceVersion, templateDefinition: definition, parameters })
    }
    const validation = await api('POST', `/factor-template-versions/${version}/validate`)
    if (!check(mode + '-physical-template-valid', validation.valid, validation)) throw new Error('模板校验失败')
    template = await api('POST', `/factor-template-versions/${version}/publish`, { resourceVersion: validation.resourceVersion })
    check(mode + '-template-published', template.version.publicationStatus === 'PUBLISHED')
    const schema = await api('GET', `/factor-templates/${template.template.id}/parameter-schema`)
    check(mode + '-drill-ids-preserved', String(schema.drillPathVersionIds[0]) === String(paths[0]?.id), schema)
    if (!temporal) {
      const invalid = await api('POST', `/factor-template-versions/${version}/instantiate`, { factorCode: prefix + '_BAD', factorName: '不应创建的非法字段因子 ' + prefix, parameterValues: { FIELD: 'foreign_table_field' } }, { allowError: true })
      check('invalid-instance-rejected-before-create', invalid.http === 400, invalid)
      const list = await api('GET', `/factors?code=${prefix}_BAD`)
      check('invalid-instance-no-half-created-factor', Number(list.total) === 0, list)
    }
    const instance = await api('POST', `/factor-template-versions/${version}/instantiate`, { factorCode: prefix + '_' + mode + '_F', factorName: '模板实例验收 ' + prefix + ' ' + mode, category: 'QUALITY', parameterValues: temporal ? { LEVEL: '3' } : { FIELD: 'surgery_level' } })
    fixtures.factors.push(instance.factor.id); await save('fixtures', fixtures)
    check(mode + '-generated-physical-dsl', instance.generatedDsl.primaryDomain.tableName === 'vmq_surgeryinfo' && instance.effectiveParameters.LEVEL === '3', instance)
    const factorVersion = instance.factor.draftVersionId
    const compilation = await api('POST', `/factor-versions/${factorVersion}/compile`)
    if (!check(mode + '-instance-compiled', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)) throw new Error('实例编译失败')
    const period = temporal ? { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-01-02T00:00:00' } : {}
    const trial = await api('POST', `/factor-versions/${factorVersion}/trial`, period)
    await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 90000)
    const results = await api('GET', `/factor-versions/${factorVersion}/trials/${trial.batchId}/results`)
    const resultRows = results.results?.records || results.records || []
    const truth = (await db('SOURCE', `SELECT JSON_OBJECT('value',COUNT(*)) FROM vmq_surgeryinfo WHERE surgery_level='3'${temporal ? " AND SurgeryStartTime >= '2026-01-01' AND SurgeryStartTime < '2026-01-02'" : ''}`))[0]
    const actual = resultRows[0]?.valueDecimal ?? resultRows[0]?.value
    check(mode + '-trial-value-matches-source', resultRows.length === 1 && Number(actual) === Number(truth.value), { results, truth })
    await api('POST', `/factor-versions/${factorVersion}/publish`)
    const publishedFactor = await api('GET', `/factor-versions/${factorVersion}`)
    check(mode + '-factor-published', publishedFactor.status === 'PUBLISHED', publishedFactor)
    const instances = await api('GET', `/factor-template-versions/${version}/instances`)
    check(mode + '-template-origin-preserved', instances.records.some(factor => String(factor.id) === String(instance.factor.id)))
    await save(mode + '-lifecycle', { template, schema, instance, compilation, trial, results, truth })
  })
} finally {
  for (const id of fixtures.factors) await run('cleanup-' + id, async () => {
    for (let i = 0; i < 30; i++) { if ((await api('GET', `/factors/${id}/deletion-impact`)).deletable) break; await pause(1000) }
    const factor = await api('GET', `/factors/${id}`)
    await api('DELETE', `/factors/${id}`, { resourceVersion: factor.resourceVersion, deleteReason: '因子模板修复验收结束' })
    check('recycled-' + id, true)
  })
  await save('fixtures', fixtures); await finish()
  if (checks.some(item => !item.passed)) process.exitCode = 1
}
