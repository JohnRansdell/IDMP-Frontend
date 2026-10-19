export function dashboardDemoPolicy({ previewMode = '', explicit = false } = {}) {
  const preview = previewMode === '1'
  return {
    // Preview skips the aggregate Dashboard API, but published indicators can
    // still resolve their own formal analysis data.
    skipDashboardBootstrap: preview,
    loadPublishedIndicators: true,
    useDemoOnFailure: preview || explicit,
    persistDefaultSchema: !(preview || explicit)
  }
}

// A missing published Dashboard is a real empty/error state in normal use.
// Demo data is only a fallback when the runtime explicitly allows it.
export function shouldUseDashboardDemoFallback(_error, policy = {}) {
  return Boolean(policy.useDemoOnFailure)
}
