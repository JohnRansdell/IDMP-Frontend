import { api, check, finish, run, save, pause } from './system-test-client.mjs'
import { readFile } from 'node:fs/promises'
import { parseJson } from './system-test-client.mjs'
import { db } from './system-db.mjs'
const published=parseJson(await readFile('.tmp/system-test-20261002/SQL4/published-FACTORS_AND_INDICATOR.json','utf8'))
await run('published-static-analysis',async()=>{
  const result=await api('GET',`/analysis/indicators/${published.result.indicatorId}/analysis?indicatorVersionId=${published.result.indicatorVersionId}&granularity=STATIC`)
  await save('static-analysis',result)
  const truth=(await db('SOURCE',"SELECT JSON_OBJECT('n',(SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='3' AND surgery_classfy='2'),'d',(SELECT COUNT(*) FROM vmq_surgeryinfo WHERE surgery_level='3'))"))[0]
  check('static-formal-correct',result.dataAvailable&&Math.abs(result.overview.value-truth.n/truth.d)<1e-8,{overview:result.overview,truth})
})
for(const [type,id] of [['indicators',published.result.indicatorId],...published.resources.filter(r=>r.type==='FACTOR').map(r=>['factors',r.resourceId])])await run(`cleanup-${type}-${id}`,async()=>{
  let impact
  for(let i=0;i<30;i++){impact=await api('GET',`/${type}/${id}/deletion-impact`);if(impact.deletable)break;await pause(1000)}
  await save('impact-'+type+'-'+id,impact)
  if(!impact.deletable)throw new Error('尚有运行任务或引用，未删除')
  const item=await api('GET',`/${type}/${id}`)
  await api('DELETE',`/${type}/${id}`,{resourceVersion:item.resourceVersion,deleteReason:'完整系统测试完成，回收独立SQL导入测试资源'})
  check(`cleanup-${type}-${id}`,true)
})
await save('rsl-columns',await db('PLATFORM',"SELECT JSON_OBJECT('table',TABLE_NAME,'column',COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('rsl_indicator_result','rsl_result_set','rsl_active_result_ref')"))
await finish()
