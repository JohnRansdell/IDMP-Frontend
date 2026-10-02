import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSqlImportCreatePayload,
  buildSqlImportMetadataPayload,
  buildSqlImportTrialPayload,
  buildSqlRuntimeParameterValues,
  collectSqlRuntimeParameters,
  hasActiveTemporarySqlRuntimeParameters,
  canFinalizeSqlImport,
  canSubmitSqlImportMetadata,
  canTrialSqlImport,
  isSqlImportTerminal,
  mergeSqlFactorMetadata,
  nextSqlImportCode,
  normalizeSqlImportPreview,
  normalizeSqlImportOperationError,
  normalizeSqlImportTask,
  shouldPollSqlImport,
  sqlImportResourceTypeLabel,
  sqlImportStatusLabel,
  sqlImportStepLabel,
  validateSqlRuntimeParameterSyntax,
  validateSqlRuntimeParameterValues
} from '../src/idmp/api/adapters/sqlImport.js'
import { resourceConflictEditorPath, resolveResourceConflict } from '../src/idmp/api/adapters/resourceConflict.js'
import { sqlImportGroupingFields, sqlImportGroupingFieldLabels, normalizeDimensionGrain, validateSqlDimensionBindings, selectSqlDimensionBindings } from '../src/idmp/features/indicator/grouping.js'

test('SQL import preserves physical field choices and submits per-factor grouping bindings', () => {
  const preview = normalizeSqlImportPreview({ factors: [{ key: 'total', groupingSupported: true, dimensionFieldOptions: [{ physicalTable: 'visit', sqlAlias: 'b', columnName: 'dept_code', fieldReference: 'b.dept_code', columnType: 'varchar', comment: '科室' }] }] })
  assert.equal(preview.factors[0].groupingSupported, true)
  assert.equal(preview.factors[0].dimensionFieldOptions[0].fieldReference, 'b.dept_code')
  const factors = [{ key: 'total', code: 'TOTAL', name: '入院人次', calculationMode: 'STATIC', dimensionBindings: { DEPT_CODE: 'b.dept_code' } }]
  const indicator = { code: 'RATE', name: '比例', dimensionGrain: ['dept_code'], drillPaths: [{ pathCode: 'ORGANIZATION', maxLevel: 'ATTENDING_DOCTOR', pathVersionId: '102027642461313071' }] }
  const payload = buildSqlImportMetadataPayload({ scope: 'FACTORS_AND_INDICATOR', factors, indicator })
  assert.deepEqual(payload.dimensionGrain, ['DEPT_CODE'])
  assert.equal(payload.drillPaths[0].pathVersionId, '102027642461313071')
  assert.deepEqual(payload.factors[0].dimensionBindings, factors[0].dimensionBindings)
  assert.deepEqual(mergeSqlFactorMetadata(factors, preview.factors)[0].dimensionBindings, factors[0].dimensionBindings)
  const only = buildSqlImportMetadataPayload({ scope: 'FACTORS_ONLY', factors, indicator })
  assert.equal(Object.hasOwn(only, 'dimensionGrain'), false)
  assert.equal(Object.hasOwn(only.factors[0], 'dimensionBindings'), false)
  const resumed = normalizeSqlImportTask({ metadata: payload, preview })
  assert.deepEqual(resumed.metadata.dimensionGrain, ['DEPT_CODE'])
  assert.equal(resumed.metadata.drillPaths[0].pathVersionId, '102027642461313071')
})

