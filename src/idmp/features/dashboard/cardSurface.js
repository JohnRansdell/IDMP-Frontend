const SURFACES = Object.freeze({
  standard: { background: '#ffffff', borderColor: '#d8e2e7', borderWidth: 1, shadow: 'sm' },
  translucent: { background: 'rgba(255,255,255,0.78)', borderColor: 'rgba(216,226,231,0.78)', borderWidth: 1, shadow: 'sm' },
  glass: { background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.48)', borderWidth: 1, shadow: 'md', backdropBlur: '12px' },
  transparent: { background: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.42)', borderWidth: 1, shadow: 'none' }
})

export const CARD_SURFACE_OPTIONS = Object.freeze([
  { id: 'standard', label: '标准' }, { id: 'translucent', label: '轻透' }, { id: 'glass', label: '毛玻璃' }, { id: 'transparent', label: '透明' }
])

export function isOrdinaryCard(widget = {}) {
  const style = widget.config?.style || {}
  return !style.backgroundAssetKey && !style.backgroundImage && !style.backgroundGradient
}

export function applyCardSurface(style = {}, surface = 'standard') {
  const next = { ...style, ...(SURFACES[surface] || SURFACES.standard) }
  if (surface !== 'glass') delete next.backdropBlur
  return next
}

export function applyCardSurfaceToWidgets(widgets = [], surface = 'standard', scope = 'ordinary') {
  return widgets.map(widget => {
    if (scope !== 'all' && !isOrdinaryCard(widget)) return widget
    return { ...widget, config: { ...widget.config, style: applyCardSurface(widget.config?.style, surface) } }
  })
}
