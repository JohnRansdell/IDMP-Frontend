function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

function cleanMappings(tableMappings = {}) {
  return Object.fromEntries(Object.entries(tableMappings)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, toOpaqueId(value)]))
}

export const SQL_RUNTIME_PARAMETER_TYPES = ['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME']
export const SQL_RUNTIME_PARAMETER_MODES = ['TEMPORARY', 'DIMENSION']

export function normalizeSqlRuntimeParameter(parameter = {}) {
  const type = String(parameter.type || 'STRING').toUpperCase()
  const parameterMode = String(parameter.parameterMode || 'TEMPORARY').toUpperCase()
  return {
    code: String(parameter.code || '').trim(),
    type: SQL_RUNTIME_PARAMETER_TYPES.includes(type) ? type : 'STRING',
    required: parameter.required === true,
    parameterMode: SQL_RUNTIME_PARAMETER_MODES.includes(parameterMode) ? parameterMode : 'TEMPORARY'
  }
}

export function collectSqlRuntimeParameters(factors = []) {
  const declarations = new Map()
  ;(factors || []).forEach((factor) => {
    ;(factor.parameters || []).map(normalizeSqlRuntimeParameter).filter(item => item.code).forEach((item) => {
      const identity = `${item.type}|${item.required}|${item.parameterMode}`
      const current = declarations.get(item.code)
      if (!current) declarations.set(item.code, { ...item, factorKeys: [String(factor.key || '')], conflict: false, identities: [identity] })
      else {
        current.factorKeys.push(String(factor.key || ''))
        if (!current.identities.includes(identity)) current.identities.push(identity)
        current.conflict = current.identities.length > 1
      }
    })
  })
  return [...declarations.values()].map(({ identities, ...item }) => item)
}

export function buildSqlRuntimeParameterValues(declarations, values = {}) {
  return Object.fromEntries(declarations.flatMap((declaration) => {
    const value = values?.[declaration.code]
    if (value === undefined || value === null || value === '') return []
    if (declaration.type === 'INTEGER') return [[declaration.code, Number.parseInt(value, 10)]]
    if (declaration.type === 'DECIMAL') return [[declaration.code, Number(value)]]
    if (declaration.type === 'BOOLEAN') return [[declaration.code, value === true || value === 'true']]
    return [[declaration.code, String(value)]]
  }))
}

export function hasActiveTemporarySqlRuntimeParameters(declarations = [], values = {}) {
  const submitted = buildSqlRuntimeParameterValues(declarations, values)
  return declarations.some(item => item.parameterMode === 'TEMPORARY' && Object.hasOwn(submitted, item.code))
}

export function buildSqlImportCreatePayload({ sql, tableMappings, definitionType = 'SQL' } = {}) {
  const mappings = cleanMappings(tableMappings)
  return { sql: String(sql || '').trim(), ...(Object.keys(mappings).length ? { tableMappings: mappings } : {}), definitionType }
}

export function validateSqlRuntimeParameterSyntax(sql = '') {
  const parameterCodes = [...String(sql).matchAll(/(^|[^:]):([A-Za-z][A-Za-z0-9_]*)\b/g)]
    .map((match) => match[2])
  const uniqueCodes = [...new Set(parameterCodes)]
  if (!uniqueCodes.length) return ''
  const legacyParameters = uniqueCodes.map(code => `:${code}`).join('、')
  const templateParameters = uniqueCodes.map(code => `{{${code}}}`).join('、')
  return `SQL 业务参数不支持冒号写法 ${legacyParameters}。请把完整筛选条件写成可选模板，例如 [[AND 字段 = {{${uniqueCodes[0]}}}]]；参数占位符为 ${templateParameters}`
}

