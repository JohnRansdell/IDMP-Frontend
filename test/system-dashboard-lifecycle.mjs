import { api, check, finish, run, save, tag } from './system-test-client.mjs'
import { isDeepStrictEqual } from 'node:util'
const code=`DASH_FT_${Date.now()}`
const ids=[]
await run('dashboard-lifecycle',async()=>{
  const schema={code,name:`系统完整测试看板 ${code}`,type:'CUSTOM',category:'QUALITY',description:'独立自动化测试资源',applicableScope:{departments:['15']},layout:{columns:12,rowHeight:60,gap:12},theme:{mode:'light',primaryColor:'#1677ff'},style:{backgroundColor:'#ffffff',backgroundFit:'cover'},globalFilters:{fields:['department']},interactions:{enabled:true},widgets:[{code:'rate',title:'急诊手术占比',type:'KPI_CARD',dataSourceCode:'DASHBOARD_EMERGENCY_SURGERY_RATE_20260922',indicatorVersionId:'102027642460335206',position:{x:1,y:2,w:4,h:3},fieldBindings:{value:'value',numerator:'numeratorValue',denominator:'denominatorValue'},query:{resultShape:'OVERVIEW'},filterBindings:{},drill:{enabled:false},chart:{precision:2},style:{fontSize:24,color:'#333333',locked:true}}]}
  const created=await api('POST','/analysis/dashboards',schema)
  const id=created.dashboard.id;ids.push(id)
  await save('created',created)
  const read=await api('GET',`/analysis/dashboards/${id}`)
  check('dashboard-style-roundtrip',isDeepStrictEqual(read.version.style,schema.style)&&isDeepStrictEqual(read.version.widgets[0].position,schema.widgets[0].position)&&read.version.widgets[0].indicatorVersionId===schema.widgets[0].indicatorVersionId,read)
  const changed={...schema,resourceVersion:read.dashboard.resourceVersion,name:schema.name+' 修改',widgets:schema.widgets.map(w=>({...w,position:{x:6,y:4,w:6,h:4},style:{...w.style,fontSize:32}}))}
  delete changed.code
  const saved=await api('PUT',`/analysis/dashboards/${id}`,changed)
  check('dashboard-edit-layout',saved.version.widgets[0].position.x===6&&saved.version.widgets[0].style.fontSize===32)
  const stale=await api('PUT',`/analysis/dashboards/${id}`,changed,{allowError:true})
  check('dashboard-concurrent-save-rejected',stale.http===409,stale)
  const published=await api('POST',`/analysis/dashboards/${id}/publish`,{resourceVersion:saved.dashboard.resourceVersion})
  await save('published',published);check('dashboard-published',published.dashboard.status==='PUBLISHED',published.dashboard.status)
  const query=await api('POST',`/analysis/dashboards/${id}/query`,{periodStart:'2026-01-01',periodEnd:'2026-01-31',granularity:'MONTHLY'})
  await save('query',query)
  check('dashboard-query-correct',query.widgets.rate.status==='READY'&&Math.abs(Number(query.widgets.rate.rows[0].value)-778/13217)<1e-8,query.widgets.rate)
  const copy=await api('POST',`/analysis/dashboards/${id}/copy`,{code:code+'_COPY',name:'系统测试复制 '+code});ids.push(copy.dashboard.id)
  check('dashboard-copy',copy.dashboard.id!==id&&copy.version.widgets[0].position.x===6&&copy.dashboard.status!=='PUBLISHED',copy.dashboard)
  const history=await api('GET',`/analysis/dashboards/${id}/versions`)
  await save('history',history)
  const restored=await api('POST',`/analysis/dashboards/${id}/versions/${published.version.id}/restore`)
  check('dashboard-version-restore',restored.version.widgets[0].position.x===6,restored)
})
for(const id of ids)await run('dashboard-cleanup-'+id,async()=>{
  await api('DELETE',`/analysis/dashboards/${id}`)
  const missing=await api('GET',`/analysis/dashboards/${id}`,undefined,{allowError:true})
  check('dashboard-delete-'+id,missing.http===404,missing)
})
await save('fixtures',ids)
await finish()
