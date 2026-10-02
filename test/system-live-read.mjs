import { api, check, finish, rows, run, save } from './system-test-client.mjs'

const catalog = {}
async function read(path, name = path) {
  const data = await api('GET', path)
  await save(name.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 150), data)
  check(name, data !== undefined)
  return data
}
for (const path of [
  '/health', '/auth/me', '/system/users', '/me/notifications?page=1&size=5', '/me/notifications/unread-count', '/me/notification-bindings',
  '/indicators?page=1&size=100', '/indicator-versions?page=1&size=5', '/factors?page=1&size=5', '/factor-versions?page=1&size=5', '/factor-templates?page=1&size=5',
  '/scenarios?page=1&size=20', '/mappings/groups?page=1&size=5', '/mappings?page=1&size=5',
  '/meta/data-domains', '/meta/source-tables', '/meta/source-mappings?page=1&size=5', '/meta/physical-table-relations', '/meta/domain-relations',
  '/meta/value-sets?page=1&size=5', '/meta/drill-paths?page=1&size=20', '/meta/policy-files?page=1&size=5',
  '/analysis/warning-rules?page=1&size=5', '/analysis/warnings?page=1&size=5', '/analysis/dashboards', '/analysis/dashboard-data-sources', '/calc/schedules?page=1&size=5',
  '/factors/recycle-bin?page=1&size=5', '/indicators/recycle-bin?page=1&size=5'
]) await run(path, async () => {
  if(['/auth/me','/me/notification-bindings'].includes(path)) {
    const result=await api('GET',path,undefined,{allowError:true})
    check(`unauthenticated-${path}`,result.http===401,result.message)
  }else catalog[path.split('?')[0]] = await read(path)
})

