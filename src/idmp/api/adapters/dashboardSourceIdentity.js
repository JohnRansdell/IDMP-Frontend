// A component may legally bind only a fixed indicator version. The editor also
// needs its owning indicator code, but must never replace that fixed version.
export async function completeDashboardSourceBindings(versions, { fetchVersion, fetchIndicator, signal }) {
  const versionRequests = new Map(), indicatorRequests = new Map()
  const once = (cache, id, read) => {
    if (!cache.has(id)) cache.set(id, read(id))
    return cache.get(id)
  }
  return Promise.all(versions.map(async version => ({
    ...version,
    widgets: await Promise.all((version.widgets || []).map(async widget => {
      if (widget.dataSourceCode || !widget.indicatorVersionId || ['TEXT', 'WARNING', 'WARNINGS'].includes(widget.type)) return widget
      signal?.throwIfAborted()
      const definition = await once(versionRequests, String(widget.indicatorVersionId), fetchVersion)
      signal?.throwIfAborted()
      if (!definition?.indicatorId) throw new Error('组件绑定的指标版本缺少所属指标，请检查指标配置。')
      const indicator = await once(indicatorRequests, String(definition.indicatorId), fetchIndicator)
      signal?.throwIfAborted()
      if (!indicator?.code) throw new Error('组件绑定的指标信息不完整，请检查指标配置。')
      return { ...widget, dataSourceCode: indicator.code, dataSourceName: indicator.name || widget.dataSourceName || '' }
    }))
  })))
}
