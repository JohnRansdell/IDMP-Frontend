export function referenceOptions(records = [], kind) {
  return records.flatMap(item => {
    const id = item.id || item.versionId || item.indicatorVersionId || item.ruleId
    if (id == null) return []
    const name = kind === 'RULE' ? item.name || item.ruleName : kind === 'SCENARIO_VERSION' ? item.scenarioName || item.name : item.indicatorName || item.name
    const version = kind === 'RULE' || item.versionNo == null ? '' : ` · 版本 ${item.versionNo}`
    return [{ value: String(id), label: `${name || '未命名记录'}${version}` }]
  })
}
