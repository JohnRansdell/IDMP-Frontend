function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

function cleanMappings(tableMappings = {}) {
  return Object.fromEntries(Object.entries(tableMappings)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, toOpaqueId(value)]))
}

export function buildSqlImportCreatePayload({ sql, tableMappings, definitionType = 'SQL' } = {}) {
  const mappings = cleanMappings(tableMappings)
  return { sql: String(sql || '').trim(), ...(Object.keys(mappings).length ? { tableMappings: mappings } : {}), definitionType }
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
    factors: Array.isArray(preview.factors) ? preview.factors.map((factor) => ({
      key: String(factor.key || ''), suggestedCode: String(factor.suggestedCode || factor.code || ''),
      suggestedName: String(factor.suggestedName || factor.name || ''), outputAlias: String(factor.outputAlias || ''),
      timeFields: collectTimeFields({
        ...factor,
        timeFields: factor.timeFields || preview.timeFields?.[factor.key] || preview.candidateTimeFields?.[factor.key]
      }), dsl: factor.dsl || {}
    })) : [],
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

function collectTimeFields(factor = {}) {
  const explicit = factor.timeFields || factor.candidateTimeFields || factor.timeFieldCandidates || factor.availableTimeFields || []
  const fields = Array.isArray(explicit) ? explicit.map((item) => String(item?.fieldName || item?.fieldCode || item)) : []
  collectPeriodFields(factor.dsl, fields)
  return [...new Set(fields.filter(Boolean))]
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
      calculationMode: saved?.calculationMode || (saved?.timeField ? 'TEMPORAL' : 'STATIC'), timeField: saved?.timeField || ''
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

export function buildSqlImportTrialPayload(factors = [], period = []) {
  return (factors || []).some((factor) => String(factor.calculationMode).toUpperCase() === 'TEMPORAL')
    ? { periodStart: period?.[0], periodEnd: period?.[1] } : {}
}

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
    result: data.result ? { ...data.result, indicatorId: toOpaqueId(data.result.indicatorId), indicatorVersionId: toOpaqueId(data.result.indicatorVersionId), initializationBatchId: toOpaqueId(data.result.initializationBatchId) } : null
  }
}

export function isSqlImportTerminal(task) { return SQL_IMPORT_TERMINAL_STATUSES.has(String(task?.status || '').toUpperCase()) }
export function shouldPollSqlImport(task) { return SQL_IMPORT_RUNNING_STATUSES.has(String(task?.status || '').toUpperCase()) }
export function canSubmitSqlImportMetadata(task) { return String(task?.status || '').toUpperCase() === 'AWAITING_METADATA' }
export function canTrialSqlImport(task) { return String(task?.status || '').toUpperCase() === 'READY_FOR_TRIAL' }
export function canFinalizeSqlImport(task) { return String(task?.status || '').toUpperCase() === 'TRIAL_SUCCEEDED' }
