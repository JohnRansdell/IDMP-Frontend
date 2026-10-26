// Both viewers expose the same reads. Selecting the restricted runtime never retries a management API.
export function createDashboardViewerRuntime({ isMedical, platform, medical }) {
  const active = () => isMedical() ? medical : platform
  return {
    get restricted() { return Boolean(isMedical()) },
    get departmentName() { return isMedical() ? medical.departmentName : '' },
    get departmentNames() { return isMedical() ? medical.departmentNames : new Map() },
    catalog: (...args) => active().catalog(...args),
    load: (...args) => active().load(...args),
    query: (...args) => active().query(...args),
    metadata: (...args) => active().metadata(...args),
    filterOptions: (...args) => active().filterOptions(...args),
    searchDrill: (...args) => active().searchDrill(...args),
    drillTarget: (...args) => active().drillTarget(...args)
  }
}

export function createPlatformDashboardRuntime(api) {
  return {
    catalog: () => api.fetchCatalog(),
    async load(id, { editing = false, ...options } = {}) {
      const detail = await api.fetchDefinition(id, options)
      options.signal?.throwIfAborted()
      if (editing || !detail.dashboard?.currentPublishedVersionId) return detail
      const versions = await api.fetchVersions(detail.dashboard.id || id, options)
      options.signal?.throwIfAborted()
      return { ...detail, version: api.selectVersion(detail, versions, { editing: false }) }
    },
    query: (id, query, options) => api.query(id, query, { ...options, cache: 'no-store' }),
    async metadata(sourceCode, _widget, options) {
      const [fields, periods] = await Promise.all([api.fetchFields(sourceCode, options), api.fetchPeriods(sourceCode, options)])
      return { fields, periods }
    },
    filterOptions: (sourceCode, _widget, query) => api.fetchFilterOptions(sourceCode, query),
    searchDrill: (...args) => api.searchDrill(...args)
  }
}

export function createMedicalViewerRuntime(runtime, fetchCatalog) {
  return {
    get departmentName() { return runtime.departmentName },
    get departmentNames() { return runtime.departmentNames },
    catalog: fetchCatalog,
    load: (id, { editing: _editing, ...options } = {}) => runtime.load(id, options),
    query: (...args) => runtime.query(...args),
    metadata: (_sourceCode, widget) => runtime.widgetMetadata(widget?.id),
    filterOptions: (_sourceCode, widget, query) => runtime.filterOptions(widget.id, query),
    searchDrill: (...args) => runtime.searchDrill(...args),
    drillTarget: (...args) => runtime.drillTarget(...args)
  }
}
