import { api, check, finish, rows, run, save } from './system-test-client.mjs'
const code=`META_FT_${Date.now()}`
const fixtures={domains:[],fields:[],mappings:[],transforms:[]}
await run('physical-domain',async()=>{
  const domain=await api('POST','/meta/data-domains',{code,name:'系统完整测试隔离数据域 '+code,description:'仅系统测试，不供业务指标引用'})
  fixtures.domains.push(domain.id);const id=domain.id
  const table=await api('POST',`/meta/data-domains/${id}/physical-tables`,{tableName:'vmq_surgeryinfo'})
  await save('table-added',table)
  const fields=[]
  for(const spec of [{column:'id',suffix:'KEY',name:'测试记录标识',type:'STRING'},{column:'SurgeryStartTime',suffix:'TIME',name:'测试手术开始时间',type:'DATETIME'},{column:'surgery_level',suffix:'LEVEL',name:'测试手术级别',type:'STRING'}]){
    const field=await api('POST',`/meta/data-domains/${id}/physical-tables/vmq_surgeryinfo/semantic-fields`,{sourceFieldName:spec.column,code:code+'_'+spec.suffix,name:spec.name,dataType:spec.type,semanticKind:'DIMENSION',sensitive:false})
    fields.push(field);fixtures.fields.push(field.id)
  }
  const configured=await api('PATCH',`/meta/data-domains/${id}/physical-tables/vmq_surgeryinfo/default-time-field`,{semanticFieldCode:fields[1].code})
  check('physical-default-time',configured.defaultTimeSemanticFieldCode===fields[1].code,configured)
  let detail=await api('GET',`/meta/data-domains/${id}`)
  await api('PATCH',`/meta/data-domains/${id}`,{resourceVersion:detail.resourceVersion,name:domain.name,description:domain.description,primaryKeySemanticFieldId:fields[0].id,defaultTimeSemanticFieldId:fields[1].id})
  const valid=await api('POST',`/meta/data-domains/${id}/validate`)
  check('domain-valid',valid.valid,valid)
  detail=await api('GET',`/meta/data-domains/${id}`)
  const published=await api('POST',`/meta/data-domains/${id}/publish`,{resourceVersion:detail.resourceVersion})
  check('domain-published',published.status==='PUBLISHED',published)
  const mappings=rows(await api('GET',`/meta/source-mappings?domainId=${id}&size=100`))
  for(const mapping of mappings){
    fixtures.mappings.push(mapping.id)
    const m=await api('GET',`/meta/source-mappings/${mapping.id}`)
    const valid=await api('POST',`/meta/source-mappings/${mapping.id}/validate`)
    check('source-mapping-valid',valid.valid,valid)
    const current=await api('GET',`/meta/source-mappings/${mapping.id}`)
    const published=await api('POST',`/meta/source-mappings/${mapping.id}/publish`,{resourceVersion:current.mapping.resourceVersion})
    check('source-mapping-published',published.mapping.status==='PUBLISHED',published.mapping)
    const level=m.fields.find(f=>f.sourceFieldName==='surgery_level')
    if(level)await run('source-transform',async()=>{
      const profile=await api('GET',`/meta/source-field-mappings/${level.id}/value-profile?size=20`)
      await save('source-value-profile',profile)
      const field=await api('GET',`/meta/semantic-fields/${level.semanticFieldId}`)
      await api('PUT',`/meta/semantic-fields/${level.semanticFieldId}/value-set`,{resourceVersion:field.resourceVersion,valueSetId:'102027642461473121'})
      const transform=await api('POST',`/meta/source-field-mappings/${level.id}/transform-rules`,{name:'系统测试手术级别源值标准化 '+code,unmatchedPolicy:'KEEP_SOURCE',nullPolicy:'KEEP_NULL',normalizers:['TRIM'],mappings:[{sourceValue:'3',targetItemCode:'A'}]})
      fixtures.transforms.push(transform.version.id)
      const preview=await api('POST',`/transform-rule-versions/${transform.version.id}/preview`,{limit:20})
      await save('transform-preview',preview)
      const valid=await api('POST',`/transform-rule-versions/${transform.version.id}/validate`)
      check('transform-valid',valid.valid,valid)
      const current=await api('GET',`/transform-rule-versions/${transform.version.id}`)
      const published=await api('POST',`/transform-rule-versions/${transform.version.id}/publish`,{resourceVersion:current.version.resourceVersion})
      check('transform-published',published.version.publicationStatus==='PUBLISHED')
    })
  }
  await save('domain-published',published)
})
for(const id of fixtures.mappings)await run('mapping-disable',async()=>{
  const current=await api('GET',`/meta/source-mappings/${id}`)
  await api('POST',`/meta/source-mappings/${id}/disable`,{resourceVersion:current.mapping.resourceVersion})
  check('test-source-mapping-disabled',true)
})
for(const id of fixtures.domains)await run('domain-disable',async()=>{
  const current=await api('GET',`/meta/data-domains/${id}`)
  const disabled=await api('POST',`/meta/data-domains/${id}/disable`,{resourceVersion:current.resourceVersion,force:false})
  check('test-domain-disabled',disabled.enableStatus==='DISABLED',disabled)
})
await save('fixtures',fixtures)
await finish()