export function normalizeSqlImportPreview(payload = {}) {
  const preview = payload?.preview || payload || {}
  const tableRows = normalizePreviewTableRows(preview)
  return {
    valid: preview.valid !== false,
    normalizedSql: String(preview.normalizedSql || ''),
    tables: tableRows.map((table) => ({
      physicalTable: String(table.physicalTable || table.tableName || ''),
      selectedViewMappingId: toOpaqueId(table.selectedViewMappingId || table.viewMappingId || table.mappingId),
      candidates: (table.candidates || table.mappingCandidates || table.candidateMappings || table.viewMappings || []).map((candidate) => ({
        viewMappingId: toOpaqueId(candidate.viewMappingId || candidate.id), domainCode: String(candidate.domainCode || ''),
        semanticTableCode: String(candidate.semanticTableCode || candidate.tableCode || ''), defaultTimeFieldCode: String(candidate.defaultTimeFieldCode || '')
      }))
    })),
    factors: Array.isArray(preview.factors) ? preview.factors.map((factor) => {
      const timeFieldOptions = collectTimeFieldOptions({
        ...factor,
        timeFieldOptions: factor.timeFieldOptions || factor.timeFields || preview.timeFields?.[factor.key] || preview.candidateTimeFields?.[factor.key]
      })
      return {
        key: String(factor.key || ''), suggestedCode: String(factor.suggestedCode || factor.code || ''),
        suggestedName: String(factor.suggestedName || factor.name || ''), outputAlias: String(factor.outputAlias || ''),
        timeFieldOptions, timeFields: timeFieldOptions.map(item => item.fieldReference),
        parameters: (factor.parameters || factor.dsl?.parameters || []).map(normalizeSqlRuntimeParameter), dsl: factor.dsl || {}
      }
    }) : [],
    formula: preview.formula ? { template: preview.formula.template || preview.formula, displayText: String(preview.formula.displayText || '') } : null,
    diagnostics: Array.isArray(preview.diagnostics) ? preview.diagnostics.map((item) => ({
      severity: String(item.severity || 'ERROR').toUpperCase(), code: String(item.code || ''), path: String(item.path || ''),
      message: String(item.message || ''), suggestion: String(item.suggestion || '')
    })) : []
  }
}

function normalizePreviewTableRows(preview = {}) {
  if (Array.isArray(preview.tables)) return preview.tables
  if (Array.isArray(preview.tableMappings)) return preview.tableMappings
  if (preview.tableMappings && typeof preview.tableMappings === 'object') {
    return Object.entries(preview.tableMappings).map(([physicalTable, mapping]) => ({
      physicalTable,
      ...(typeof mapping === 'object' ? mapping : { viewMappingId: mapping })
    }))
  }
  const flatCandidates = preview.mappingCandidates || preview.candidateMappings || preview.tableMappingCandidates
  if (!Array.isArray(flatCandidates)) return []
  const grouped = new Map()
  flatCandidates.forEach((candidate) => {
    const physicalTable = String(candidate.physicalTable || candidate.tableName || '')
    if (!physicalTable) return
    if (!grouped.has(physicalTable)) grouped.set(physicalTable, { physicalTable, candidates: [] })
    const row = grouped.get(physicalTable)
    if (Array.isArray(candidate.candidates)) row.candidates.push(...candidate.candidates)
    else row.candidates.push(candidate)
    if (candidate.selectedViewMappingId || candidate.viewMappingId && candidate.selected === true) {
      row.selectedViewMappingId = candidate.selectedViewMappingId || candidate.viewMappingId
    }
  })
  return [...grouped.values()]
}

function collectTimeFieldOptions(factor = {}) {
  const explicit = factor.timeFieldOptions || factor.timeFields || factor.candidateTimeFields || factor.timeFieldCandidates || factor.availableTimeFields || []
  const options = Array.isArray(explicit) ? explicit.map(normalizeTimeFieldOption).filter(item => item.fieldReference) : []
  const periodFields = []
  collectPeriodFields(factor.dsl, periodFields)
  periodFields.forEach((fieldReference) => {
    if (!options.some(item => item.fieldReference === fieldReference)) {
      options.push(normalizeTimeFieldOption({ fieldReference, recommended: true, recommendationReasons: ['SQL 中已使用的周期字段'] }))
    }
  })
  return [...new Map(options.map(item => [item.fieldReference, item])).values()]
    .sort((left, right) => Number(right.recommended) - Number(left.recommended) || Number(right.priority || 0) - Number(left.priority || 0))
}

