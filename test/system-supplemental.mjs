import { api, check, finish, run, save } from './system-test-client.mjs'

const fixtures = { drillPaths: [] }
await run('read-contracts', async () => {
  for (const path of [
    '/factors/102027642461312818/versions',
    '/factor-versions/102027642461312819',
    '/meta/drill-paths/102027642458341377/versions',
    '/factor-template-versions/102027642461473151/instances',
    '/calc/schedules/102027642461473558',
    '/meta/value-set-versions/102027642461473122/items',
  ]) {
    const result = await api('GET', path, undefined, { allowError: true })
    await save(path.replaceAll('/', '_'), result)
    check(path, result.http === 200, result)
  }
  const disabled = await api('GET', '/meta/source-field-mappings/102027642461473629/transform-rule', undefined, { allowError: true })
  check('disabled-source-mapping-rejected', disabled.http === 404, disabled)
  const factor = await api('GET', '/factor-versions/102027642461312819')
  if (factor.currentArtifactId) {
    const artifact = await api('GET', '/compile-artifacts/' + factor.currentArtifactId)
    check('compile-artifact-current', !!artifact)
  }
})
await run('drill-path-management', async () => {
  const original = await api('GET', '/meta/drill-path-versions/102027642460761110')
  const levels = original.levels.map(({ levelCode, levelName, dimensionSemanticFieldId, memberKeySemanticFieldId, displaySemanticFieldId, allowedColumns, nextLevelPolicy }) => ({ levelCode, levelName, dimensionSemanticFieldId, memberKeySemanticFieldId, displaySemanticFieldId, allowedColumns, nextLevelPolicy }))
  let detail = await api('POST', '/meta/drill-paths', { pathCode: 'DRILL_FT_' + Date.now(), pathName: '系统完整测试组织路径', subjectType: 'INDICATOR_RESULT', pathDescription: '独立测试，不绑定业务指标', effectiveStartDate: '2099-01-01', levels })
  fixtures.drillPaths.push(detail.path.id)
  const id = detail.version.id
  const rejected = await api('POST', `/meta/drill-path-versions/${id}/publish`, { version: detail.version.resourceVersion }, { allowError: true })
  await save('drill-early-publish', rejected)
  // Publishing may validate inline; do not assume a mandatory standalone validation gate.
  if (rejected.http === 200) detail = rejected.data
  if (detail.version.publicationStatus === 'DRAFT') {
    detail = await api('PATCH', `/meta/drill-path-versions/${id}`, { version: detail.version.resourceVersion, pathName: detail.path.pathName, pathDescription: detail.path.pathDescription, effectiveStartDate: '2099-01-01', levels })
    const valid = await api('POST', `/meta/drill-path-versions/${id}/validate`)
    check('drill-path-valid', valid.valid, valid)
    detail = await api('GET', `/meta/drill-path-versions/${id}`)
    detail = await api('POST', `/meta/drill-path-versions/${id}/publish`, { version: detail.version.resourceVersion })
  }
  check('drill-path-published', detail.version.publicationStatus === 'PUBLISHED')
  const copy = await api('POST', `/meta/drill-paths/${detail.path.id}/versions`, { copyFromVersionId: id, effectiveStartDate: '2099-01-01' })
  const updated = await api('PATCH', `/meta/drill-path-versions/${copy.version.id}`, { version: copy.version.resourceVersion, pathName: detail.path.pathName, pathDescription: detail.path.pathDescription, effectiveStartDate: '2099-01-01', levels })
  const valid = await api('POST', `/meta/drill-path-versions/${copy.version.id}/validate`)
  check('drill-copied-draft-valid', valid.valid, valid)
  await save('drill-path', { detail, copy, updated, valid })
})
await run('range-summary-known-period', async () => {
  const result = await api('GET', '/analysis/indicators/102027642460761108/range-summary?indicatorVersionId=102027642460761114&periodStart=2026-01-01&periodEnd=2026-01-31', undefined, { allowError: true })
  await save('range-summary', result)
  check('range-summary-known-period', result.http === 200, result)
})
await run('warning-enable-disable', async () => {
  const current = await api('GET', '/analysis/warning-rules/612872719079788216')
  if (current.version.effectiveStartDate !== '2099-01-01') throw new Error('仅允许操作2099年生效的独立测试规则')
  const enabled = await api('POST', `/analysis/warning-rules/${current.id}/enable`, { resourceVersion: current.resourceVersion })
  check('warning-enable', enabled.enableStatus === 'ENABLED')
  const disabled = await api('POST', `/analysis/warning-rules/${current.id}/disable`, { resourceVersion: enabled.resourceVersion })
  check('warning-disable-final', disabled.enableStatus === 'DISABLED')
})
await save('fixtures', fixtures)
await finish()
