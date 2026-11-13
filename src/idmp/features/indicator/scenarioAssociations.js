import { appendScenarioIndicator } from './editorWorkflow.js'

export const associationLabels = { ACTIVE: '已生效', ADD: '待加入', REMOVE: '待移出', NONE: '未关联' }
export const versionStatus = version => String(version?.publicationStatus || version?.status || '').toUpperCase()
const id = value => String(value ?? '')
const list = value => Array.isArray(value) ? value : value?.records || value?.items || []
const has = (version, indicatorVersionId) => (version?.indicators || []).some(row => id(row.indicatorVersionId) === id(indicatorVersionId))
const bindingFields = ['indicatorVersionId', 'displayOrder', 'required', 'reportRequirementText', 'mappingOriginType', 'dimensionGrain', 'periodType', 'organizationScopeDsl']
const bindings = version => (version?.indicators || []).map(row => Object.fromEntries(bindingFields.filter(key => row[key] !== undefined).map(key => [key, row[key]])))
const versionSignature = version => version ? [id(version.id), versionStatus(version), version.resourceVersion, bindings(version)] : null
export const associationSignature = state => JSON.stringify([id(state.scenario.id), state.scenario.enableStatus, versionSignature(state.published), versionSignature(state.draft)])

export function associationStatus(state, indicatorVersionId) {
  const active = has(state.published, indicatorVersionId), pending = has(state.draft, indicatorVersionId)
  return active ? state.draft && !pending ? 'REMOVE' : 'ACTIVE' : pending ? 'ADD' : 'NONE'
}

export function compareScenarioBindings(current = [], baseline = []) {
  const old = new Map(baseline.map(row => [id(row.indicatorVersionId), row]))
  const next = new Map(current.map(row => [id(row.indicatorVersionId), row]))
  const clean = row => bindings({ indicators: [row] })[0]
  return {
    added: current.filter(row => !old.has(id(row.indicatorVersionId))),
    removed: baseline.filter(row => !next.has(id(row.indicatorVersionId))),
    changed: current.filter(row => old.has(id(row.indicatorVersionId)) && JSON.stringify(clean(row)) !== JSON.stringify(clean(old.get(id(row.indicatorVersionId)))))
  }
}

export function changeRestriction(state, indicatorVersionId, action, canRequest = () => true) {
  if (state.error) return '场景配置读取失败，请刷新后重试'
  if (versionStatus(state.scenario) === 'ARCHIVED' || String(state.scenario.enableStatus || '').toUpperCase() === 'DISABLED') return '该场景已归档或停用'
  if (!['DRAFT', 'PUBLISHED'].includes(versionStatus(state.scenario))) return '场景状态未识别，请先刷新核对'
  const base = state.draft || state.published
  if (!base) return '场景没有可维护的版本'
  if (action === 'REMOVE' && has(base, indicatorVersionId) && (base.indicators || []).length <= 1) return '这是场景的最后一个指标。当前服务暂不支持清空或自动停用，请保留该关联，或先加入其他指标。'
  const target = state.draft ? id(state.draft.id) : '1'
  if (!canRequest('PUT', `/scenario-versions/${target}/indicators`)) return '当前账号没有维护场景关联的权限'
  if (!state.draft && !canRequest('POST', `/scenarios/${state.scenario.id}/versions`)) return '当前账号没有创建场景变更的权限'
  return ''
}

