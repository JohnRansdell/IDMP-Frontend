import { readFile } from 'node:fs/promises'
import { api, check, finish, run, save, parseJson } from './system-test-client.mjs'
const fixtures=parseJson(await readFile('.tmp/system-test-20261002/GOV/fixtures.json','utf8'))
await run('value-set-protection',async()=>{
  for(const id of fixtures.valueSets){
    const detail=await api('GET',`/meta/value-sets/${id}`)
    const rejected=await api('POST',`/meta/value-set-versions/${detail.version.id}/archive`,{resourceVersion:detail.version.resourceVersion},{allowError:true})
    check('active-valueset-archive-rejected-'+id,rejected.http===409,rejected)
    for(const v of await api('GET',`/meta/value-sets/${id}/versions`))if(v.publicationStatus==='DRAFT'){
      const archive=await api('POST',`/meta/value-set-versions/${v.id}/archive`,{resourceVersion:v.resourceVersion})
      check('draft-valueset-archive-'+id,archive.version.publicationStatus==='ARCHIVED')
    }
  }
})
await run('template-legacy-flow',async()=>{
  const id=fixtures.templates[0]
  const versions=await api('GET',`/factor-templates/${id}/versions`)
  let detail=await api('GET',`/factor-template-versions/${versions[0].id}`)
  const version=detail.version.id
  const definition=structuredClone(detail.version.templateDefinition)
  delete definition.primaryDomain.tableName
  definition.filters.fieldCode='SURGERY_LEVEL'
  const changed=await api('PATCH',`/factor-template-versions/${version}`,{resourceVersion:detail.version.resourceVersion,name:detail.template.name,factorTypeScope:'AGGREGATE',templateDefinition:definition,outputDescriptor:{valueType:'DECIMAL'},parameters:[{code:'level',displayName:'手术级别',dataType:'STRING',required:true,exposed:true,defaultValue:'3',valueSourceType:'FIXED',validation:{enum:['3']},displayOrder:0}]})
  const valid=await api('POST',`/factor-template-versions/${version}/validate`)
  check('legacy-template-valid',valid.valid,valid)
  detail=await api('GET',`/factor-template-versions/${version}`)
  const published=await api('POST',`/factor-template-versions/${version}/publish`,{resourceVersion:detail.version.resourceVersion})
  const schema=await api('GET',`/factor-templates/${id}/parameter-schema`)
  check('template-schema-published',schema.parameters.length===1)
  const instance=await api('POST',`/factor-template-versions/${version}/instantiate`,{factorCode:'GOV_INSTANCE_'+Date.now(),factorName:'系统完整测试模板实例 '+Date.now(),category:'QUALITY',parameterValues:{level:'3'}})
  fixtures.factors.push(instance.factor.id)
  const compile=await api('POST',`/factor-versions/${instance.factor.draftVersionId}/compile`)
  await save('legacy-template',{published,schema,instance,compile})
  check('legacy-template-instance-compile',compile.status==='VALID',compile)
})
await run('scenario-without-overrides',async()=>{
  const id=fixtures.scenarios[0]
  const versions=await api('GET',`/scenarios/${id}/versions`)
  const version=versions[0].id
  let detail=await api('GET',`/scenario-versions/${version}`)
  await api('PUT',`/scenario-versions/${version}/overrides`,{resourceVersion:detail.version.resourceVersion,overrides:[]})
  const valid=await api('POST',`/scenario-versions/${version}/validate`)
  check('scenario-valid',valid.valid,valid)
  detail=await api('GET',`/scenario-versions/${version}`)
  const published=await api('POST',`/scenario-versions/${version}/publish`,{resourceVersion:detail.version.resourceVersion})
  check('scenario-published',published.version.publicationStatus==='PUBLISHED')
  const copy=await api('POST',`/scenarios/${id}/versions`,{copyFromVersionId:version})
  check('scenario-version-copy',copy.version.indicators.length===1)
  const comparison=await api('GET',`/analysis/indicators/102027642461313070/scenario-comparison?indicatorVersionId=102027642461313071&scenarioVersionIds=${version}&periodStart=2026-01-01&periodEnd=2026-01-31`)
  await save('scenario',{published,copy,comparison})
  check('scenario-comparison-response',comparison!==null)
})
for(const id of fixtures.factors)await run('instance-cleanup-'+id,async()=>{
  const item=await api('GET',`/factors/${id}`)
  await api('DELETE',`/factors/${id}`,{resourceVersion:item.resourceVersion,deleteReason:'完整系统测试模板实例回收'})
  check('instance-cleanup-'+id,true)
})
await save('fixtures',fixtures)
await finish()
