export function newTableRelationCode(cryptoApi = globalThis.crypto) {
  // 公网 HTTP 页面没有 randomUUID，getRandomValues 仍可用于生成配置编码。
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  return `JOIN_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export function tableRelationPayload(source, target, form, sourceFields, targetFields) {
  if (!source?.physicalTableBindingId || !target?.id) throw new Error('请选择要关联的物理表')
  if (String(source.physicalTableBindingId) === String(target.id)) throw new Error('关联表不能与当前来源表相同')
  if (!['INNER', 'LEFT'].includes(form.joinType)) throw new Error('请选择关联方式')
  if (!['ONE_TO_ONE', 'MANY_TO_ONE'].includes(form.cardinality)) throw new Error('请选择一对一或多对一关联')
  if (!form.keys?.length) throw new Error('请至少配置一组关联字段')
  const left = [], right = []
  for (const key of form.keys) {
    const from = sourceFields.find(field => field.semanticFieldCode === key.left)
    const to = targetFields.find(field => field.semanticFieldCode === key.right)
    if (!from || !to) throw new Error('请选择完整的两侧关联字段')
    if (from.relationDataType && to.relationDataType && from.relationDataType.toUpperCase() !== to.relationDataType.toUpperCase()) {
      throw new Error('两侧关联字段类型不一致，请选择相同类型的字段')
    }
    if (left.includes(key.left) || right.includes(key.right)) throw new Error('同一侧的关联字段不能重复选择')
    left.push(key.left); right.push(key.right)
  }
  // 关系接口仍以内部字段编码保存关联键，因子 DSL 则继续使用物理字段。
  return { leftPhysicalTableBindingId: String(source.physicalTableBindingId), rightPhysicalTableBindingId: String(target.id),
    joinType: form.joinType, cardinality: form.cardinality, leftKeySpec: { fieldCodes: left }, rightKeySpec: { fieldCodes: right } }
}

export function relationValidationMessage(result) {
  const diagnostics = (result?.diagnostics || []).filter(item => String(item.severity || '').toUpperCase() !== 'WARNING')
  return diagnostics.map(item => item.message?.replaceAll('语义表', '物理表')).filter(Boolean).join('；') || '关联配置校验未通过，请检查两侧字段和表的发布状态'
}
