export function reportOverview(summary, overview, unavailable = false) {
  if (unavailable) return {}
  if (!summary) return overview || {}
  return { ...summary, numerator: summary.numeratorValue, denominator: summary.denominatorValue }
}

export function reportProvenance(summary, overview = {}) {
  if (summary) return [
    ['正式结果来源 ID', (summary.sourceResultIds || []).join('、') || '-'],
    ['正式快照来源 ID', (summary.sourceSnapshotIds || []).join('、') || '-']
  ]
  return [['正式分析结果 ID', overview.resultId], ['正式分析快照 ID', overview.snapshotId]]
}
