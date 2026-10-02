import { api, check, finish, run, save } from './system-test-client.mjs'
const code='POLICY_FT_'+Date.now()
const fixtures=[]
await run('policy-lifecycle',async()=>{
  const created=await api('POST','/meta/policy-files',{code,name:'系统完整测试政策文件 '+code,category:'QUALITY',issuingOrganization:'系统测试',description:'仅测试政策文件元数据，不是实际医疗政策'})
  fixtures.push(created.policyFile.id);const id=created.policyFile.id
  const version=await api('POST',`/meta/policy-files/${id}/versions`,{issueDate:'2026-10-02',effectiveStartDate:'2099-01-01',contentHash:'a'.repeat(64),extractedContent:{title:'系统测试文件',content:'用于验证政策文件元数据和版本接口。'},sourceUrl:'https://example.invalid/'+code})
  const vid=version.versions.at(-1).id
  const valid=await api('POST',`/meta/policy-file-versions/${vid}/validate`)
  await save('policy-valid',valid);check('policy-valid',valid.valid,valid)
  const current=await api('GET',`/meta/policy-file-versions/${vid}`)
  const published=await api('POST',`/meta/policy-files/${id}/versions/${vid}/publish`,{resourceVersion:current.resourceVersion})
  check('policy-published',published.policyFile.status==='PUBLISHED',published.policyFile)
  await save('policy',{created,version,published})
  const detail=await api('GET',`/meta/policy-files/${id}`)
  const updated=await api('PATCH',`/meta/policy-files/${id}`,{resourceVersion:detail.policyFile.resourceVersion,name:detail.policyFile.name,category:'QUALITY',description:'系统完整测试政策文件元数据修改完成'})
  check('policy-metadata-edit',updated.policyFile.description.includes('修改完成'))
  const relations=await api('GET',`/meta/policy-file-versions/${vid}/relations`)
  check('policy-relations',Array.isArray(relations))
})
await run('mapping-compare',async()=>{
  const comparison=await api('GET','/mappings/compare?sourceIndicatorVersionId=102027642460335206&targetIndicatorVersionId=102027642460761114')
  await save('mapping-comparison',comparison);check('mapping-comparison',!!comparison)
})
await save('fixtures',fixtures)
await finish()
