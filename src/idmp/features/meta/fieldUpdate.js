export function buildSemanticFieldUpdate(detail, changes) {
  if (detail?.resourceVersion == null || typeof detail.nullable !== 'boolean') {
    throw new Error('字段信息不完整，映射尚未保存，请刷新字段信息后重试。')
  }

  return {
    resourceVersion: detail.resourceVersion,
    name: changes.name,
    valueType: changes.dataType,
    semanticKind: changes.semanticKind,
    unit: detail.unit ?? null,
    nullable: detail.nullable,
    valueSetId: detail.valueSetId ?? null,
    sensitivityLevel: changes.sensitive
      ? (detail.sensitivityLevel && detail.sensitivityLevel !== 'NONE' ? detail.sensitivityLevel : 'LOW')
      : 'NONE',
    maskingPolicy: detail.maskingPolicy ?? {}
  }
}