function normalizeTimeFieldOption(item) {
  if (typeof item === 'string' || typeof item === 'number') {
    return { fieldReference: String(item), physicalTable: '', sqlAlias: '', columnName: String(item), columnType: '', comment: '', priority: 0, recommended: false, recommendationReasons: [] }
  }
  const option = item && typeof item === 'object' ? item : {}
  const columnName = String(option.columnName || option.fieldName || option.fieldCode || '')
  const fieldReference = String(option.fieldReference || option.reference || (option.sqlAlias && columnName ? `${option.sqlAlias}.${columnName}` : columnName))
  return {
    physicalTable: String(option.physicalTable || option.tableName || ''), sqlAlias: String(option.sqlAlias || option.tableAlias || ''),
    columnName: columnName || fieldReference, fieldReference, columnType: String(option.columnType || option.dataType || ''),
    comment: String(option.comment || option.description || ''), priority: Number(option.priority || 0), recommended: option.recommended === true,
    recommendationReasons: Array.isArray(option.recommendationReasons) ? option.recommendationReasons.map(String) : []
  }
}

function collectPeriodFields(node, fields) {
  if (!node || typeof node !== 'object') return
  if (node.nodeType === 'PREDICATE' && node.parameter === 'period') {
    const field = node.fieldCode || (node.fieldRef?.sourceAlias && node.fieldRef?.fieldCode ? `${node.fieldRef.sourceAlias}.${node.fieldRef.fieldCode}` : node.fieldRef?.fieldCode)
    if (field) fields.push(String(field))
  }
  collectPeriodFields(node.filters, fields)
  collectPeriodFields(node.child, fields)
  ;(node.children || []).forEach((child) => collectPeriodFields(child, fields))
}

export function mergeSqlFactorMetadata(current = [], drafts = []) {
  const existing = new Map(current.map(item => [String(item.key || '').toUpperCase(), item]))
  return drafts.map((draft) => {
    const saved = existing.get(String(draft.key || '').toUpperCase())
    return {
      key: draft.key, code: saved?.code || draft.suggestedCode, name: saved?.name || draft.suggestedName,
      description: saved?.description || '', missingRowPolicy: saved?.missingRowPolicy || 'KEEP_NULL',
      calculationMode: saved?.calculationMode || (saved?.timeField ? 'TEMPORAL' : 'STATIC'),
      timeField: saved?.timeField || draft.timeFieldOptions?.find(item => item.recommended)?.fieldReference || '',
      parameters: (saved?.parameters || draft.parameters || []).map(normalizeSqlRuntimeParameter)
    }
  })
}

export function buildSqlImportMetadataPayload({ scope, category, indicator, factors } = {}) {
  const normalizedScope = scope === 'FACTORS_ONLY' ? 'FACTORS_ONLY' : 'FACTORS_AND_INDICATOR'
  const payload = {
    scope: normalizedScope, ...(String(category || '').trim() ? { category: String(category).trim() } : {}),
    factors: (factors || []).map((item) => {
      const calculationMode = String(item.calculationMode || 'STATIC').toUpperCase()
      return {
        key: String(item.key || '').trim(), code: String(item.code || '').trim(), name: String(item.name || '').trim(),
        ...(String(item.description || '').trim() ? { description: String(item.description).trim() } : {}),
        ...(item.missingRowPolicy ? { missingRowPolicy: item.missingRowPolicy } : {}), calculationMode,
        ...((item.parameters || []).length ? { parameters: item.parameters.map(normalizeSqlRuntimeParameter) } : {}),
        ...(calculationMode === 'TEMPORAL' && String(item.timeField || '').trim() ? { timeField: String(item.timeField).trim() } : {})
      }
    })
  }
  if (normalizedScope === 'FACTORS_AND_INDICATOR') Object.assign(payload, {
    indicatorCode: String(indicator?.code || '').trim(), indicatorName: String(indicator?.name || '').trim(),
    ...(String(indicator?.description || '').trim() ? { indicatorDescription: String(indicator.description).trim() } : {}),
    timeDrillEnabled: Boolean(indicator?.timeDrillEnabled), formula: indicator?.formula || {}
  })
  return payload
}

export function buildSqlImportTrialPayload(factors = [], period = [], parameterValues = {}) {
  const payload = (factors || []).some((factor) => String(factor.calculationMode).toUpperCase() === 'TEMPORAL')
    ? { periodStart: period?.[0], periodEnd: period?.[1] } : {}
  const declarations = collectSqlRuntimeParameters(factors)
  if (declarations.length) payload.parameters = buildSqlRuntimeParameterValues(declarations, parameterValues)
  return payload
}

export function validateSqlRuntimeParameterValues(declarations = [], values = {}) {
  const conflicts = declarations.filter(item => item.conflict).map(item => item.code)
  if (conflicts.length) return `同名参数声明不一致：${conflicts.join('、')}`
  const missing = declarations.filter(item => item.required && (values[item.code] === undefined || values[item.code] === null || values[item.code] === '')).map(item => item.code)
  return missing.length ? `请填写必填参数：${missing.join('、')}` : ''
}