for (const item of rows(catalog['/analysis/dashboards'])) await run(`dashboard-${item.id}`, async () => {
  const detail = await read(`/analysis/dashboards/${item.id}`)
  await read(`/analysis/dashboards/${item.id}/versions`)
  const query = await api('POST', `/analysis/dashboards/${item.id}/query`, { periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY' })
  await save(`dashboard-query-${item.id}`, query)
  check(`dashboard-query-${item.name}`, query.widgets&&typeof query.widgets==='object', { keys: Object.keys(query) })
  check(`dashboard-generatedAt-${item.name}`, /\+08:00$/.test(query.generatedAt), query.generatedAt)
  check(`dashboard-definition-widgets-${item.name}`, Boolean(detail))
})

const specs = [
  { id: '102027642461313070', code: 'TRANSFER_48H_GRAIN_DRILL_20261001' },
  { id: '102027642460761108', code: 'DASHBOARD_INPATIENT_MORTALITY_20260928' },
  { id: '102027642460335204', code: 'DASHBOARD_EMERGENCY_SURGERY_RATE_20260922' }
]
for (const spec of specs) await run(`indicator-${spec.code}`, async () => {
  const detail = await read(`/indicators/${spec.id}`)
  const versions = rows(await read(`/indicators/${spec.id}/versions`))
  const versionId = detail.currentPublishedVersionId || versions.find(v => v.status === 'PUBLISHED' || v.publicationStatus === 'PUBLISHED')?.id
  check(`published-version-${spec.code}`, !!versionId)
  spec.versionId = versionId
  const version = await read(`/indicator-versions/${versionId}`)
  await run(`formula-endpoint-${spec.code}`,()=>read(`/indicator-versions/${versionId}/formula`))
  await read(`/indicator-versions/${versionId}/performance-target`)
  await run(`availability-${spec.code}`,()=>read(`/indicator-versions/${versionId}/available-period`))
  await read(`/indicators/${spec.id}/scenarios`)
  await read(`/indicators/${spec.id}/deletion-impact`)
  await read(`/mappings/by-indicator-version/${versionId}`)
  const analysis = await read(`/analysis/indicators/${spec.id}/analysis?indicatorVersionId=${versionId}&periodStart=2026-01-01&periodEnd=2026-01-31&granularity=MONTHLY`)
  check(`overview-formula-${spec.code}`, Number.isFinite(Number(analysis.overview?.value)), analysis.overview)
  spec.overview = analysis.overview
  spec.version = version
  const fields = rows(await read(`/analysis/dashboard-data-sources/${spec.code}/fields`))
  await read(`/analysis/dashboard-data-sources/${spec.code}/available-periods`)
  check(`dashboard-operands-${spec.code}`, ['numeratorValue', 'denominatorValue', 'snapshotId', 'targetValue'].every(code=>fields.some(field=>field.code===code)))
  const department = fields.find(field => field.drillable && /DEPT/i.test(field.code))
  if (department) {
    const options = await api('POST', `/analysis/dashboard-data-sources/${spec.code}/filter-options`, { fieldCode: department.code, periodStart: '2026-01-01', periodEnd: '2026-01-31', limit: 10 })
    await save(`filter-options-${spec.code}`, options)
    check(`filter-options-${spec.code}`, options !== undefined)
  }
  for (const widgetType of ['KPI_CARD', 'LINE_CHART', 'TABLE']) {
    const preview = await api('POST', '/analysis/dashboard-query/preview', { widget: { code: 'fulltest', title: '验收', type: widgetType, dataSourceCode: spec.code, indicatorVersionId: versionId, position: {}, ...(widgetType==='TABLE'?{query:{resultShape:'COMPARISON'}}:{}) }, periodStart: '2026-01-01', periodEnd: '2026-01-31', granularity: 'MONTHLY' })
    await save(`preview-${spec.code}-${widgetType}`, preview)
    check(`preview-${spec.code}-${widgetType}`, preview.status==='READY', { status: preview.status, errors: preview.errors })
    if (widgetType==='KPI_CARD') check(`preview-overview-consistent-${spec.code}`, Number(preview.rows?.[0]?.value)===Number(analysis.overview?.value), { preview: preview.rows?.[0], overview: analysis.overview })
  }
})

for (const domain of rows(catalog['/meta/data-domains']).filter(d=>d.status==='PUBLISHED').slice(0,2)) await run(`domain-${domain.id}`, async () => {
  await read(`/meta/data-domains/${domain.id}`)
  await read(`/meta/data-domains/${domain.id}/impact-analysis`)
  const tables = rows(await read(`/meta/data-domains/${domain.id}/physical-tables`))
  for (const table of tables.slice(0,2)) {
    const fields = rows(await read(`/meta/data-domains/${domain.id}/physical-tables/${table.tableName}/semantic-fields`))
    await read(`/meta/source-tables/${table.tableName}/fields`)
    if (fields[0]) { await read(`/meta/semantic-fields/${fields[0].id}`); await read(`/meta/semantic-fields/${fields[0].id}/value-set`); await read(`/meta/semantic-fields/${fields[0].id}/impact-analysis`) }
  }
})
for (const [path, detail] of [['/meta/source-mappings','/meta/source-mappings'], ['/mappings','/mappings'], ['/analysis/warning-rules','/analysis/warning-rules'], ['/analysis/warnings','/analysis/warnings'], ['/meta/value-sets','/meta/value-sets'], ['/factor-templates','/factor-templates'], ['/scenarios','/scenarios']]) {
  const item = rows(catalog[path])[0]
  if (!item) continue
  await run(`detail-${path}`, async () => {
    if (!['/scenarios','/factor-templates'].includes(path)) await read(`${detail}/${item.id}`)
    if (['/factor-templates','/scenarios','/meta/value-sets'].includes(path)) await read(`${detail}/${item.id}/versions`)
    if (path==='/factor-templates') await read(`${detail}/${item.id}/parameter-schema`)
    if (path==='/meta/source-mappings') await read(`${detail}/${item.id}/diff`)
    if (path==='/analysis/warnings') await read(`${detail}/${item.id}/deliveries`)
  })
}
for (const input of [
  ['POST','/indicators',{code:'bad code',name:'验收输入错误'}], ['POST','/indicators',{code:'INVALID_LONG_TEST',name:'验'.repeat(201)}],
  ['POST','/sql-imports',{sql:'DELETE FROM vmq_basicinformationzy',definitionType:'SQL'}],
  ['GET','/indicator-versions/999999999999999',undefined],
  ['GET',`/analysis/indicators/${specs[0].id}/analysis?periodStart=2026-02-01&periodEnd=2026-01-01`,undefined]
]) await run(`invalid-${input[1]}`,async()=>{
  const result=await api(...input,{allowError:true})
  await save(`invalid-${input[1].replace(/[^a-zA-Z0-9]/g,'_')}-${String(input[2]?.name||'').length}`,result)
  check(`invalid-rejected-${input[1]}`,result.http>=400&&result.http<500,{http:result.http,message:result.message,data:result.data})
})
await save('catalog', catalog)
await save('specs', specs)
await finish()
