import { api, check, finish, poll, run, save, pause } from './system-test-client.mjs'
import { db } from './system-db.mjs'
const code=`CORE_FT_${Date.now()}`
const fixtures={factors:[],indicators:[],warnings:[],schedules:[]}
const temporal=process.env.IDMP_CORE_TEMPORAL==='1'
const dsl={schemaVersion:'1.0',dslType:'FACTOR',calculationMode:'STATIC',primaryDomain:{domainCode:'DASHBOARD_SURGERY_QUALITY_20260922',tableName:'vmq_surgeryinfo',sourceAlias:'base'},aggregation:{function:'COUNT'},filters:{nodeType:'PREDICATE',fieldCode:'surgery_level',operator:'EQ',value:'3'},groupBy:[],parameters:[],output:{valueType:'DECIMAL',precision:20,scale:0,grain:[]},missingRowPolicy:'ZERO'}
if(temporal){dsl.calculationMode='TEMPORAL';dsl.filters={nodeType:'AND',children:[dsl.filters,{nodeType:'PREDICATE',fieldCode:'SurgeryStartTime',operator:'BETWEEN',parameter:'period'}]}}
const period=temporal?{periodStart:'2026-01-01T00:00:00',periodEnd:'2026-01-02T00:00:00'}:{}
let factorVersion,indicatorVersion,indicatorId
await run('ordinary-factor',async()=>{
  const created=await api('POST','/factors',{code:code+'_F',name:'系统完整测试普通因子 '+code,category:'QUALITY',dsl})
  fixtures.factors.push(created.id);factorVersion=created.draftVersionId
  await save('factor-created',created)
  const duplicate=await api('POST','/factors',{code:code+'_DUP',name:created.name,dsl},{allowError:true})
  await save('factor-duplicate',duplicate)
  check('factor-duplicate-details',duplicate.http===409&&Boolean(duplicate.data),duplicate)
  const compilation=await api('POST',`/factor-versions/${factorVersion}/compile`)
  await save('factor-compile',compilation)
  check('factor-compile',compilation.status==='VALID'&&!compilation.diagnostics?.some(d=>d.severity==='ERROR'),compilation)
  const trial=await api('POST',`/factor-versions/${factorVersion}/trial`,period)
  await poll(`/async-tasks/${trial.taskId}`,['SUCCEEDED'],90000)
  const results=await api('GET',`/factor-versions/${factorVersion}/trials/${trial.batchId}/results`)
  await save('factor-trial-results',results)
  check('factor-trial-complete',true)
  const published=await api('POST',`/factor-versions/${factorVersion}/publish`)
  await save('factor-published',published)
  const current=await api('GET',`/factors/${created.id}`)
  const updated=await api('PATCH',`/factors/${created.id}`,{name:created.name,category:'QUALITY',description:'独立测试物理字段因子',resourceVersion:current.resourceVersion})
  check('factor-metadata-update',updated.description==='独立测试物理字段因子')
})
await run('ordinary-indicator',async()=>{
  if(!factorVersion)throw new Error('因子未创建成功')
  const created=await api('POST','/indicators',{code:code+'_I',name:'系统完整测试普通指标 '+code,category:'QUALITY'})
  indicatorId=created.id;fixtures.indicators.push(indicatorId)
  const duplicate=await api('POST','/indicators',{code:code+'_IDUP',name:created.name},{allowError:true})
  await save('indicator-duplicate',duplicate);check('indicator-duplicate-details',duplicate.http===409&&Boolean(duplicate.data),duplicate)
  const version=await api('POST',`/indicators/${indicatorId}/versions`,{calculationMode:temporal?'TEMPORAL':'STATIC',dimensionGrain:[],drillPaths:[],formula:{schemaVersion:'1.0',astType:'INDICATOR_FORMULA',root:{nodeType:'FACTOR_REF',nodeId:'root',factorVersionId:factorVersion},display:{format:'NUMBER',scale:0,multiplier:'1',roundingMode:'HALF_UP'}}})
  indicatorVersion=version.id
  await save('indicator-version',version)
  const compiled=await api('POST',`/indicator-versions/${indicatorVersion}/formula/compile`,{resourceVersion:version.resourceVersion??version.version})
  await save('indicator-compiled',compiled)
  if(!check('indicator-compile-valid',compiled.status==='VALID',compiled))throw new Error('编译返回无效诊断')
  const early=await api('POST',`/indicator-versions/${indicatorVersion}/publish`,undefined,{allowError:true})
  check('ordinary-publish-gate',early.http===409,early)
  const trial=await api('POST',`/indicator-versions/${indicatorVersion}/trial`,period)
  await poll(`/async-tasks/${trial.taskId}`,['SUCCEEDED'],90000)
  await save('indicator-trial',await api('GET',`/indicator-versions/${indicatorVersion}/trials/${trial.batchId}/results`))
  const published=await api('POST',`/indicator-versions/${indicatorVersion}/publish`)
  await save('indicator-published',published)
  check('ordinary-indicator-published',(await api('GET',`/indicators/${indicatorId}`)).status==='PUBLISHED')
})
await run('formal-calculation',async()=>{
  if(!indicatorVersion)throw new Error('指标版本未创建成功')
  const body={ownerType:'INDICATOR',ownerVersionId:indicatorVersion,batchType:'FULL',periodType:temporal?'DAILY':'STATIC',...period}
  const first=await api('POST','/calc/batches',body,{headers:{'X-Idempotency-Key':code+'_FORMAL'}})
  const replay=await api('POST','/calc/batches',body,{headers:{'X-Idempotency-Key':code+'_FORMAL'}})
  check('formal-idempotency',first.batchId===replay.batchId, {first,replay})
  await poll(`/async-tasks/${first.taskId}`,['SUCCEEDED'],90000)
  const second=await api('POST','/calc/batches',body,{headers:{'X-Idempotency-Key':code+'_RECALC'}})
  await poll(`/async-tasks/${second.taskId}`,['SUCCEEDED'],90000)
  await save('formal-batch',await api('GET',`/calc/batches/${second.batchId}`))
  const analysis=await api('GET',`/analysis/indicators/${indicatorId}/analysis?indicatorVersionId=${indicatorVersion}&granularity=${temporal?'DAILY':'STATIC'}${temporal?'&periodStart=2026-01-01&periodEnd=2026-01-01':''}`)
  await save('formal-analysis',analysis)
  const truth=(await db('SOURCE',"SELECT JSON_OBJECT('value',COUNT(*)) FROM vmq_surgeryinfo WHERE surgery_level='3'"+(temporal?" AND SurgeryStartTime>='2026-01-01' AND SurgeryStartTime<'2026-01-02'":"")))[0]
  check('ordinary-formal-source-value',Number(analysis.overview?.value)===truth.value,{value:analysis.overview?.value,truth})
  check('ordinary-snapshot-persisted',!!analysis.overview?.snapshotId,analysis.overview)
})
await run('target-value',async()=>{
  const target=await api('GET',`/indicator-versions/${indicatorVersion}/performance-target`)
  const changed=await api('PUT',`/indicator-versions/${indicatorVersion}/performance-target`,{resourceVersion:target.resourceVersion,targetValue:100,improvementDirection:'HIGHER_IS_BETTER'})
  check('target-save',Number(changed.targetValue)===100)
  const conflict=await api('PUT',`/indicator-versions/${indicatorVersion}/performance-target`,{resourceVersion:target.resourceVersion,targetValue:101,improvementDirection:'HIGHER_IS_BETTER'},{allowError:true})
  check('target-version-conflict',conflict.http===409,conflict)
  await save('target',changed)
})
await run('schedule',async()=>{
  const created=await api('POST','/calc/schedules',{scheduleCode:code+'_S',scheduleName:'系统完整测试禁用定时任务 '+code,ownerType:'INDICATOR',ownerVersionId:indicatorVersion,cronExpression:'0 0 0 1 1 *',timezone:'Asia/Shanghai',periodType:'YEARLY',periodOffset:1,enabled:false})
  fixtures.schedules.push(created.id);await save('schedule',created)
  const disabled=await api('PATCH',`/calc/schedules/${created.id}/status`,{enabled:false})
  check('schedule-disabled',disabled.status==='PAUSED'&&disabled.nextTriggerAt===null,disabled)
})
await run('warning-rule',async()=>{
  const created=await api('POST','/analysis/warning-rules',{code:code+'_W',name:'系统完整测试禁用预警 '+code,warningType:'THRESHOLD',indicatorVersionId:indicatorVersion,periodType:'MONTHLY',condition:{operator:'GT',threshold:'100'},notificationPolicy:{channels:['IN_APP'],recipientUserIds:[1]},severity:'HIGH',effectiveStartDate:'2099-01-01'})
  fixtures.warnings.push(created.id);await save('warning-created',created)
  await api('POST',`/analysis/warning-rules/${created.id}/disable`,{resourceVersion:created.resourceVersion})
  const published=await api('POST',`/analysis/warning-rule-versions/${created.version.id}/publish`,{resourceVersion:created.version.resourceVersion})
  await save('warning-published',published)
  const current=await api('GET',`/analysis/warning-rules/${created.id}`)
  check('warning-safe-disabled',current.enableStatus==='DISABLED',current)
})
for(const type of ['indicators','factors'])for(const id of fixtures[type])await run('cleanup-'+type+'-'+id,async()=>{
  let impact
  for(let i=0;i<20;i++){impact=await api('GET',`/${type}/${id}/deletion-impact`);if(impact.deletable)break;await pause(1000)}
  await save(`cleanup-impact-${type}`,impact)
  if(!impact.deletable)throw new Error('测试资源仍有依赖，保留并记录ID')
  const item=await api('GET',`/${type}/${id}`)
  await api('DELETE',`/${type}/${id}`,{resourceVersion:item.resourceVersion,deleteReason:'完整系统测试结束'})
  const recycled=await api('GET',`/${type}/recycle-bin/${id}`)
  await save(`recycled-${type}`,recycled)
  const resourceVersion=recycled.resourceVersion??recycled.resource?.resourceVersion??recycled.summary?.resourceVersion
  if(resourceVersion!==undefined) {
    await api('POST',`/${type}/recycle-bin/${id}/restore`,{resourceVersion})
    check('recycle-restore-'+type,!!await api('GET',`/${type}/${id}`))
    const restored=await api('GET',`/${type}/${id}`)
    await api('DELETE',`/${type}/${id}`,{resourceVersion:restored.resourceVersion,deleteReason:'系统测试恢复验证完成，再次回收'})
  }
  check('cleanup-'+type,true)
})
await save('fixtures',fixtures)
await finish()
