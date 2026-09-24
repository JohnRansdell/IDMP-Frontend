// Background resources are deployment-relative public assets. Persist only the
// stable key; never persist a developer machine path or a generated blob URL.
const base = import.meta.env?.BASE_URL || '/'
const path = name => `${base.replace(/\/$/, '/')}dashboard-backgrounds/${name}.svg`

export const BACKGROUND_ASSETS = Object.freeze([
  { key: 'clinical-blue', name: '临床浅蓝', url: path('clinical-blue'), surfaceTone: 'light' },
  { key: 'medical-teal', name: '蓝青医疗', url: path('medical-teal'), surfaceTone: 'light' },
  { key: 'clear-blue', name: '清透白蓝', url: path('clear-blue'), surfaceTone: 'light' },
  { key: 'mint', name: '薄荷青绿', url: path('mint'), surfaceTone: 'light' },
  { key: 'warm-glow', name: '暖橙柔光', url: path('warm-glow'), surfaceTone: 'light' },
  { key: 'soft-violet', name: '柔和淡紫', url: path('soft-violet'), surfaceTone: 'light' },
  { key: 'light-grid', name: '浅色网格', url: path('light-grid'), surfaceTone: 'light' },
  { key: 'deep-blue', name: '深蓝展示', url: path('deep-blue'), surfaceTone: 'dark' }
])

export function resolveBackgroundAsset(key) {
  return BACKGROUND_ASSETS.find(asset => asset.key === key)?.url || ''
}

export function resolveDashboardSurfaceTone(background = {}) {
  const asset = BACKGROUND_ASSETS.find(item => item.key === background.assetKey)
  if (asset) return asset.surfaceTone
  return colorSurfaceTone(background.value)
}

export function resolveWidgetSurfaceTone(widget = {}, dashboardTone = 'light') {
  const style = widget.config?.style || {}
  const asset = BACKGROUND_ASSETS.find(item => item.key === style.backgroundAssetKey)
  if (asset) return asset.surfaceTone
  const color = typeof style.background === 'string' ? style.background.trim() : ''
  const alpha = /^rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i.exec(color)?.[1]
  if (alpha !== undefined && Number(alpha) < 0.55) return dashboardTone
  return colorSurfaceTone(color)
}

function colorSurfaceTone(color) {
  const source = typeof color === 'string' ? color.trim() : ''
  const hex = /^#([0-9a-f]{6})$/i.exec(source)?.[1]
  if (!hex) return 'light'
  const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const luminance = channels.map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance < 0.24 ? 'dark' : 'light'
}
