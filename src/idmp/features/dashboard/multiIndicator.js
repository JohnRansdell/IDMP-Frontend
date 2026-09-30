const plain = value => value && typeof value === 'object' && !Array.isArray(value)

export function normalizeIndicatorBindings(value = [], primary = {}) {
  const seen = new Set()
  const rows = (Array.isArray(value) ? value : []).flatMap((item, index) => {
    const sourceCode = String(item?.sourceCode || '').trim()
    if (!sourceCode || seen.has(sourceCode)) return []
    seen.add(sourceCode)
    return [{
      sourceCode,
      sourceName: String(item.sourceName || sourceCode),
      alias: String(item.alias || item.sourceName || sourceCode),
      ...(item.indicatorVersionId ? { indicatorVersionId: String(item.indicatorVersionId) } : {}),
      axis: item.axis === 'right' ? 'right' : 'left',
      order: index
    }]
  })
  const primaryCode = String(primary?.sourceCode || '').trim()
  if (primaryCode && !seen.has(primaryCode)) {
    rows.unshift({
      sourceCode: primaryCode,
      sourceName: String(primary.sourceName || primaryCode),
      alias: String(primary.sourceName || primaryCode),
      ...(primary.config?.analysisIndicatorVersionId ? { indicatorVersionId: String(primary.config.analysisIndicatorVersionId) } : {}),
      axis: 'left',
      order: -1
    })
  }
  return rows.map(({ order, ...item }) => item)
}

export function multiIndicatorMeasureField(sourceCode) {
  return `indicator__${String(sourceCode || '').replace(/[^A-Za-z0-9_]/g, '_')}`
}

export function validateIndicatorBindings(value, kind = '') {
  if (value === undefined) return []
  if (!Array.isArray(value)) return ['indicatorBindings must be an array']
  const errors = []
  const seen = new Set()
  value.forEach((item, index) => {
    const prefix = `indicatorBindings[${index}]`
    const code = String(item?.sourceCode || '').trim()
    if (!code) errors.push(`${prefix}.sourceCode is required`)
    else if (seen.has(code)) errors.push(`${prefix}.sourceCode is duplicated`)
    else seen.add(code)
    if (!String(item?.alias || '').trim()) errors.push(`${prefix}.alias is required`)
    if (!['left', 'right'].includes(item?.axis || 'left')) errors.push(`${prefix}.axis is invalid`)
    if (item?.axis === 'right' && !['line', 'bar'].includes(kind)) errors.push(`${prefix}.axis right is not supported`)
  })
  return errors
}

export function validateComponentQueryScope(value) {
  if (value === undefined) return []
  if (!plain(value)) return ['backendQuery must be an object']
  const errors = []
  if (value.periodMode === 'FIXED') {
    if (!value.periodStart || !value.periodEnd) errors.push('fixed component period requires start and end')
    else if (value.periodStart > value.periodEnd) errors.push('component period start must not exceed end')
  }
  if (value.organizationMode === 'FIXED' && value.organizationScope?.level !== 'HOSPITAL' && !value.organizationScope?.ids?.length) errors.push('fixed component organization requires ids')
  if (value.scenarioMode === 'FIXED' && !value.scenarioVersionIds?.length) errors.push('fixed component scenario requires version ids')
  return errors
}

