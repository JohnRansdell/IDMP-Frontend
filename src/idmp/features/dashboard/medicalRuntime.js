import { fetchMedicalDashboard, fetchMedicalDashboardMetadata, openMedicalDashboard, queryMedicalDashboard,
  fetchMedicalFilterOptions, fetchMedicalDrillPath, searchMedicalDrill, fetchMedicalGroupingTargets, searchMedicalQueryDrill } from '../../api/modules/medical'
import { instantChartDrillTarget } from './instantChartDrill.js'

// Reuse the ordinary viewer, but never fall back to its unscoped management APIs.
export function createMedicalDashboardRuntime(api = { fetchMedicalDashboard, fetchMedicalDashboardMetadata, openMedicalDashboard,
  queryMedicalDashboard, fetchMedicalFilterOptions, fetchMedicalDrillPath, searchMedicalDrill, fetchMedicalGroupingTargets, searchMedicalQueryDrill }) {
  let dashboardId = '', metadata = {}
  const tickets = new Map()
  return {
    get departmentName() { return metadata.deptName || metadata.deptCode || '' },
    get departmentNames() { return new Map(metadata.deptCode ? [[metadata.deptCode, metadata.deptName || metadata.deptCode]] : []) },
    widgetMetadata(code) { return metadata.widgets?.[code] || { fields: [], periods: [] } },
    async load(id, options) {
      tickets.clear()
      await api.openMedicalDashboard(id)
      const [detail, next] = await Promise.all([api.fetchMedicalDashboard(id, options), api.fetchMedicalDashboardMetadata(id, options)])
      options?.signal?.throwIfAborted()
      dashboardId = id; metadata = next
      return detail
    },
    async query(id, query, options) {
      const response = await api.queryMedicalDashboard(id, query, options)
      options?.signal?.throwIfAborted()
      const widgets = Object.fromEntries(Object.entries(response.data.widgets).map(([code, result]) => {
        for (const entry of [result.drillContext, ...(result.rows || []).map(row => row.drillContext)]) {
          if (entry?.resultId) tickets.set(String(entry.resultId), response.drillTicket)
        }
        return [code, result.status === 'FORBIDDEN' ? { ...result, status: 'ERROR' } : result]
      }))
      return { ...response.data, widgets }
    },
    filterOptions(code, query) { return api.fetchMedicalFilterOptions(dashboardId, code, query) },
    async drillTarget(widget, params, dataset) {
      const tuple = params?.data?.dimensionValues || {}
      const selected = params?.data?.row || dataset?.rows?.find(row => Object.entries(tuple).every(([field, value]) => String(row[field]) === String(value)))
      const context = selected?.drillContext
      if (selected?.queryContext) {
        const response = await api.fetchMedicalGroupingTargets(dashboardId, widget.id)
        return instantChartDrillTarget(selected, response?.data || response, { field: widget.config?.dataBinding?.dimensions?.[0]?.field,
          search: (payload, options) => api.searchMedicalQueryDrill(dashboardId, widget.id, payload, options),
          departmentNames: Object.fromEntries(this.departmentNames) })
      }
      const ticket = tickets.get(String(context?.resultId))
      if (!context || !ticket) throw new Error('当前组件结果没有有效的科室下钻授权，请刷新看板')
      const path = await api.fetchMedicalDrillPath(dashboardId, ticket, context.resultId)
      return { resultId: context.resultId, drillContext: context, selectedRow: selected,
        indicatorVersionId: String(widget.config?.analysisIndicatorVersionId || ''),
        departmentNames: Object.fromEntries(this.departmentNames), path: { levels: path.levels, maxLevel: path.levels.at(-1)?.levelCode } }
    },
    searchDrill(resultId, payload, options) {
      const ticket = tickets.get(String(resultId))
      if (!ticket) throw new Error('下钻授权已失效，请刷新看板')
      return api.searchMedicalDrill(dashboardId, ticket, resultId, payload, options)
    }
  }
}
