import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSqlImportCreatePayload,
  buildSqlImportMetadataPayload,
  buildSqlImportTrialPayload,
  canFinalizeSqlImport,
  canSubmitSqlImportMetadata,
  canTrialSqlImport,
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

test('SQL import preview exposes alternate mapping candidates and period fields from DSL', () => {
  const preview = normalizeSqlImportPreview({
    tableMappings: { patient_visit: { mappingId: 101n, mappingCandidates: [{ id: 101n, domainCode: 'INPATIENT', tableCode: 'VISIT' }] } },
    factors: [{ key: 'admission_count', dsl: { filters: { nodeType: 'PREDICATE', fieldRef: { sourceAlias: 'v', fieldCode: 'ADMISSION_TIME' }, operator: 'BETWEEN', parameter: 'period' } } }]
  })
  assert.equal(preview.tables[0].selectedViewMappingId, '101')
  assert.equal(preview.tables[0].candidates[0].semanticTableCode, 'VISIT')
  assert.deepEqual(preview.factors[0].timeFields, ['v.ADMISSION_TIME'])
})

test('SQL import preview groups top-level mapping candidates and factor time-field maps', () => {
  const preview = normalizeSqlImportPreview({
    mappingCandidates: [
      { physicalTable: 'patient_visit', viewMappingId: 101n, domainCode: 'INPATIENT', semanticTableCode: 'VISIT' },
      { physicalTable: 'patient_visit', viewMappingId: 102n, domainCode: 'EMERGENCY', semanticTableCode: 'VISIT' }
    ],
    timeFields: { admission_count: ['v.ADMISSION_TIME'] },
    factors: [{ key: 'admission_count' }]
  })
  assert.equal(preview.tables.length, 1)
  assert.equal(preview.tables[0].candidates.length, 2)
  assert.deepEqual(preview.factors[0].timeFields, ['v.ADMISSION_TIME'])
})

test('SQL import separates creation, metadata and trial payloads', () => {
  const factors = mergeSqlFactorMetadata(
    [{ key: 'total', code: 'CUSTOM_TOTAL', name: '自定义总数', description: '说明', missingRowPolicy: 'KEEP_NULL' }],
    [
      { key: 'total', suggestedCode: 'TOTAL', suggestedName: 'total' },
      { key: 'rate', suggestedCode: 'RATE', suggestedName: 'rate' }
    ]
  )
  factors[0].missingRowPolicy = 'KEEP_NULL'
  const createPayload = buildSqlImportCreatePayload({
    sql: ' SELECT 1 ',
    tableMappings: { patient_visit: '102027642460316628', ignored: '' }
  })
  const metadataPayload = buildSqlImportMetadataPayload({
    scope: 'FACTORS_AND_INDICATOR', category: '医疗质量',
    indicator: { code: 'RATE_48H', name: '转科比例', description: '', timeDrillEnabled: false, formula: { root: {} } },
    factors
  })

  assert.deepEqual(createPayload.tableMappings, { patient_visit: '102027642460316628' })
  assert.equal(createPayload.sql, 'SELECT 1')
  assert.equal(metadataPayload.indicatorCode, 'RATE_48H')
  assert.equal('tableMappings' in metadataPayload, false)
  assert.equal(metadataPayload.factors[0].code, 'CUSTOM_TOTAL')
  assert.equal(metadataPayload.factors[0].missingRowPolicy, 'KEEP_NULL')
  assert.deepEqual(buildSqlImportTrialPayload([{ calculationMode: 'STATIC' }]), {})
  assert.deepEqual(buildSqlImportTrialPayload([{ calculationMode: 'TEMPORAL' }], ['2026-01-01', '2026-02-01']), { periodStart: '2026-01-01', periodEnd: '2026-02-01' })
  assert.deepEqual(buildSqlImportTrialPayload([{ calculationMode: 'STATIC' }, { calculationMode: 'TEMPORAL' }], ['2026-01-01', '2026-02-01']), { periodStart: '2026-01-01', periodEnd: '2026-02-01' })
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
  assert.equal(canSubmitSqlImportMetadata({ status: 'AWAITING_METADATA' }), true)
  assert.equal(canTrialSqlImport({ status: 'READY_FOR_TRIAL' }), true)
  assert.equal(canFinalizeSqlImport({ status: 'TRIAL_SUCCEEDED' }), true)

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
