const integer = value => Math.round(Number(value) || 0)
const clone = widget => ({ ...widget, layout: { ...widget.layout } })
const ordered = widgets => [...widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x || String(a.id).localeCompare(String(b.id)))
export function nextWidgetSelection(current, widgetId, { additive = false } = {}) {
  const id = String(widgetId || '')
  if (!id) return { ids: [], primaryId: '' }
  const ids = new Set(current?.ids || [])
  if (!additive) return { ids: [id], primaryId: id }
  if (ids.has(id)) { ids.delete(id); return { ids: [...ids], primaryId: current?.primaryId === id ? [...ids].at(-1) || '' : current?.primaryId || '' } }
  ids.add(id)
  return { ids: [...ids], primaryId: id }
}
export const clearWidgetSelection = () => ({ ids: [], primaryId: '' })
function valid(layout, columns) { return Number.isInteger(layout.x) && Number.isInteger(layout.y) && Number.isInteger(layout.w) && Number.isInteger(layout.h) && layout.x >= 0 && layout.y >= 0 && layout.w > 0 && layout.h > 0 && layout.x + layout.w <= columns }
function collides(left, right) { return left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y }
export function hasLayoutCollisions(widgets) { return widgets.some((widget, index) => widgets.slice(index + 1).some(other => collides(widget.layout, other.layout))) }
export function transformSelectedLayout(widgets, selectedIds, transform, columns = 24) {
  const ids = new Set(selectedIds || [])
  const selected = widgets.filter(widget => ids.has(widget.id))
  if (selected.length < 2) return { ok: false, reason: '至少选择两个组件', widgets }
  const patch = transform(selected.map(clone))
  const next = widgets.map(widget => patch.get(widget.id) ? { ...widget, layout: patch.get(widget.id) } : widget)
  if (next.some(widget => !valid(widget.layout, columns))) return { ok: false, reason: '对齐结果超出画布', widgets }
  if (hasLayoutCollisions(next)) return { ok: false, reason: '当前操作会造成组件重叠', widgets }
  return { ok: true, widgets: next }
}
export function alignSelectedLayout(widgets, selectedIds, mode, columns = 24) {
  return transformSelectedLayout(widgets, selectedIds, selected => {
    const xs = selected.map(widget => widget.layout.x), rights = selected.map(widget => widget.layout.x + widget.layout.w)
    const ys = selected.map(widget => widget.layout.y), bottoms = selected.map(widget => widget.layout.y + widget.layout.h)
    const xCenter = integer((Math.min(...xs) + Math.max(...rights)) / 2), yCenter = integer((Math.min(...ys) + Math.max(...bottoms)) / 2)
    return new Map(selected.map(widget => {
      const layout = { ...widget.layout }
      if (mode === 'left') layout.x = Math.min(...xs)
      if (mode === 'right') layout.x = Math.max(...rights) - layout.w
      if (mode === 'h-center') layout.x = integer(xCenter - layout.w / 2)
      if (mode === 'top') layout.y = Math.min(...ys)
      if (mode === 'bottom') layout.y = Math.max(...bottoms) - layout.h
      if (mode === 'v-center') layout.y = integer(yCenter - layout.h / 2)
      return [widget.id, layout]
    }))
  }, columns)
}
export function distributeSelectedLayout(widgets, selectedIds, axis, columns = 24) {
  const selected = widgets.filter(widget => new Set(selectedIds || []).has(widget.id))
  if (selected.length < 3) return { ok: false, reason: '至少选择三个组件', widgets }
  const orderedSelected = [...selected].sort((a, b) => a.layout[axis] - b.layout[axis] || String(a.id).localeCompare(String(b.id)))
  const size = axis === 'x' ? 'w' : 'h'
  const available = orderedSelected.at(-1).layout[axis] + orderedSelected.at(-1).layout[size] - orderedSelected[0].layout[axis] - orderedSelected.reduce((sum, widget) => sum + widget.layout[size], 0)
  if (available < 0) return { ok: false, reason: '组件之间没有可分配的空间', widgets }
  return transformSelectedLayout(widgets, selectedIds, selected => {
    const byAxis = [...selected].sort((a, b) => a.layout[axis] - b.layout[axis] || String(a.id).localeCompare(String(b.id)))
    const size = axis === 'x' ? 'w' : 'h'
    const first = byAxis[0].layout[axis], lastEdge = byAxis.at(-1).layout[axis] + byAxis.at(-1).layout[size]
    const sizes = byAxis.reduce((sum, widget) => sum + widget.layout[size], 0)
    const gaps = byAxis.length - 1, available = lastEdge - first - sizes
    const base = Math.floor(available / gaps), remainder = available % gaps
    let position = first
    return new Map(byAxis.map((widget, index) => {
      const layout = { ...widget.layout, [axis]: position }
      position += widget.layout[size] + (index < gaps ? base + (index < remainder ? 1 : 0) : 0)
      return [widget.id, layout]
    }))
  }, columns)
}
