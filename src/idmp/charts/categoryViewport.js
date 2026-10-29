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
  const result = { ...option, [key]: Array.isArray(option[key]) ? [aligned] : aligned }
  if (option.dataZoom && (!Array.isArray(option.dataZoom) || option.dataZoom.length)) return result
  const labels = axis.data.map(value => String(value?.value ?? value ?? ''))
  const longest = Math.max(0, ...labels.map(value => [...value].length))
  const step = horizontal ? Math.min(132, Math.max(72, longest * 12 / 2 + 20)) : 32
  const available = Math.max(0, (horizontal ? width - 100 : height - 90))
  const count = Math.max(2, Math.floor(available / step))
  if (labels.length <= count) return result
  const start = Math.min(Math.max(0, Math.floor(Number(previousStart) || 0)), labels.length - count)
  const zoom = { [horizontal ? 'xAxisIndex' : 'yAxisIndex']: 0, filterMode: 'filter', startValue: start, endValue: start + count - 1, zoomLock: true }
  const bottomLegend = (Array.isArray(option.legend) ? option.legend : [option.legend]).some(item => item?.show !== false && item?.bottom != null)
  const sliderBottom = bottomLegend ? 28 : 2
  result.dataZoom = [
    { ...zoom, id: 'idmp-category-inside', type: 'inside', zoomOnMouseWheel: false, moveOnMouseWheel: true, preventDefaultMouseMove: false },
    { ...zoom, id: 'idmp-category-slider', type: 'slider', ...(horizontal ? { height: 16, bottom: sliderBottom } : { width: 16, right: 0 }), showDetail: false, showDataShadow: false, brushSelect: false }
  ]
  result.grid = { ...option.grid, containLabel: true, ...(horizontal ? { bottom: Math.max(Number(option.grid?.bottom) || 0, sliderBottom + 30) } : { right: Math.max(Number(option.grid?.right) || 0, 30) }) }
  const characters = Math.max(4, Math.floor((available / count - 12) / 12))
  aligned.axisLabel = { ...axis.axisLabel, interval: 0, hideOverlap: false, rotate: 0,
    ...(horizontal ? { width: Math.max(40, available / count - 12), overflow: 'truncate',
      formatter: axis.axisLabel?.formatter || (value => {
        const text = [...String(value)]
        if (text.length <= characters) return value
        return text.slice(0, characters).join('') + '\n' + text.slice(characters, characters * 2).join('') + (text.length > characters * 2 ? '…' : '')
      }) } : {}) }
  aligned.axisTick = { ...aligned.axisTick, interval: 0 }
  return result
}
