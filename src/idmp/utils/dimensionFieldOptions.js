export function dimensionFieldTableGroups(fieldOptions = {}) {
  const groups = new Map()
  for (const field of fieldOptions.fields || []) {
    const reference = String(field.fieldReference || field.fieldCode || '')
    if (!reference) continue
    const tableName = field.tableName || field.physicalTable || fieldOptions.tableName || ''
    const separator = reference.lastIndexOf('.')
    const sourceAlias = separator < 0 ? '' : reference.slice(0, separator)
    const key = JSON.stringify([tableName, sourceAlias])
    if (!groups.has(key)) groups.set(key, { key, tableName, sourceAlias, fields: [] })
    groups.get(key).fields.push({ ...field, fieldReference: reference })
  }
  return [...groups.values()].map(group => {
    const repeatedTable = [...groups.values()].filter(item => item.tableName === group.tableName).length > 1
    const name = group.tableName || '未提供物理表名称'
    return { ...group, label: repeatedTable && group.sourceAlias ? `${name}（${group.sourceAlias}）` : name }
  })
}

export function dimensionFieldTableKey(groups, reference) {
  return groups.find(group => group.fields.some(field => field.fieldReference === reference))?.key || ''
}