export const buildSqlRuntimeQueryPayload = buildSqlImportTrialPayload

export const SQL_IMPORT_RUNNING_STATUSES = new Set(['RUNNING', 'ABANDONING'])
export const SQL_IMPORT_TERMINAL_STATUSES = new Set(['SUCCEEDED', 'ABANDONED', 'CLEANUP_FAILED'])

export function normalizeSqlImportTask(payload = {}) {
  const data = payload?.data || payload || {}
  return {
    importId: toOpaqueId(data.importId), status: String(data.status || 'AWAITING_METADATA').toUpperCase(), step: String(data.step || ''), statusUrl: String(data.statusUrl || ''),
    preview: normalizeSqlImportPreview(data.preview || {}), error: data.error == null ? null : String(data.error?.message || data.error),
    resources: Array.isArray(data.resources) ? data.resources.map((resource) => ({
      key: String(resource.key || ''), type: String(resource.type || ''), resourceId: toOpaqueId(resource.resourceId), versionId: toOpaqueId(resource.versionId),
      artifactId: toOpaqueId(resource.artifactId), compiled: resource.compiled === true, published: resource.published === true,
      diagnostics: Array.isArray(resource.diagnostics) ? resource.diagnostics : [], trial: resource.trial || null
    })) : [],
    result: data.result ? {
      ...data.result,
      indicatorId: toOpaqueId(data.result.indicatorId), indicatorVersionId: toOpaqueId(data.result.indicatorVersionId),
      initializationBatchId: toOpaqueId(data.result.initializationBatchId),
      factors: (data.result.factors || []).map(item => ({
        ...item, factorId: toOpaqueId(item.factorId), factorVersionId: toOpaqueId(item.factorVersionId), artifactId: toOpaqueId(item.artifactId)
      }))
    } : null
  }
}

export function isSqlImportTerminal(task) { return SQL_IMPORT_TERMINAL_STATUSES.has(String(task?.status || '').toUpperCase()) }
export function shouldPollSqlImport(task) { return SQL_IMPORT_RUNNING_STATUSES.has(String(task?.status || '').toUpperCase()) }
export function canSubmitSqlImportMetadata(task) { return String(task?.status || '').toUpperCase() === 'AWAITING_METADATA' }
export function canTrialSqlImport(task) { return String(task?.status || '').toUpperCase() === 'READY_FOR_TRIAL' }
export function canFinalizeSqlImport(task) { return String(task?.status || '').toUpperCase() === 'TRIAL_SUCCEEDED' }

export function nextSqlImportCode(value) {
  const code = String(value || '').trim().toUpperCase()
  if (!code) return ''
  const match = code.match(/^(.*)_R(\d+)$/)
  if (!match) return `${code}_R02`
  const width = Math.max(2, match[2].length)
  return `${match[1]}_R${String(Number(match[2]) + 1).padStart(width, '0')}`
}

export function normalizeSqlImportOperationError(error = {}) {
  const payload = error?.payload || {}
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {}
  const message = String(payload?.message || error?.message || 'SQL 导入操作失败')
  const code = String(payload?.code || error?.code || '')
  const status = Number(error?.status || payload?.status || 0)
  const conflict = status === 409 || /409/.test(code) || /(因子|指标|资源).*(编码|名称).*(存在|重复|占用)|code.*(exist|duplicate|conflict)/i.test(message)
  const candidate = data.existingResource || data.resource || data.conflictResource || (data.id || data.resourceId ? data : null)
  const resource = candidate && typeof candidate === 'object' ? {
    id: toOpaqueId(candidate.id || candidate.resourceId),
    type: String(candidate.type || candidate.resourceType || (code.includes('INDICATOR') ? 'INDICATOR' : code.includes('FACTOR') ? 'FACTOR' : '')),
    code: String(candidate.code || candidate.resourceCode || candidate.factorCode || candidate.indicatorCode || ''),
    name: String(candidate.name || candidate.resourceName || candidate.factorName || candidate.indicatorName || ''),
    status: String(candidate.status || candidate.publicationStatus || '')
  } : null
  return { conflict, status, code, message, traceId: String(payload?.traceId || error?.traceId || ''), resource }
}
