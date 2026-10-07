export function expandDashboardResponse(batch) {
  if (!batch || batch.responseFormat !== 'COMPACT') return batch
  const fail = () => { throw new Error('看板数据格式不完整，请刷新后重试') }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (batch.formatVersion !== 1 || !isObject(batch.widgets) || !isObject(batch.dataSets)) fail()
  const decoded = new Map()
  const widgets = Object.fromEntries(Object.entries(batch.widgets).map(([code, widget]) => {
    if (!isObject(widget) || typeof widget.dataSetId !== 'string') fail()
    const id = widget.dataSetId
    if (!decoded.has(id)) {
      if (!Object.hasOwn(batch.dataSets, id)) fail()
      const data = batch.dataSets[id]
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
      decoded.set(id, { fields: data.fields, rows })
    }
    const { dataSetId, ...metadata } = widget
    return [code, { ...metadata, ...decoded.get(id) }]
  }))
  const { dataSets, responseFormat, formatVersion, ...result } = batch
  return { ...result, widgets }
}
