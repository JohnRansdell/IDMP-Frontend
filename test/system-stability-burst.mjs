import { api, check, finish, run, save, pause } from './system-test-client.mjs'
import { db } from './system-db.mjs'
const requests=[
 ['GET','/indicator-versions/102027642461313071/available-period'],
 ['GET','/analysis/indicators/102027642461313070/analysis?indicatorVersionId=102027642461313071&periodStart=2026-01-01&periodEnd=2026-01-31&granularity=MONTHLY'],
 ['POST','/analysis/dashboards/1189225114584501123/query',{periodStart:'2026-01-01',periodEnd:'2026-01-31',granularity:'MONTHLY'}],
 ['GET','/factors?page=1&size=20']
]
for(let round=0;round<3;round++) {
  const result=await Promise.all(requests.map(async args=>{
    const start=performance.now()
    try{await api(...args);return {path:args[1],ms:Math.round(performance.now()-start),ok:true}}
    catch(error){return {path:args[1],ms:Math.round(performance.now()-start),ok:false,error:error.message}}
  }))
  await save('burst-'+round,result)
  check('burst-four-requests-'+round,result.every(r=>r.ok),result)
  if(result.some(r=>!r.ok))break
  await pause(300)
}
await run('active-recalc-uniqueness',async()=>{
  const refs=await db('PLATFORM',"SELECT JSON_OBJECT('key',activation_key,'count',COUNT(*),'generation',MAX(activation_generation)) FROM rsl_active_result_ref WHERE indicator_version_id=102027642461473181 AND status='ACTIVE' AND reference_status='ACTIVE' GROUP BY activation_key")
  await save('active-references',refs)
  check('one-active-reference-per-key',refs.length>0&&refs.every(r=>r.count===1),refs)
  const sets=await db('PLATFORM',"SELECT JSON_OBJECT('id',id,'state',result_set_status,'key',target_key,'batch',calculation_batch_id) FROM rsl_result_set WHERE calc_target_id IN (SELECT id FROM job_calc_target WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.ownerType'))='INDICATOR' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.ownerVersionId'))='102027642461473181')")
  await save('result-sets',sets)
  check('old-result-set-superseded',sets.some(s=>s.state==='SUPERSEDED'),sets)
})
await finish()
