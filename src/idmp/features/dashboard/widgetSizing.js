// Based on the actual rendered container, not persisted grid units. This keeps
// presentation correct for both a desktop resize and derived mobile layouts.
export function getDashboardWidgetSizeTier(width, height) {
  const safeWidth = Number(width) || 0
  const safeHeight = Number(height) || 0
  if (safeWidth < 150 || safeHeight < 105) return 'micro'
  if (safeWidth < 280 || safeHeight < 180) return 'compact'
  if (safeWidth > 720 || safeHeight > 420) return 'expanded'
  return 'standard'
}
