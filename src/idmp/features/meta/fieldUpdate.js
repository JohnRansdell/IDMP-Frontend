export function buildSemanticFieldUpdate(detail, changes) {
  if (detail?.resourceVersion == null || typeof detail.nullable !== 'boolean') {
    throw new Error('后端未返回编辑所需的版本号或可空信息，映射尚未保存。')
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
