export function scrollBehavior(to, from) {
  if (to.path === '/analysis' && from.path === '/analysis'
    && String(to.query?.indicator || '') === String(from.query?.indicator || '')
    && String(to.query?.indicatorVersionId || '') === String(from.query?.indicatorVersionId || '')) {
    return false
  }
  return { top: 0 }
}