export function createScenarioAssociationService(api, canRequest = () => true) {
  async function read(scenario, indicatorVersionId) {
    const versions = list(await api.fetchScenarioVersions(id(scenario.id)))
    const drafts = versions.filter(row => versionStatus(row) === 'DRAFT')
    if (drafts.length > 1) throw new Error('场景存在多个草稿，请先进入场景页确认')
    const latestPublished = versions.filter(row => versionStatus(row) === 'PUBLISHED').sort((a, b) => Number(b.versionNo) - Number(a.versionNo))[0]
    const anchor = drafts[0] || latestPublished
    if (!anchor) throw new Error('场景暂无可维护版本')
    const first = await api.fetchScenarioVersion(id(anchor.id))
    if (!first?.version || id(first.version.id) !== id(anchor.id)) throw new Error('场景版本响应不完整，请刷新重试')
    const master = { ...scenario, ...first.scenario }
    if (id(master.id) !== id(scenario.id) || (first.version.scenarioId != null && id(first.version.scenarioId) !== id(scenario.id))) throw new Error('场景版本不匹配')
    const currentPublishedId = id(master.currentPublishedVersionId)
    let published = null
    if (currentPublishedId) {
      const publishedRow = versions.find(row => id(row.id) === currentPublishedId && versionStatus(row) === 'PUBLISHED')
      if (!publishedRow) throw new Error('当前发布版本已变化，请刷新重试')
      published = id(first.version.id) === currentPublishedId ? first.version : (await api.fetchScenarioVersion(currentPublishedId)).version
    } else if (latestPublished) {
      throw new Error('服务未返回当前发布版本，暂不能确认生效状态')
    }
    const draft = drafts.length ? first.version : null
    if (draft && versionStatus(draft) !== 'DRAFT') throw new Error('草稿状态已变化，请刷新重试')
    if (published && (versionStatus(published) !== 'PUBLISHED' || id(published.id) !== currentPublishedId || (published.scenarioId != null && id(published.scenarioId) !== id(master.id)))) throw new Error('发布版本响应不匹配')
    for (const version of [draft, published].filter(Boolean)) {
      if (!Array.isArray(version.indicators) || version.resourceVersion == null) throw new Error('场景指标或资源版本缺失，请刷新重试')
      const ids = version.indicators.map(row => id(row.indicatorVersionId))
      if (ids.some(value => !value) || new Set(ids).size !== ids.length) throw new Error('场景指标配置存在重复或缺失值')
    }
    const state = { scenario: master, draft, published }
    return { ...state, status: associationStatus(state, indicatorVersionId) }
  }

  async function catalog(indicatorVersionId) {
    const scenarios = list(await api.fetchAllScenarios()).filter(row => versionStatus(row) !== 'ARCHIVED')
    const output = new Array(scenarios.length)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, scenarios.length) }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= scenarios.length) return
        try { output[index] = await read(scenarios[index], indicatorVersionId) }
        catch (error) { output[index] = { scenario: scenarios[index], error: error.message, status: 'NONE', draft: null, published: null } }
      }
    }))
    return output
  }

  async function change(expected, indicatorVersionId, action, assertCurrent = () => {}) {
    if (!['ADD', 'REMOVE'].includes(action)) throw new Error('未知关联操作')
    assertCurrent()
    const fresh = await read(expected.scenario, indicatorVersionId)
    assertCurrent()
    if (associationSignature(fresh) !== associationSignature(expected)) throw new Error('场景已被其他操作修改，请刷新并重新确认，不会覆盖已有变更')
    const restriction = changeRestriction(fresh, indicatorVersionId, action, canRequest)
    if (restriction) throw new Error(restriction)
    const base = fresh.draft || fresh.published
    if (has(base, indicatorVersionId) === (action === 'ADD')) return { changed: false, versionId: id(base.id) }
    let draft = fresh.draft, created = false
    try {
      if (!draft) {
        assertCurrent()
        const detail = await api.createScenarioVersion(id(fresh.scenario.id), { copyFromVersionId: id(fresh.published.id) }, `scenario-association-${globalThis.crypto.randomUUID()}`)
        draft = detail?.version
        created = true
        if (!draft || versionStatus(draft) !== 'DRAFT' || id(draft.scenarioId) !== id(fresh.scenario.id) || draft.resourceVersion == null || !Array.isArray(draft.indicators)) throw new Error('未取得可编辑的场景草稿，请刷新确认')
        if (JSON.stringify(bindings(draft)) !== JSON.stringify(bindings(fresh.published))) throw new Error('场景草稿内容与确认时不同，请刷新并核对')
      }
      assertCurrent()
      if (!canRequest('PUT', `/scenario-versions/${draft.id}/indicators`)) throw new Error('没有维护此场景变更的权限')
      let indicators
      if (action === 'ADD') {
        indicators = appendScenarioIndicator(draft.indicators, indicatorVersionId)
        const original = fresh.published?.indicators.find(row => id(row.indicatorVersionId) === id(indicatorVersionId))
        // Undoing a pending removal restores its original period, grain and scope.
        if (original) indicators[indicators.length - 1] = { ...bindings({ indicators: [original] })[0], displayOrder: indicators[indicators.length - 1].displayOrder }
      } else {
        indicators = bindings(draft).filter(row => id(row.indicatorVersionId) !== id(indicatorVersionId))
      }
      if (!indicators.length) throw new Error('当前服务暂不支持保存空场景，未提交移除')
      await api.replaceScenarioIndicators(id(draft.id), { resourceVersion: draft.resourceVersion, indicators })
      return { changed: true, versionId: id(draft.id) }
    } catch (error) {
      if (created) throw new Error(`已创建场景草稿，但关联变更尚未确认成功：${error.message}。请刷新核对后重试。`)
      throw error
    }
  }
  return { catalog, read, change }
}
