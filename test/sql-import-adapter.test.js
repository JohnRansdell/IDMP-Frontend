import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSqlIndicatorImportPayload,
  isSqlImportTerminal,
  mergeSqlFactorMetadata,
  normalizeSqlImportPreview,
  normalizeSqlImportTask,
  shouldPollSqlImport
} from '../src/idmp/api/adapters/sqlImport.js'
import { resourceConflictEditorPath, resolveResourceConflict } from '../src/idmp/api/adapters/resourceConflict.js'

test('SQL import preview keeps opaque ids and normalizes generated drafts', () => {
  const preview = normalizeSqlImportPreview({
    valid: false,
    tables: [{
      physicalTable: 'patient_visit',
      selectedViewMappingId: 102027642460316628n,
      candidates: [{ viewMappingId: 102027642460316628n, domainCode: 'INPATIENT', semanticTableCode: 'VISIT' }]
    }],
    factors: [{ key: 'total', suggestedCode: 'TOTAL', suggestedName: 'total', outputAlias: 'total_cnt', dsl: { dslType: 'FACTOR' } }],
    diagnostics: [{ severity: 'error', code: 'SQL-IMPORT-META-003', message: '请选择映射' }]
  })

  assert.equal(preview.tables[0].selectedViewMappingId, '102027642460316628')
  assert.equal(preview.tables[0].candidates[0].viewMappingId, '102027642460316628')
  assert.equal(preview.factors[0].dsl.dslType, 'FACTOR')
  assert.equal(preview.diagnostics[0].severity, 'ERROR')
})

test('SQL import payload contains selected mappings and editable metadata', () => {
  const factors = mergeSqlFactorMetadata(
    [{ key: 'total', code: 'CUSTOM_TOTAL', name: '自定义总数', description: '说明', missingRowPolicy: 'KEEP_NULL' }],
    [
      { key: 'total', suggestedCode: 'TOTAL', suggestedName: 'total' },
      { key: 'rate', suggestedCode: 'RATE', suggestedName: 'rate' }
    ]
  )
  factors[0].missingRowPolicy = 'KEEP_NULL'
  const payload = buildSqlIndicatorImportPayload({
    sql: ' SELECT 1 ',
    tableMappings: { patient_visit: '102027642460316628', ignored: '' },
    indicator: { code: 'RATE_48H', name: '转科比例', category: '医疗质量', description: '' },
    factors
  })

  assert.deepEqual(payload.tableMappings, { patient_visit: '102027642460316628' })
  assert.equal(payload.sql, 'SELECT 1')
  assert.equal(payload.indicatorDescription, null)
  assert.equal(payload.factors[0].code, 'CUSTOM_TOTAL')
  assert.equal(payload.factors[0].missingRowPolicy, 'KEEP_NULL')
  assert.equal(payload.factors[1].code, 'RATE')
})

test('SQL import task preserves opaque IDs and only polls running states', () => {
  const task = normalizeSqlImportTask({
    importId: '7f83dddb-11ee-4ad8-8445-13b43894ed21',
    status: 'RUNNING',
    step: 'CREATE_FACTORS',
    resources: [{ key: 'factor_a', type: 'FACTOR', resourceId: 102027642460316628n }]
  })
  assert.equal(task.resources[0].resourceId, '102027642460316628')
  assert.equal(shouldPollSqlImport(task), true)
  assert.equal(isSqlImportTerminal(task), false)

  const finished = normalizeSqlImportTask({
    importId: task.importId,
    status: 'SUCCEEDED',
    result: { indicatorId: 102027642460316629n, indicatorVersionId: 102027642460316630n }
  })
  assert.equal(finished.result.indicatorId, '102027642460316629')
  assert.equal(shouldPollSqlImport(finished), false)
  assert.equal(isSqlImportTerminal(finished), true)
})

test('name conflicts retain their existing resource and editor route', () => {
  const conflict = resolveResourceConflict({
    status: 409,
    code: 'INDICATOR-40901',
    payload: { data: { id: 102027642460316631n, code: 'EXISTING_RATE', name: '既有指标', status: 'PUBLISHED' } }
  })
  assert.equal(conflict.type, 'indicator')
  assert.equal(conflict.resource.id, '102027642460316631')
  assert.equal(resourceConflictEditorPath(conflict), '/indicator/edit/102027642460316631')
  assert.equal(resolveResourceConflict({ code: 'COMMON-40900', payload: { data: {} } }), null)
})
