import { dashboardDataSourceToFrontend } from '../../api/adapters/dashboard.js'

export function boundDashboardSource(widget, version = null) {
  const code = String(widget?.sourceCode || '').trim()
  const versionId = String(widget?.config?.analysisIndicatorVersionId || '').trim()
  if (!code || !versionId) return null
  return dashboardDataSourceToFrontend({
    code,
    name: widget.sourceName || widget.title || code,
    indicatorId: version?.indicatorId,
    indicatorVersionId: versionId,
    indicatorVersionNo: version?.versionNo
  })
}

export function canNavigateDashboardSource(source, status) {
  return Boolean(source && source.analysisEnabled !== false
    && (source.analysisIndicatorId || source.indicatorId || source.indicatorCode)
    && ['indicator-catalog', 'dashboard-data-source', 'backend'].includes(source.origin)
    && (source.origin !== 'backend' || status === 'ready'))
}
