import { readFile } from 'node:fs/promises'
import { api, check, finish, parseJson, run, save } from './system-test-client.mjs'

const fixtures = { restored: [], groups: [], mappings: [], policyReferences: [] }
const prefix = 'MAPPING_FT_' + Date.now()
const versions = []
await run('mapping-review-lifecycle', async () => {
  for (const tag of ['CORE_TEMPORAL2', 'CORE_TEMPORAL3']) {
    const previous = parseJson(await readFile(`.tmp/system-test-20261002/${tag}/fixtures.json`, 'utf8'))
    for (const type of ['factors', 'indicators']) for (const id of previous[type]) {
      const recycled = await api('GET', `/${type}/recycle-bin/${id}`)
      const resourceVersion = recycled.resourceVersion ?? recycled.resource?.resourceVersion ?? recycled.summary?.resourceVersion
      await api('POST', `/${type}/recycle-bin/${id}/restore`, { resourceVersion })
      fixtures.restored.push({ type, id })
    }
    const indicator = await api('GET', `/indicators/${previous.indicators[0]}`)
    const list = await api('GET', `/indicators/${indicator.id}/versions`)
    const version = list.find(v => v.status === 'PUBLISHED')
    if (!version) throw new Error('独立测试指标没有已发布版本')
    versions.push(version.id)
  }
  const group = await api('POST', '/mappings/groups', { code: prefix, name: '系统完整测试映射组 ' + prefix, canonicalIndicatorVersionId: versions[0], description: '仅关联独立测试指标，非业务映射' })
  fixtures.groups.push(group.id)
  let mapping = await api('POST', '/mappings', { code: prefix + '_M', name: '系统完整测试映射 ' + prefix, groupId: group.id, targetIndicatorVersionId: versions[1], mappingType: 'EXACT', comparability: 'DIRECT', evidence: { reason: '两个独立测试指标使用相同物理因子口径' } })
  fixtures.mappings.push(mapping.mapping.id)
  const mappingId = mapping.mapping.id
  check('mapping-draft', mapping.mapping.reviewStatus === 'DRAFT', mapping.mapping)
  const rejected = await api('POST', `/mappings/${mappingId}/submit`, { resourceVersion: mapping.mapping.resourceVersion }, { allowError: true })
  check('mapping-policy-source-gate', rejected.http === 409 && rejected.message.includes('政策'), rejected)
  for (const version of versions) {
    const reference = await api('POST', `/mappings/indicator-versions/${version}/policy-references`, { policyFileVersionId: '102027642461473702', relationRole: 'REFERENCE', citationLocation: '完整测试', citationText: '系统测试政策元数据，不代表真实政策来源' })
    fixtures.policyReferences.push(reference)
    const list = await api('GET', `/mappings/indicator-versions/${version}/policy-references`)
    check('mapping-policy-reference-' + version, list.some(item => item.id === reference.id))
  }
  mapping = await api('PATCH', `/mappings/${mappingId}`, { resourceVersion: mapping.mapping.resourceVersion, name: mapping.mapping.name, mappingType: 'EXACT', comparability: 'DIRECT', evidence: { reason: '独立测试更新' } })
  const stale = await api('PATCH', `/mappings/${mappingId}`, { resourceVersion: 0, name: mapping.mapping.name, mappingType: 'EXACT', comparability: 'DIRECT' }, { allowError: true })
  check('mapping-version-conflict', stale.http === 409, stale)
  mapping = await api('POST', `/mappings/${mappingId}/submit`, { resourceVersion: mapping.mapping.resourceVersion })
  check('mapping-pending', mapping.mapping.reviewStatus === 'PENDING_REVIEW')
  mapping = await api('POST', `/mappings/${mappingId}/approve`, { resourceVersion: mapping.mapping.resourceVersion, comment: '独立测试通过' })
  check('mapping-approved', mapping.mapping.reviewStatus === 'APPROVED' && mapping.version.publicationStatus === 'PUBLISHED')
  mapping = await api('POST', `/mappings/${mappingId}/invalidate`, { resourceVersion: mapping.mapping.resourceVersion, reason: '完整测试结束，停用测试映射' })
  check('mapping-invalidated', mapping.mapping.reviewStatus === 'INVALIDATED')
  await save('mapping', { group, mapping })
  let other = await api('POST', '/mappings', { code: prefix + '_R', name: '系统完整测试驳回 ' + prefix, groupId: group.id, targetIndicatorVersionId: versions[1], mappingType: 'RELATED', comparability: 'NOT_COMPARABLE' })
  fixtures.mappings.push(other.mapping.id)
  other = await api('POST', `/mappings/${other.mapping.id}/submit`, { resourceVersion: other.mapping.resourceVersion })
  other = await api('POST', `/mappings/${other.mapping.id}/reject`, { resourceVersion: other.mapping.resourceVersion, comment: '系统测试驳回分支' })
  check('mapping-rejected', other.mapping.reviewStatus === 'REJECTED')
  await save('rejected-mapping', other)
})
for (const reference of fixtures.policyReferences) await run('cleanup-reference-' + reference.id, async () => {
  await api('POST', `/mappings/policy-references/${reference.id}/invalidate`, { resourceVersion: reference.resourceVersion })
  check('policy-reference-invalidated-' + reference.id, true)
})
for (const { type, id } of [...fixtures.restored].sort((a, b) => (a.type === 'indicators' ? 0 : 1) - (b.type === 'indicators' ? 0 : 1))) await run('cleanup-' + id, async () => {
  const impact = await api('GET', `/${type}/${id}/deletion-impact`)
  if (!impact.deletable) throw new Error(JSON.stringify(impact))
  const item = await api('GET', `/${type}/${id}`)
  await api('DELETE', `/${type}/${id}`, { resourceVersion: item.resourceVersion, deleteReason: '完整测试映射审核结束，再次回收' })
  check('recycled-' + id, true)
})
await save('fixtures', fixtures)
await finish()
