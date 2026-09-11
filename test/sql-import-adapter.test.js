import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSqlIndicatorImportPayload,
  mergeSqlFactorMetadata,
  normalizeSqlImportPreview
} from '../src/idmp/api/adapters/sqlImport.js'

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
    [{ key: 'total', code: 'CUSTOM_TOTAL', name: '自定义总数', description: '说明' }],
    [
      { key: 'total', suggestedCode: 'TOTAL', suggestedName: 'total' },
      { key: 'rate', suggestedCode: 'RATE', suggestedName: 'rate' }
    ]
  )
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
  assert.equal(payload.factors[1].code, 'RATE')
})
