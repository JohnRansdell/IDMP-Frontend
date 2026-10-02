export function fieldReferenceCode(reference) {
  if (typeof reference === 'string') return reference.trim()
  return reference?.sourceAlias ? `${reference.sourceAlias}.${reference.fieldCode}` : reference?.fieldCode || ''
}

export function legacyPeriodFields(node, result = []) {
  if (!node || typeof node !== 'object') return result
  if (node.nodeType === 'PREDICATE' && node.operator === 'BETWEEN' && node.parameter === 'period') {
    const field = fieldReferenceCode(node.fieldRef || node.fieldCode)
    if (field) result.push(field)
  }
  for (const child of node.children || []) legacyPeriodFields(child, result)
  if (node.child) legacyPeriodFields(node.child, result)
  return result
}

export function factorPeriodColumn(dsl = {}) {
  return fieldReferenceCode(dsl.periodColumn) || legacyPeriodFields(dsl.filters)[0] || ''
}

export function factorCalculationMode(dsl = {}) {
  const mode = String(dsl.calculationMode || '').toUpperCase()
  if (['STATIC', 'TEMPORAL'].includes(mode)) return mode
  if (factorPeriodColumn(dsl)) return 'TEMPORAL'
  // Legacy ordinary factors can inherit a governed table's default time field.
  return dsl.definitionType === 'SQL' ? 'STATIC' : 'TEMPORAL'
}

export function withoutLegacyPeriod(node) {
  if (!node || node.nodeType === 'TRUE') return { nodeType: 'TRUE' }
  if (node.nodeType === 'PREDICATE') {
    return node.operator === 'BETWEEN' && node.parameter === 'period' ? { nodeType: 'TRUE' } : node
  }
  if (node.nodeType !== 'AND') {
    if (legacyPeriodFields(node).length) throw new Error('周期条件不能位于“或”或“非”条件内，请单独配置统计周期字段。')
    return node
  }
  const children = (node.children || []).map(withoutLegacyPeriod).filter(child => child.nodeType !== 'TRUE')
  return children.length ? { ...node, children } : { nodeType: 'TRUE' }
}

export function canonicalPeriodColumn(periodColumn, filters, fields = []) {
  const configured = fieldReferenceCode(periodColumn)
  const legacy = legacyPeriodFields(filters)
  const selected = configured || legacy[0] || ''
  const identity = code => {
    const field = fields.find(item => item.code === code
      || (item.code?.includes('.') ? `${item.sourceAlias}.${item.semanticFieldCode}` : item.semanticFieldCode) === code
      || `${item.sourceAlias}.${item.physicalColumn}` === code)
    return field?.code || code
  }
  if (legacy.some(field => identity(field) !== identity(selected))) {
    throw new Error('统计周期字段与旧周期条件不一致，请统一时间字段后再保存。')
  }
  return selected
}
