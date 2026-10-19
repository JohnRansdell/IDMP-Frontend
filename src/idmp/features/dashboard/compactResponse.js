import { immutableResultRows } from './resultRows.js'

export function expandDashboardResponse(batch) {
  if (!batch || !['COMPACT', 'COLUMNAR'].includes(batch.responseFormat)) return batch
  const fail = () => { throw new Error('看板数据格式不完整，请刷新后重试') }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (batch.formatVersion !== 1 || !isObject(batch.widgets) || !isObject(batch.dataSets)) fail()
  const decoded = new Map()
  const widgets = Object.fromEntries(Object.entries(batch.widgets).map(([code, widget]) => {
    if (!isObject(widget) || typeof widget.dataSetId !== 'string') fail()
    const id = widget.dataSetId
    if (!decoded.has(id)) {
      if (!Object.hasOwn(batch.dataSets, id)) fail()
      const data = batch.responseFormat === 'COLUMNAR' ? expandColumns(batch.dataSets[id], fail) : batch.dataSets[id]
      if (!isObject(data) || !Array.isArray(data.fields) || !Array.isArray(data.rows) || !Array.isArray(data.rowDrillContexts)
        || data.rows.length !== data.rowDrillContexts.length || !isObject(data.drillContexts)) fail()
      const rows = data.rows.map((row, index) => {
        if (!isObject(row)) fail()
        const reference = data.rowDrillContexts[index]
        if (reference === null) return row
        if (!isObject(reference) || !Object.hasOwn(data.drillContexts, reference.contextId)
          || !isObject(data.drillContexts[reference.contextId]) || !Object.hasOwn(reference, 'filters')) fail()
        return { ...row, drillContext: { ...data.drillContexts[reference.contextId], filters: reference.filters } }
      })
      decoded.set(id, { fields: data.fields, rows: immutableResultRows(rows) })
    }
    const { dataSetId, ...metadata } = widget
    return [code, { ...metadata, ...decoded.get(id) }]
  }))
  const { dataSets, responseFormat, formatVersion, ...result } = batch
  return { ...result, widgets }
}

function expandColumns(data, fail) {
  if (!data || !Array.isArray(data.fields) || !Array.isArray(data.contextIds) || !Array.isArray(data.nullFilters)) fail()
  const decode = table => {
    if (!table || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0 || !Array.isArray(table.columns)) fail()
    const rows = Array.from({ length: table.rowCount }, () => ({}))
    const names = new Set()
    for (const column of table.columns) {
      if (!column || typeof column.name !== 'string' || names.has(column.name) || !Array.isArray(column.values)) fail()
      names.add(column.name)
      const indices = column.indices
      if (indices == null ? column.values.length !== rows.length : !Array.isArray(indices) || indices.length !== rows.length) fail()
      for (let index = 0; index < rows.length; index++) {
        const position = indices == null ? index : indices[index]
        if (indices != null && position === -1) continue
        if (!Number.isSafeInteger(position) || position < 0 || position >= column.values.length) fail()
        const value = column.values[position]
        if (column.name === '__proto__') Object.defineProperty(rows[index], column.name, { value, enumerable: true, writable: true, configurable: true })
        else rows[index][column.name] = value
      }
    }
    return rows
  }
  const rows = decode(data.rows)
  const filters = decode(data.filters)
  if (rows.length !== filters.length || rows.length !== data.contextIds.length) fail()
  const nullFilters = new Set(data.nullFilters)
  if (data.nullFilters.some(index => !Number.isSafeInteger(index) || index < 0 || index >= rows.length)) fail()
  return { fields: data.fields, rows, drillContexts: data.drillContexts,
    rowDrillContexts: data.contextIds.map((contextId, index) => contextId === null ? null
      : { contextId, filters: nullFilters.has(index) ? null : filters[index] }) }
}
