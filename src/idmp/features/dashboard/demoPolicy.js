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

// A missing published Dashboard is an expected deployment state while the
// backend capability is being rolled out. Keep real transport/server failures
// visible instead of turning every production error into demo data.
export function shouldUseDashboardDemoFallback(error, policy = {}) {
  return Boolean(policy.useDemoOnFailure) || Number(error?.status) === 404
}