test('SQL import mappings follow the selected path depth and never guess ambiguous joins', () => {
  const catalog = [{ version: { id: '91' }, levels: [
    { levelCode: 'HOSPITAL' },
    { levelCode: 'OUT_DEPT', dimensionSemanticFieldCode: 'DEPT_CODE', memberKeySemanticFieldCode: 'DEPT_CODE', displaySemanticFieldCode: 'DEPT_NAME' },
    { levelCode: 'ATTENDING_DOCTOR', dimensionSemanticFieldCode: 'DOCTOR_CODE', displaySemanticFieldCode: 'DOCTOR_NAME' }
  ] }]
  assert.deepEqual(sqlImportGroupingFields([{ pathCode: 'ORGANIZATION', pathVersionId: '91', maxLevel: 'OUT_DEPT' }], ['diagnosis'], catalog), ['DIAGNOSIS', 'DEPT_CODE', 'DEPT_NAME'])
  const options = [{ columnName: 'dept_code', fieldReference: 'b.dept_code' }, { columnName: 'dept_code', fieldReference: 't.dept_code' }]
  assert.match(validateSqlDimensionBindings([{ key: 'total', dimensionBindings: {} }], [{ key: 'total', dimensionFieldOptions: options }], ['DEPT_CODE']), /选择物理字段/)
  assert.deepEqual(selectSqlDimensionBindings({ dimensionBindings: { DEPT_CODE: 'b.dept_code', DOCTOR_CODE: 'b.doctor_code' } }, ['DEPT_CODE']), { DEPT_CODE: 'b.dept_code' })
})

test('SQL import labels drill mappings in Chinese without changing binding keys or user names', () => {
  const catalog = [{ version: { id: '91' }, levels: [
    { levelCode: 'OUT_DEPT', levelName: '出院科室', dimensionSemanticFieldCode: 'OUT_DEPT_CODE', memberKeySemanticFieldCode: 'OUT_DEPT_CODE', displaySemanticFieldCode: 'OUT_DEPT_NAME' },
    { levelCode: 'ATTENDING_DOCTOR', levelName: '主治医生', dimensionSemanticFieldCode: 'ATTENDING_DOCTOR', memberKeySemanticFieldCode: 'ATTENDING_DOCTOR', displaySemanticFieldCode: 'ATTENDING_DOCTOR_NAME' }
  ] }]
  const paths = [{ pathCode: 'ORGANIZATION', pathVersionId: '91', maxLevel: 'ATTENDING_DOCTOR' }]
  const labels = sqlImportGroupingFieldLabels(paths, ['科室', 'CUSTOM_NAME'], catalog)
  assert.deepEqual(labels, { 科室: '科室', CUSTOM_NAME: 'CUSTOM_NAME', OUT_DEPT_CODE: '出院科室编码', OUT_DEPT_NAME: '出院科室名称', ATTENDING_DOCTOR: '主治医生编码', ATTENDING_DOCTOR_NAME: '主治医生名称' })
  assert.match(validateSqlDimensionBindings([{ key: 'total', name: '入院人次', dimensionBindings: {} }], [], ['ATTENDING_DOCTOR'], labels), /主治医生编码/)
  assert.equal(sqlImportGroupingFieldLabels(paths, ['OUT_DEPT_CODE'], catalog).OUT_DEPT_CODE, 'OUT_DEPT_CODE')
  assert.equal(sqlImportGroupingFieldLabels([{ ...paths[0], maxLevel: 'OUT_DEPT' }], [], catalog).ATTENDING_DOCTOR, undefined)
  assert.deepEqual(Object.keys(labels), sqlImportGroupingFields(paths, ['科室', 'CUSTOM_NAME'], catalog))
})

test('user-defined dimensions bind different physical columns without semantic inference', () => {
  const drafts = [{ key: 'numerator', dimensionFieldOptions: [{ columnName: 'dept_code', fieldReference: 'b.dept_code' }] }, { key: 'denominator', dimensionFieldOptions: [{ columnName: 'department_id', fieldReference: 'a.department_id' }] }]
  const factors = [{ key: 'numerator', code: 'NUMERATOR', name: '分子', dimensionBindings: { 科室: 'b.dept_code' } }, { key: 'denominator', code: 'DENOMINATOR', name: '分母', dimensionBindings: { 科室: 'a.department_id' } }]
  assert.deepEqual(normalizeDimensionGrain([' 科室 ', 'disease']), ['科室', 'DISEASE'])
  assert.equal(validateSqlDimensionBindings(factors, drafts, ['科室']), '')
  assert.match(validateSqlDimensionBindings([{ ...factors[0], dimensionBindings: {} }], drafts, ['科室']), /分子.*科室.*选择物理字段/)
  assert.match(validateSqlDimensionBindings([{ ...factors[1], dimensionBindings: { 科室: 'b.dept_code' } }], drafts, ['科室']), /不属于当前 SQL/)
  const payload = buildSqlImportMetadataPayload({ scope: 'FACTORS_AND_INDICATOR', factors, indicator: { code: 'RATE', name: '比例', dimensionGrain: ['科室'] } })
  assert.deepEqual(payload.dimensionGrain, ['科室'])
  assert.equal(payload.factors[1].dimensionBindings.科室, 'a.department_id')
  assert.throws(() => normalizeDimensionGrain(['科室', '科室']), /重复/)
  assert.throws(() => normalizeDimensionGrain(['科室;SELECT']), /只能包含/)
  assert.throws(() => normalizeDimensionGrain(['factor_value']), /系统计算结果/)
})

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

