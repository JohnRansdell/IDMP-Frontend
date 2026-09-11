function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

export function normalizeSqlImportPreview(payload = {}) {
  return {
    valid: payload.valid === true,
    normalizedSql: String(payload.normalizedSql || ''),
    tables: Array.isArray(payload.tables) ? payload.tables.map((table) => ({
      physicalTable: String(table.physicalTable || ''),
      selectedViewMappingId: toOpaqueId(table.selectedViewMappingId),
      candidates: Array.isArray(table.candidates) ? table.candidates.map((candidate) => ({
        viewMappingId: toOpaqueId(candidate.viewMappingId),
        domainCode: String(candidate.domainCode || ''),
        semanticTableCode: String(candidate.semanticTableCode || ''),
        defaultTimeFieldCode: String(candidate.defaultTimeFieldCode || '')
      })) : []
    })) : [],
    factors: Array.isArray(payload.factors) ? payload.factors.map((factor) => ({
      key: String(factor.key || ''),
      suggestedCode: String(factor.suggestedCode || ''),
      suggestedName: String(factor.suggestedName || ''),
      outputAlias: String(factor.outputAlias || ''),
      dsl: factor.dsl || {}
    })) : [],
    formula: payload.formula ? {
      template: payload.formula.template || {},
      displayText: String(payload.formula.displayText || '')
    } : null,
    period: payload.period ? {
      start: String(payload.period.start || ''),
      end: String(payload.period.end || ''),
      endInclusive: payload.period.endInclusive === true
    } : null,
    diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics.map((item) => ({
      severity: String(item.severity || 'ERROR').toUpperCase(),
      code: String(item.code || ''),
      path: String(item.path || ''),
      message: String(item.message || ''),
      suggestion: String(item.suggestion || '')
    })) : []
  }
}

export function mergeSqlFactorMetadata(current = [], drafts = []) {
  const existing = new Map(current.map(item => [String(item.key || '').toUpperCase(), item]))
  return drafts.map((draft) => {
    const saved = existing.get(String(draft.key || '').toUpperCase())
    return {
      key: draft.key,
      code: saved?.code || draft.suggestedCode,
      name: saved?.name || draft.suggestedName,
      description: saved?.description || ''
    }
  })
}

export function buildSqlIndicatorImportPayload({ sql, tableMappings, indicator, factors }) {
  const mappings = Object.fromEntries(Object.entries(tableMappings || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, toOpaqueId(value)]))
  return {
    sql: String(sql || '').trim(),
    tableMappings: mappings,
    indicatorCode: String(indicator?.code || '').trim(),
    indicatorName: String(indicator?.name || '').trim(),
    indicatorDescription: String(indicator?.description || '').trim() || null,
    category: String(indicator?.category || '').trim() || null,
    factors: (factors || []).map(item => ({
      key: String(item.key || '').trim(),
      code: String(item.code || '').trim(),
      name: String(item.name || '').trim(),
      description: String(item.description || '').trim() || null
    }))
  }
}
