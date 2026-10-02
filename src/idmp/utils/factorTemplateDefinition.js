export function templatePeriodField(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.nodeType === 'PREDICATE' && node.parameter === 'period') return node.fieldCode || ''
  for (const child of Object.values(node)) {
    const field = templatePeriodField(child)
    if (field) return field
  }
  return ''
}

export function buildFactorTemplateDefinition(designer) {
  const mode = designer.calculationMode || 'TEMPORAL'
  const primaryDomain = { ...designer.primaryOptions, domainCode: designer.domainCode, tableName: designer.tableName }
  const aggregation = { function: designer.aggregation }
  if (designer.fieldCode) aggregation.fieldCode = designer.fieldCode
  else if (designer.extraDefinition?.aggregationField) Object.assign(aggregation, designer.extraDefinition.aggregationField)
  const filter = designer.templateFilter?.enabled
    ? { nodeType: 'PREDICATE', fieldCode: designer.templateFilter.fieldCode, operator: designer.templateFilter.operator, value: { parameterRef: designer.templateFilter.parameterCode } }
    : designer.filters || { nodeType: 'TRUE' }
  const stripPeriod = node => {
    if (!node || typeof node !== 'object') return node
    if (node.nodeType === 'PREDICATE' && node.parameter === 'period') return { nodeType: 'TRUE' }
    if (Array.isArray(node)) return node.map(stripPeriod)
    const result = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, stripPeriod(value)]))
    if (result.nodeType === 'AND') {
      result.children = (result.children || []).filter(child => child?.nodeType !== 'TRUE')
      if (!result.children.length) return { nodeType: 'TRUE' }
    }
    return result
  }
  const businessFilter = stripPeriod(filter)
  const filters = mode === 'TEMPORAL'
    ? { nodeType: 'AND', children: [...(businessFilter.nodeType === 'TRUE' ? [] : [businessFilter]), { nodeType: 'PREDICATE', fieldCode: designer.periodFieldCode, operator: 'BETWEEN', parameter: 'period' }] }
    : businessFilter
  const { aggregationField, ...extra } = designer.extraDefinition || {}
  return {
    ...extra, schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: mode, primaryDomain,
    filters, aggregation, groupBy: designer.groupBy || [], parameters: designer.runtimeParameters || [],
    output: { valueType: designer.output.valueType, semanticKind: 'MEASURE', dimension: designer.aggregation === 'COUNT' ? 'COUNT' : 'VALUE', unit: designer.output.unit, nullable: false, precision: Number(designer.output.precision || 30), scale: Number(designer.output.scale ?? 10), grain: [] },
    applicableDomains: designer.domainCode ? [{ domainCode: designer.domainCode }] : [],
    allowedGrains: designer.allowedGrains,
    drillPathVersionIds: designer.drillPathVersionIds.map(String).filter(id => /^\d+$/.test(id))
  }
}
