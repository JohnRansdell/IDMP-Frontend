import { toOpaqueId } from './resourceId.js'

export function normalizeSemanticFieldBase(item = {}) {
  const semanticKind = String(item.semanticKind || item.semanticRole || item.role || '').toUpperCase()
  const sensitive = [true, 1, '1', 'true'].includes(item.sensitive)
    || Boolean(item.sensitivityLevel && String(item.sensitivityLevel).toUpperCase() !== 'NONE')
  return {
    id: toOpaqueId(item.id ?? item.fieldId),
    code: item.code ?? item.fieldCode ?? item.semanticCode ?? '',
    semanticKind, semanticRole: semanticKind,
    groupable: item.groupable, aggregatable: item.aggregatable, filterable: item.filterable,
    options: item.options || item.values || item.enumValues || [], sensitive,
    sourceFieldName: item.sourceFieldName || item.sourceField || item.sourceColumn || item.columnName || '',
    sourceFieldMappingId: toOpaqueId(item.sourceFieldMappingId ?? item.mappingId),
    valueSetId: toOpaqueId(item.valueSetId), resourceVersion: item.resourceVersion ?? null
  }
}
