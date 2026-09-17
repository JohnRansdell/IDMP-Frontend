export function dashboardDemoPolicy({ previewMode = '', development = false, test = false, explicit = false } = {}) {
  const preview = previewMode === '1'
  return {
    // Preview skips the aggregate Dashboard API, but published indicators can
    // still resolve their own formal analysis data.
    skipDashboardBootstrap: preview,
    loadPublishedIndicators: true,
    useDemoOnFailure: preview || development || test || explicit,
    persistDefaultSchema: !preview
  }
}
