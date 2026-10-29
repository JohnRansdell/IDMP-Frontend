// Only the viewport changes: category/series arrays and raw data indices stay intact.
export function withCategoryViewport(option, width, height, previousStart = 0) {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  if (!series.length || series.some(item => !['bar', 'line'].includes(item.type))) return option
  if (Array.isArray(option.grid) || Array.isArray(option.xAxis) && option.xAxis.length !== 1 || Array.isArray(option.yAxis) && option.yAxis.length !== 1) return option
  const x = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  const y = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis
  const key = x?.type === 'category' ? 'xAxis' : y?.type === 'category' ? 'yAxis' : null
  const axis = key === 'xAxis' ? x : y
  if (!key || !Array.isArray(axis?.data)) return option
  const horizontal = key === 'xAxis'
  const aligned = { ...axis, axisTick: { ...axis.axisTick, alignWithLabel: true }, axisPointer: { ...axis.axisPointer, snap: true } }
  const result = { ...option, [key]: Array.isArray(option[key]) ? [aligned] : aligned,
    series: series.map(item => item.type === 'bar' ? { ...item, barMaxWidth: Math.min(Number(item.barMaxWidth) || 24, 24) } : item) }
  if (option.dataZoom && (!Array.isArray(option.dataZoom) || option.dataZoom.length)) {
    const categoryIndex = horizontal ? 'xAxisIndex' : 'yAxisIndex'
    const valueIndex = horizontal ? 'yAxisIndex' : 'xAxisIndex'
    const stabilize = zoom => {
      const categoryOnly = zoom[valueIndex] == null && (zoom[categoryIndex] != null || (zoom.orient === 'vertical' ? !horizontal : horizontal))
      return categoryOnly ? { ...zoom, filterMode: 'none' } : zoom
    }
    result.dataZoom = Array.isArray(option.dataZoom) ? option.dataZoom.map(stabilize) : stabilize(option.dataZoom)
    return result
  }
  const labels = axis.data.map(value => String(value?.value ?? value ?? ''))
  const longest = Math.max(0, ...labels.map(value => [...value].length))
  const barGroups = new Set(series.filter(item => item.type === 'bar').map((item, i) => item.stack || `series-${i}`)).size
  const fontSize = Number(axis.axisLabel?.fontSize) || 12
  const lineHeight = Math.ceil(fontSize * 1.25)
  const labelRows = Math.max(2, Math.floor(height * 0.4 / lineHeight))
  const textStep = Math.ceil(longest / labelRows) * fontSize + 8
  const step = horizontal ? (barGroups ? Math.max(44, textStep, barGroups * 14 + 12) : Math.min(64, Math.max(48, longest * 6 + 12))) : 28
  const available = Math.max(0, (horizontal ? width - Math.min(100, Math.max(56, width * 0.14)) : height - 90))
  const count = Math.max(horizontal && barGroups ? 1 : 2, Math.floor(available / step))
  const dense = labels.length > count
  if (!dense && (!horizontal || !barGroups || !labels.length)) return result
  const start = Math.min(Math.max(0, Math.floor(Number(previousStart) || 0)), labels.length - count)
  // Keep the full series for value-axis scaling (including stacks); only clip the category viewport.
  const zoom = { [horizontal ? 'xAxisIndex' : 'yAxisIndex']: 0, filterMode: 'none', startValue: start, endValue: start + count - 1, zoomLock: true }
  const bottomLegend = (Array.isArray(option.legend) ? option.legend : [option.legend]).some(item => item?.show !== false && item?.bottom != null)
  const sliderBottom = bottomLegend ? 28 : 2
  if (dense) result.dataZoom = [
    { ...zoom, id: 'idmp-category-inside', type: 'inside', zoomOnMouseWheel: false, moveOnMouseWheel: true, preventDefaultMouseMove: false },
    { ...zoom, id: 'idmp-category-slider', type: 'slider', ...(horizontal ? { height: 16, bottom: sliderBottom } : { width: 16, right: 0 }), showDetail: false, showDataShadow: false, brushSelect: false }
  ]
  result.grid = { ...option.grid, containLabel: true, ...(dense ? horizontal ? { bottom: Math.max(Number(option.grid?.bottom) || 0, sliderBottom + 30) } : { right: Math.max(Number(option.grid?.right) || 0, 30) } : {}) }
  const compactLabels = horizontal && barGroups > 0
  const labelWidth = compactLabels ? Math.max(24, available / Math.min(count, labels.length) - 8) : Math.max(40, available / count - 12)
  const characters = Math.max(4, Math.floor(labelWidth / 12))
  aligned.axisLabel = { ...axis.axisLabel, interval: 0, hideOverlap: false, rotate: 0,
    ...(horizontal ? { width: labelWidth, overflow: 'truncate',
      formatter: axis.axisLabel?.formatter || (value => {
        const text = [...String(value)]
        if (text.length <= characters) return value
        return text.slice(0, characters).join('') + '\n' + text.slice(characters, characters * 2).join('') + (text.length > characters * 2 ? '…' : '')
      }) } : {}) }
  if (compactLabels) {
    const charsPerLine = Math.max(1, Math.floor(labelWidth / fontSize))
    const formatLabel = (value, index) => {
      const original = axis.axisLabel?.formatter
      const text = typeof original === 'function' ? original(value, index) : typeof original === 'string' ? original.replaceAll('{value}', value) : value
      return String(text).split('\n').flatMap(line => {
        const chars = [...line], lines = []
        for (let i = 0; i < chars.length; i += charsPerLine) lines.push(chars.slice(i, i + charsPerLine).join(''))
        return lines.length ? lines : ['']
      }).join('\n')
    }
    const labelHeight = labels.reduce((maximum, label, index) => Math.max(maximum, formatLabel(label, index).split('\n').length * lineHeight), lineHeight)
    // Reserve the same full label height for every window so scrolling cannot move the plot.
    aligned.axisLabel = { ...aligned.axisLabel, fontSize, lineHeight, height: labelHeight, verticalAlign: 'top', overflow: 'breakAll', formatter: formatLabel }
  }
  aligned.axisTick = { ...aligned.axisTick, interval: 0 }
  return result
}