test('SQL import conflict recovery advances a stable run code and preserves conflict evidence', () => {
  assert.equal(nextSqlImportCode('UAT_FACTOR_R01'), 'UAT_FACTOR_R02')
  assert.equal(nextSqlImportCode('UAT_FACTOR_R009'), 'UAT_FACTOR_R010')
  assert.equal(nextSqlImportCode('UAT_FACTOR'), 'UAT_FACTOR_R02')
  const conflict = normalizeSqlImportOperationError({
    status: 409,
    code: 'FACTOR-40901',
    traceId: 'trace-conflict',
    payload: { code: 'FACTOR-40901', message: '因子编码已经存在', traceId: 'trace-conflict', data: { id: 99n, code: 'UAT_FACTOR_R01', status: 'DRAFT' } }
  })
  assert.equal(conflict.conflict, true)
  assert.equal(conflict.traceId, 'trace-conflict')
  assert.equal(conflict.resource.id, '99')
  assert.equal(conflict.resource.code, 'UAT_FACTOR_R01')
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

test('SQL import preserves rich time-field options and submits the recommended field reference', () => {
  const preview = normalizeSqlImportPreview({
    factors: [{
      key: 'admission_count',
      timeFieldOptions: [{
        physicalTable: 'patient_visit', sqlAlias: 'v', columnName: 'ADMISSION_TIME',
        fieldReference: 'v.ADMISSION_TIME', columnType: 'datetime', comment: '入院时间',
        priority: 100, recommended: true, recommendationReasons: ['SQL 中已使用日期范围谓词']
      }, {
        physicalTable: 'patient_visit', sqlAlias: 'v', columnName: 'DISCHARGE_TIME',
        fieldReference: 'v.DISCHARGE_TIME', columnType: 'datetime', priority: 20, recommended: false
      }]
    }]
  })

  assert.equal(preview.factors[0].timeFieldOptions[0].fieldReference, 'v.ADMISSION_TIME')
  assert.equal(preview.factors[0].timeFieldOptions[0].recommended, true)
  assert.deepEqual(preview.factors[0].timeFieldOptions[0].recommendationReasons, ['SQL 中已使用日期范围谓词'])
  assert.deepEqual(preview.factors[0].timeFields, ['v.ADMISSION_TIME', 'v.DISCHARGE_TIME'])

  const factors = mergeSqlFactorMetadata([], preview.factors)
  factors[0].calculationMode = 'TEMPORAL'
  assert.equal(factors[0].timeField, 'v.ADMISSION_TIME')
  assert.equal(buildSqlImportMetadataPayload({ scope: 'FACTORS_ONLY', factors }).factors[0].timeField, 'v.ADMISSION_TIME')
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

test('SQL import submits typed runtime parameter declarations and values', () => {
  const factors = [{
    key: 'transfer_count', code: 'TRANSFER_COUNT', name: '转科人次', calculationMode: 'TEMPORAL', timeField: 'b.In_Date',
    parameters: [
      { code: 'deptCode', type: 'STRING', required: true, parameterMode: 'TEMPORARY' },
      { code: 'minimumHours', type: 'INTEGER', required: false, parameterMode: 'TEMPORARY' },
      { code: 'includeCancelled', type: 'BOOLEAN', required: false, parameterMode: 'TEMPORARY' }
    ]
  }]
  const metadata = buildSqlImportMetadataPayload({ scope: 'FACTORS_ONLY', factors })
  assert.deepEqual(metadata.factors[0].parameters, factors[0].parameters)
  assert.deepEqual(buildSqlImportTrialPayload(factors, ['2026-01-01T00:00:00', '2026-02-01T00:00:00'], {
    deptCode: '4', minimumHours: '48', includeCancelled: 'false', ignored: 'x'
  }), {
    periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00',
    parameters: { deptCode: '4', minimumHours: 48, includeCancelled: false }
  })
})

test('SQL import rejects legacy colon runtime parameters before creating resources', () => {
  assert.equal(validateSqlRuntimeParameterSyntax('SELECT 1'), '')
  assert.equal(validateSqlRuntimeParameterSyntax('SELECT * FROM visit b WHERE 1=1 [[AND b.dept_code = {{deptCode}}]]'), '')
  assert.match(validateSqlRuntimeParameterSyntax('SELECT * FROM visit b WHERE b.dept_code = :deptCode'), /:deptCode/)
  assert.match(validateSqlRuntimeParameterSyntax('WHERE a = :deptCode OR b = :deptCode AND c > :minimumHours'), /\{\{minimumHours\}\}/)
})

test('SQL import reports incompatible declarations sharing one request parameter code', () => {
  const declarations = collectSqlRuntimeParameters([
    { key: 'numerator', parameters: [{ code: 'deptCode', type: 'STRING', required: true, parameterMode: 'TEMPORARY' }] },
    { key: 'denominator', parameters: [{ code: 'deptCode', type: 'INTEGER', required: true, parameterMode: 'TEMPORARY' }] }
  ])
  assert.equal(declarations.length, 1)
  assert.equal(declarations[0].conflict, true)
  assert.deepEqual(declarations[0].factorKeys, ['numerator', 'denominator'])
  assert.equal(validateSqlRuntimeParameterValues(declarations, { deptCode: '4' }), '同名参数声明不一致：deptCode')
})

test('SQL runtime parameter values preserve declared types and validate required values', () => {
  const declarations = [
    { code: 'deptCode', type: 'STRING', required: true, parameterMode: 'TEMPORARY' },
    { code: 'minimumHours', type: 'INTEGER', required: false, parameterMode: 'TEMPORARY' },
    { code: 'ratio', type: 'DECIMAL', required: false, parameterMode: 'TEMPORARY' },
    { code: 'enabled', type: 'BOOLEAN', required: false, parameterMode: 'TEMPORARY' }
  ]
  assert.equal(validateSqlRuntimeParameterValues(declarations, {}), '请填写必填参数：deptCode')
  assert.equal(validateSqlRuntimeParameterValues(declarations, { deptCode: '4' }), '')
  assert.deepEqual(buildSqlRuntimeParameterValues(declarations, {
    deptCode: '4', minimumHours: '48', ratio: '1.25', enabled: 'false', ignored: 'x'
  }), { deptCode: '4', minimumHours: 48, ratio: 1.25, enabled: false })
})

test('SQL import hides parser internals and explains JSON pasted into the SQL editor', () => {
  const raw = 'SQL语法解析失败: Encountered unexpected token: "{" "{" at line 1, column 1. Was expecting one of: SELECT'
  const preview = normalizeSqlImportPreview({
    normalizedSql: '{"sql":"SELECT 1"}',
    diagnostics: [{ severity: 'ERROR', code: 'SQL-IMPORT-004', message: raw, suggestion: '请按MySQL 8 SELECT语法修正SQL' }]
  })
  assert.match(preview.diagnostics[0].message, /JSON 配置/)
  assert.match(preview.diagnostics[0].suggestion, /SELECT 或 WITH/)
  assert.doesNotMatch(preview.diagnostics[0].message, /unexpected token/)

  const sqlPreview = normalizeSqlImportPreview({
    normalizedSql: 'SELECT COUNT( FROM visit',
    diagnostics: [{ code: 'SQL-IMPORT-004', message: raw }]
  })
  assert.match(sqlPreview.diagnostics[0].message, /SQL 语句格式有误/)
  assert.match(normalizeSqlImportOperationError({ message: raw }).message, /SQL 语句格式有误/)
  assert.match(normalizeSqlImportTask({ error: raw }).error, /SQL 语句格式有误/)
})

test('SQL import replaces legacy task and compile errors with actionable Chinese text', () => {
  const task = normalizeSqlImportTask({
    status: 'FAILED', step: 'FACTOR_TRIAL:total',
    error: 'total trial failed (batch 123): java.sql.SQLException: Unknown column',
    resources: [{ key: 'total', type: 'FACTOR', diagnostics: [
      { code: 'SQL-FACTOR-005', message: 'Encountered unexpected token: FROM at line 1, column 10' }
    ] }]
  })
  assert.match(task.error, /因子“total”试算失败/)
  assert.match(task.error, /批次编号 123/)
  assert.doesNotMatch(task.error, /SQLException/)
  assert.match(task.resources[0].diagnostics[0].message, /SQL 语句格式有误/)
  assert.equal(sqlImportStatusLabel(task.status), '失败')
  assert.equal(sqlImportStepLabel(task.step), '正在试算因子')
  assert.equal(sqlImportStepLabel('CREATE_FACTORS'), '正在创建因子')
  assert.equal(sqlImportResourceTypeLabel(task.resources[0].type), '因子')
  assert.equal(normalizeSqlImportOperationError({ message: 'Failed to fetch' }, '解析失败').message, '解析失败')
})

test('SQL import carries inferred parameter types from preview through metadata and trial', () => {
  const preview = normalizeSqlImportPreview({
    factors: [{
      key: 'admission_count', suggestedCode: 'ADMISSION_COUNT', suggestedName: '入院人次',
      dsl: { parameters: [
        { code: 'startDate', type: 'DATETIME', required: false, parameterMode: 'TEMPORARY' },
        { code: 'minimumAge', type: 'INTEGER', required: false, parameterMode: 'TEMPORARY' },
        { code: 'patientName', type: 'STRING', required: false, parameterMode: 'TEMPORARY' }
      ] }
    }]
  })
  const factors = mergeSqlFactorMetadata([], preview.factors)
  assert.deepEqual(factors[0].parameters.map(item => item.type), ['DATETIME', 'INTEGER', 'STRING'])

  const metadata = buildSqlImportMetadataPayload({ scope: 'FACTORS_ONLY', factors })
  assert.deepEqual(metadata.factors[0].parameters, factors[0].parameters)
  assert.deepEqual(buildSqlImportTrialPayload(factors, [], {
    startDate: '2026-01-01T00:00:00', minimumAge: '18', patientName: '张'
  }).parameters, {
    startDate: '2026-01-01T00:00:00', minimumAge: 18, patientName: '张'
  })
})

test('optional temporary declarations only require runtime query when a value is submitted', () => {
  const declarations = [
    { code: 'startDate', type: 'DATETIME', required: false, parameterMode: 'TEMPORARY' },
    { code: 'patientName', type: 'STRING', required: false, parameterMode: 'TEMPORARY' },
    { code: 'includeCancelled', type: 'BOOLEAN', required: false, parameterMode: 'TEMPORARY' },
    { code: 'deptCode', type: 'STRING', required: false, parameterMode: 'DIMENSION' }
  ]
  assert.equal(hasActiveTemporarySqlRuntimeParameters(declarations, {}), false)
  assert.equal(hasActiveTemporarySqlRuntimeParameters(declarations, { startDate: '', patientName: null }), false)
  assert.equal(hasActiveTemporarySqlRuntimeParameters(declarations, { deptCode: 'A1' }), false)
  assert.equal(hasActiveTemporarySqlRuntimeParameters(declarations, { patientName: '张' }), true)
  assert.equal(hasActiveTemporarySqlRuntimeParameters(declarations, { includeCancelled: false }), true)
  assert.equal(hasActiveTemporarySqlRuntimeParameters([{ code: 'count', type: 'INTEGER', parameterMode: 'TEMPORARY' }], { count: 0 }), true)
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
