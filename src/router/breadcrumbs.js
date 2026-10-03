export const breadcrumbLinks = Object.freeze({
  home: { label: '首页', to: '/dashboard' },
  indicators: { label: '指标管理', to: '/indicator' },
  factors: { label: '因子管理', to: '/factor' },
  factorTemplates: { label: '因子模板', to: '/factor/templates' },
  scenarios: { label: '场景管理', to: '/scenarios' },
  mappings: { label: '指标映射管理', to: '/mapping' },
  analysis: { label: '指标分析', to: '/analysis' },
  data: { label: '数据治理', to: '/data' },
  domains: { label: '数据域管理', to: '/data/domains' },
  valueSets: { label: '值集管理', to: '/data/value-sets' }
})

export function buildPageBreadcrumbs(route) {
  let items = route.meta?.breadcrumb || [breadcrumbLinks.home]
  if (route.name === 'IndicatorAnalysis') {
    const indicatorName = String(route.query?.indicatorName || route.query?.indicator || '请选择指标')
    items = [breadcrumbLinks.home, breadcrumbLinks.analysis, indicatorName]
  }
  return items.map((item, index) => {
    const current = index === items.length - 1
    const entry = typeof item === 'string' ? { label: item } : { ...item }
    if (current) delete entry.to
    if (!current && route.name === 'ResultDrill' && entry.to === '/analysis') {
      const query = Object.fromEntries(['indicator', 'indicatorId', 'indicatorVersionId', 'indicatorName', 'periodStart', 'periodEnd']
        .filter(key => typeof route.query?.[key] === 'string' && route.query[key])
        .map(key => [key, route.query[key]]))
      entry.to = { path: '/analysis', query }
    }
    return { ...entry, current }
  })
}