export function createMultiIndicatorDataset(widget, datasetsBySource) {
  const bindings = normalizeIndicatorBindings(widget?.config?.indicatorBindings, widget)
  if (bindings.length < 2) return null
  const selectedDatasetId = widget?.config?.dataBinding?.dataset
  const sources = bindings.map((binding) => {
    const datasets = datasetsBySource.get(binding.sourceCode) || []
    const dataset = datasets.find(item => item.id === selectedDatasetId)
      || datasets.find(item => item.id === 'analysis')
      || datasets.find(item => item.id === 'trend')
      || datasets.find(item => item.rows?.length)
      || datasets[0]
    return { binding, dataset }
  })
  if (sources.some(item => !item.dataset)) return {
    id: 'multi-indicator', label: '多指标组合', fields: [], rows: [], status: 'ERROR',
    message: '部分指标没有可用于组合的数据集，请检查指标正式结果。'
  }
  const failed = sources.find(item => item.dataset.status === 'ERROR')
  if (failed) return {
    id: 'multi-indicator', label: '多指标组合', fields: [], rows: [], status: 'ERROR',
    message: failed.dataset.message || '指标查询失败，无法合并结果。'
  }

  const dimensionIds = commonDimensionIds(sources.map(item => item.dataset))
  if (!dimensionIds.length && sources.some(item => item.dataset.rows?.length > 1)) return {
    id: 'multi-indicator', label: '多指标组合', fields: [], rows: [], status: 'ERROR',
    message: '指标没有共同维度，无法对齐多行结果。请配置相同的时间或业务维度。'
  }
  const rowsByKey = new Map()
  let duplicateKey = false
  sources.forEach(({ binding, dataset }) => {
    const measure = preferredMeasure(dataset.fields || [])
    if (!measure) return
    const sourceKeys = new Set()
    dataset.rows?.forEach((row) => {
      if (!plain(row)) return
      const keyValues = dimensionIds.map(id => row[id])
      const key = JSON.stringify(keyValues)
      if (sourceKeys.has(key)) { duplicateKey = true; return }
      sourceKeys.add(key)
      const merged = rowsByKey.get(key) || Object.fromEntries(dimensionIds.map((id, offset) => [id, keyValues[offset]]))
      merged[multiIndicatorMeasureField(binding.sourceCode)] = row[measure.id]
      rowsByKey.set(key, merged)
    })
  })
  if (duplicateKey) return {
    id: 'multi-indicator', label: '多指标组合', fields: [], rows: [], status: 'ERROR',
    message: '指标在共同维度上有重复结果，无法安全对齐。请补齐组合维度。'
  }

  const firstFields = new Map((sources[0].dataset.fields || []).map(field => [field.id, field]))
  const fields = [
    ...dimensionIds.map(id => firstFields.get(id)).filter(Boolean),
    ...sources.map(({ binding, dataset }) => {
      const measure = preferredMeasure(dataset.fields || [])
      return {
        id: multiIndicatorMeasureField(binding.sourceCode),
        label: binding.alias,
        dataType: 'number',
        semanticType: 'measure',
        unit: measure?.unit || '',
        filterable: false,
        sourceCode: binding.sourceCode,
        axis: binding.axis
      }
    })
  ]
  return {
    id: 'multi-indicator',
    label: `多指标组合 · ${bindings.length} 项`,
    fields,
    rows: [...rowsByKey.values()],
    status: rowsByKey.size ? 'READY' : 'EMPTY',
    message: rowsByKey.size ? '' : '所选指标在当前周期没有可对齐的正式结果。'
  }
}

export function createMultiIndicatorDefaultBinding(widget, dataset) {
  if (!dataset?.fields?.length) return null
  const kind = widget?.type === 'chart' ? widget.chartKind : widget?.type
  const dimensions = dataset.fields.filter(field => ['dimension', 'time'].includes(field.semanticType))
  const measures = dataset.fields.filter(field => field.semanticType === 'measure')
  return {
    dataset: dataset.id,
    dimensions: ['kpi', 'gauge', 'scatter'].includes(kind) ? [] : dimensions.slice(0, kind === 'line' || kind === 'bar' ? 1 : 1).map(field => ({ field: field.id, label: field.label, ...(field.semanticType === 'time' ? { granularity: 'raw' } : {}) })),
    measures: measures.map(field => ({ field: field.id, label: field.label, aggregation: 'direct', axis: field.axis || 'left' })),
    series: [],
    sort: []
  }
}

function preferredMeasure(fields) {
  return fields.find(field => field.semanticType === 'measure' && ['indicatorValue', 'value', 'actualValue'].includes(field.id))
    || fields.find(field => field.semanticType === 'measure')
}

const technicalFields = new Set(['resultId', 'snapshotId', 'dimensionHash', 'qualityStatus', 'achievementStatus', 'achievementReason'])
function commonDimensionIds(datasets) {
  const sets = datasets.map(dataset => new Set((dataset.fields || [])
    .filter(field => ['dimension', 'time'].includes(field.semanticType))
    .filter(field => !technicalFields.has(field.id))
    .filter(field => (dataset.rows || []).every(row => row && Object.hasOwn(row, field.id) && row[field.id] !== null && row[field.id] !== undefined))
    .map(field => field.id)))
  if (!sets.length) return []
  return [...sets[0]].filter(id => sets.every(set => set.has(id)))
}
