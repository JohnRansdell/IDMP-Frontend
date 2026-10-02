import { factorPeriodColumn, withoutLegacyPeriod } from './factorPeriod.js'

export function templatePeriodField(definition) {
  return definition?.nodeType ? factorPeriodColumn({ filters: definition }) : factorPeriodColumn(definition)
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
  const filters = withoutLegacyPeriod(filter)
  const { aggregationField, periodColumn, ...extra } = designer.extraDefinition || {}
  return {
    ...extra, schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: mode, primaryDomain,
    ...(mode === 'TEMPORAL' && designer.periodFieldCode ? { periodColumn: designer.periodFieldCode } : {}),
    filters, aggregation, groupBy: designer.groupBy || [], parameters: designer.runtimeParameters || [],
    output: { valueType: designer.output.valueType, semanticKind: 'MEASURE', dimension: designer.aggregation === 'COUNT' ? 'COUNT' : 'VALUE', unit: designer.output.unit, nullable: false, precision: Number(designer.output.precision || 30), scale: Number(designer.output.scale ?? 10), grain: [] },
    applicableDomains: designer.domainCode ? [{ domainCode: designer.domainCode }] : [],
    allowedGrains: designer.allowedGrains,
    drillPathVersionIds: designer.drillPathVersionIds.map(String).filter(id => /^\d+$/.test(id))
  }
}
