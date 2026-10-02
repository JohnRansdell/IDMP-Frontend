import { api, check, finish, poll, run, save, tag } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const code = `FT${Date.now()}`
const fixtures=[]
const sql=`WITH total_admissions AS (
 SELECT COUNT(DISTINCT b.In_Hospital_ID) total_cnt FROM vmq_basicinformationzy b
 WHERE b.In_Date>='2026-01-01' AND b.In_Date<'2026-01-02'
 [[AND b.In_Date >= {{startDate}}]] [[AND b.In_Date < {{endDate}}]]
 [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]]
), transfer_48h AS (
 SELECT COUNT(DISTINCT b.In_Hospital_ID) transfer_cnt FROM vmq_basicinformationzy b
 JOIN vmq_inpatienttransferdetail t ON b.In_Hospital_ID=t.In_Hospital_ID
 WHERE b.In_Date>='2026-01-01' AND b.In_Date<'2026-01-02'
 AND t.In_Dept_Date>=b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48
 [[AND b.In_Date >= {{startDate}}]] [[AND b.In_Date < {{endDate}}]]
 [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]]
) SELECT total_cnt admissions,transfer_cnt transfers,ROUND(transfer_cnt*100.0/total_cnt,2) transfer_rate_percent
FROM total_admissions CROSS JOIN transfer_48h`
const bindings={科室:'b.out_dept_code',病种:'b.in_icd10',OUT_DEPT_CODE:'b.out_dept_code',OUT_DEPT_NAME:'b.out_dept_name',ATTENDING_DOCTOR:'b.AttendingDoctor',ATTENDING_DOCTOR_NAME:'b.AttendingDoctorName'}
const staticSql=`WITH total_admissions AS (
 SELECT COUNT(*) total_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3'
 [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]]
), transfer_48h AS (
 SELECT COUNT(*) transfer_cnt FROM vmq_surgeryinfo b WHERE b.surgery_level='3' AND b.surgery_classfy='2'
 [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]]
) SELECT total_cnt admissions,transfer_cnt transfers,ROUND(transfer_cnt*100.0/total_cnt,2) rate_percent
FROM total_admissions CROSS JOIN transfer_48h`
async function cleanupResource(type,id) {
  const item=await api('GET',`/${type}/${id}`)
  const impact=await api('GET',`/${type}/${id}/deletion-impact`)
  await save(`cleanup-impact-${type}-${id}`,impact)
  if(!impact.deletable) throw new Error(`测试资源无法安全删除 ${type}/${id}`)
  await api('DELETE',`/${type}/${id}`,{resourceVersion:item.resourceVersion,deleteReason:'2026-10-02系统测试完成，移除独立测试资源'})
  check(`cleanup-${type}-${id}`,true)
}
for(const mode of ['FACTORS_ONLY','FACTORS_AND_INDICATOR','TEMPORAL_GRAIN']) await run(mode,async()=>{
  const body={sql:mode==='TEMPORAL_GRAIN'?sql:staticSql,definitionType:'SQL'}
  const created=await api('POST','/sql-imports',body,{headers:{'Idempotency-Key':`${tag}-${code}-${mode}`}})
  const id=created.importId
  fixtures.push({id,mode})
  await save(`parsed-${mode}`,created)
  check(`${mode}-parsed`,created.status==='AWAITING_METADATA'&&created.preview.factors.length===2,created.status)
  const replay=await api('POST','/sql-imports',body,{headers:{'Idempotency-Key':`${tag}-${code}-${mode}`}})
  check(`${mode}-idempotency`,replay.importId===id)
  const parameters=created.preview.factors[0].dsl.parameters
  check(`${mode}-inferred-types`,parameters.some(p=>p.code==='patientName'&&p.type==='STRING')&&(mode!=='TEMPORAL_GRAIN'||parameters.some(p=>p.code==='startDate'&&['DATE','DATETIME'].includes(p.type))),parameters)
  const temporal=mode==='TEMPORAL_GRAIN'
  const scope=mode==='FACTORS_ONLY'?mode:'FACTORS_AND_INDICATOR'
  const metadata={scope,category:'QUALITY',factors:created.preview.factors.map((f,i)=>({key:f.key,code:`${code}_${mode}_${i}`,name:`完整测试因子 ${code} ${mode} ${i}`,missingRowPolicy:'ZERO',...(temporal?{timeField:'b.In_Date'}:{}),calculationMode:temporal?'TEMPORAL':'STATIC',parameters:f.dsl.parameters,...(temporal?{dimensionBindings:bindings}:{})})),...(scope==='FACTORS_AND_INDICATOR'?{indicatorCode:`${code}_${mode}`,indicatorName:`完整测试指标 ${code} ${mode}`,formula:{source:'SQL_FINAL_SELECT'},...(temporal?{dimensionGrain:['科室','病种'],drillPaths:[{pathCode:'ORGANIZATION',maxLevel:'ATTENDING_DOCTOR',pathVersionId:'102027642460761110'}]}:{drillPaths:[]})}:{})}
  await save(`metadata-request-${mode}`,metadata)
  try {
    const submitted=await api('PUT',`/sql-imports/${id}/metadata`,metadata)
    await save(`metadata-${mode}`,submitted)
    check(`${mode}-metadata`,submitted.status==='READY_FOR_TRIAL',submitted.status)
    const early=await api('POST',`/sql-imports/${id}/finalize`,undefined,{allowError:true})
    check(`${mode}-finalize-gate`,early.http>=400&&early.http<500,early)
    await api('POST',`/sql-imports/${id}/trial`,{...(temporal?{periodStart:'2026-01-01T00:00:00',periodEnd:'2026-01-02T00:00:00'}:{}),parameters:{}})
    const state=await poll(`/sql-imports/${id}`,['TRIAL_SUCCEEDED'],120000)
    await save(`trial-${mode}`,state)
    check(`${mode}-draft-isolation`,state.resources.every(r=>!r.published),state.resources)
    const result=state.result
    console.log(`${mode} result ${JSON.stringify(result).slice(0,1800)}`)
    if(scope==='FACTORS_AND_INDICATOR') {
      const results=await api('GET',`/indicator-versions/${result.indicatorVersionId}/trials/${result.trialBatchId}/results?page=1&size=500`)
      await save(`trial-results-${mode}`,results)
      const target=results.targets.find(t=>temporal?t.drillLevelCode==='HOSPITAL':t.targetCode==='BASE')||results.targets[0]
      const actual=target.results.records[0]
      const truth=(await db('SOURCE',temporal?"SELECT JSON_OBJECT('n',(SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-01-02' AND t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48),'d',(SELECT COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-01-02'))":"SELECT JSON_OBJECT('n',(SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='3' AND surgery_classfy='2'),'d',(SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='3'))"))[0]
      check(`${mode}-source-reconciled`,Number(actual.numeratorValue)===truth.n&&Number(actual.denominatorValue)===truth.d,{actual,truth})
      if(temporal) {
        for(const level of ['YEAR','QUARTER','MONTH','DAY','HOSPITAL','OUT_DEPT','ATTENDING_DOCTOR'])check(`target-${level}`,results.targets.some(t=>t.drillLevelCode===level&&t.targetStatus==='READY'),results.targets.map(t=>({code:t.targetCode,status:t.targetStatus})))
        check('combination-grain',results.targets.find(t=>t.targetCode==='BASE')?.results.total>1)
      }
    }
    if(!temporal) {
      await api('POST',`/sql-imports/${id}/finalize`)
      const published=await poll(`/sql-imports/${id}`,['SUCCEEDED'],120000)
      await save(`published-${mode}`,published)
      check(`${mode}-published`,published.resources.every(r=>r.published),published.resources)
      fixtures.at(-1).published=published
      if(scope==='FACTORS_AND_INDICATOR')check('indicator-master-published',(await api('GET',`/indicators/${result.indicatorId}`)).status==='PUBLISHED')
    }
  } finally {
    const state=await api('GET',`/sql-imports/${id}`)
    if(state.status==='SUCCEEDED') {
      if(state.result?.indicatorId)await cleanupResource('indicators',state.result.indicatorId)
      for(const resource of state.resources.filter(r=>r.type==='FACTOR'))await cleanupResource('factors',resource.resourceId)
    } else {
      await api('POST',`/sql-imports/${id}/abandon`,{reason:'完整测试结束，回收独立测试草稿'})
      const end=await poll(`/sql-imports/${id}`,['ABANDONED','ABANDONED_WITH_RETAINED'],120000)
      await save(`abandoned-${mode}`,end);check(`${mode}-abandoned`,end.status==='ABANDONED')
    }
  }
})
await save('fixtures',fixtures)
await finish()
