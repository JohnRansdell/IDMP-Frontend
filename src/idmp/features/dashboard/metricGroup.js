import { clonePersistableValue } from './schema.js'

export const METRIC_GROUP_COLUMNS = Object.freeze(['auto', '2', '3', '4'])
export const METRIC_ITEM_SPANS = Object.freeze([1, 2])
export const METRIC_ITEM_EMPHASIS = Object.freeze(['normal', 'emphasis', 'hero'])
export const METRIC_ITEM_ALIGNMENTS = Object.freeze(['left', 'center'])
export const METRIC_GROUP_ITEM_APPEARANCES = Object.freeze(['flat', 'divider', 'tile'])

export const METRIC_GROUP_PRESETS = Object.freeze([
  { id: 'uniform', name: '均匀指标', description: '平级指标的通用网格', thumbnail: 'uniform' },
  { id: 'hero-secondary', name: '主指标 + 次指标', description: '突出首项，保留次级指标层次', thumbnail: 'hero-secondary' },
  { id: 'metric-strip', name: '横向指标带', description: '适合看板顶部的紧凑 KPI 带', thumbnail: 'metric-strip' },
  { id: 'left-hero-right-grid', name: '左主右辅', description: '左侧主指标，右侧紧凑指标矩阵', thumbnail: 'left-hero-right-grid' },
  { id: 'minimal', name: '极简数字', description: '弱化边界，突出数字与留白', thumbnail: 'minimal' },
  { id: 'risk-monitor', name: '风险监控', description: '突出重点风险与状态指标', thumbnail: 'risk-monitor' }
])

const plain = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = value => typeof value === 'string' ? value : ''
let metricItemSequence = 0

function nextMetricItemId(index) {
  metricItemSequence += 1
  return `metric-item-${Date.now()}-${index + 1}-${metricItemSequence}`
}

export function createMetricGroupItem(source = {}, index = 0) {
  return {
    id: nextMetricItemId(index),
    label: text(source.name) || `指标 ${index + 1}`,
    sourceCode: text(source.code), sourceName: text(source.name),
    unit: text(source.unit), dataBinding: null,
    layout: { span: 1 }, emphasis: 'normal', align: 'left'
  }
}

export function createMetricGroupConfig(sources = []) {
  return {
    title: '指标组', subtitle: '',
    items: Array.from({ length: 4 }, (_, index) => createMetricGroupItem(sources[index] || {}, index)),
    layout: { columns: 'auto', gap: 12 }, itemAppearance: 'tile'
  }
}

export function normalizeMetricGroupConfig(value = {}) {
  const source = plain(value)
  const ids = new Set()
  const items = (Array.isArray(source.items) ? source.items : []).map((item, index) => {
    const raw = plain(item)
    let id = text(raw.id) || `metric-item-${index + 1}`
    while (ids.has(id)) id = `${id}-${index + 1}`
    ids.add(id)
    return {
      id, label: text(raw.label) || `指标 ${index + 1}`,
      sourceCode: text(raw.sourceCode), sourceName: text(raw.sourceName), unit: text(raw.unit),
      ...(plain(raw.dataBinding) && Object.keys(plain(raw.dataBinding)).length ? { dataBinding: clonePersistableValue(raw.dataBinding) } : {}),
      layout: { span: METRIC_ITEM_SPANS.includes(Number(plain(raw.layout).span)) ? Number(plain(raw.layout).span) : 1 },
      emphasis: METRIC_ITEM_EMPHASIS.includes(raw.emphasis) ? raw.emphasis : 'normal',
      align: METRIC_ITEM_ALIGNMENTS.includes(raw.align) ? raw.align : 'left'
    }
  })
  const layout = plain(source.layout)
  return {
    title: text(source.title) || '指标组', subtitle: text(source.subtitle), items,
    layout: { columns: METRIC_GROUP_COLUMNS.includes(String(layout.columns)) ? String(layout.columns) : 'auto', gap: Math.max(0, Math.min(32, Number.isFinite(Number(layout.gap)) ? Number(layout.gap) : 12)) },
    itemAppearance: METRIC_GROUP_ITEM_APPEARANCES.includes(source.itemAppearance) ? source.itemAppearance : 'tile'
  }
}

export function applyMetricGroupPreset(config = {}, presetId) {
  const normalized = normalizeMetricGroupConfig(config)
  const preset = METRIC_GROUP_PRESETS.find(item => item.id === presetId)
  if (!preset) return normalized
  const rules = {
    uniform: { columns: 'auto', gap: 12, itemAppearance: 'tile', item: () => ({ span: 1, emphasis: 'normal', align: 'left' }) },
    'hero-secondary': { columns: '3', gap: 12, itemAppearance: 'tile', item: index => index === 0 ? { span: 2, emphasis: 'hero', align: 'left' } : { span: 1, emphasis: index < 3 ? 'emphasis' : 'normal', align: 'left' } },
    'metric-strip': { columns: '4', gap: 8, itemAppearance: 'divider', item: () => ({ span: 1, emphasis: 'normal', align: 'center' }) },
    'left-hero-right-grid': { columns: '4', gap: 10, itemAppearance: 'tile', item: index => index === 0 ? { span: 2, emphasis: 'hero', align: 'left' } : { span: 1, emphasis: 'normal', align: 'center' } },
    minimal: { columns: normalized.items.length > 4 ? '3' : '2', gap: 18, itemAppearance: 'flat', item: () => ({ span: 1, emphasis: 'emphasis', align: 'left' }) },
    'risk-monitor': { columns: '3', gap: 12, itemAppearance: 'tile', item: index => index === 0 ? { span: 2, emphasis: 'hero', align: 'left' } : { span: 1, emphasis: index === 1 ? 'emphasis' : 'normal', align: 'left' } }
  }
  const rule = rules[preset.id]
  return {
    ...normalized,
    layout: { columns: rule.columns, gap: rule.gap },
    itemAppearance: rule.itemAppearance,
    items: normalized.items.map((item, index) => {
      const presentation = rule.item(index)
      return { ...item, layout: { span: presentation.span }, emphasis: presentation.emphasis, align: presentation.align }
    })
  }
}

export function metricGroupItemWidget(group, item) {
  return {
    id: `${group.id}::${item.id}`, type: 'kpi', title: item.label,
    sourceCode: item.sourceCode, sourceName: item.sourceName,
    config: { ...(item.dataBinding ? { dataBinding: item.dataBinding } : {}), query: plain(group.config?.query) }
  }
}

export function metricGroupSourceCodes(widget = {}) {
  return normalizeMetricGroupConfig(widget.config?.metricGroup).items.map(item => item.sourceCode).filter(Boolean)
}

export function addMetricGroupItem(config = {}, source = {}) {
  const normalized = normalizeMetricGroupConfig(config)
  const item = createMetricGroupItem(source, normalized.items.length)
  return { config: { ...normalized, items: [...normalized.items, item] }, item }
}

export function duplicateMetricGroupItem(config = {}, itemId) {
  const normalized = normalizeMetricGroupConfig(config)
  const index = normalized.items.findIndex(item => item.id === itemId)
  if (index < 0) return { config: normalized, item: null }
  const source = clonePersistableValue(normalized.items[index])
  const item = { ...source, id: nextMetricItemId(index), label: `${source.label} 副本` }
  const items = [...normalized.items]
  items.splice(index + 1, 0, item)
  return { config: { ...normalized, items }, item }
}

export function removeMetricGroupItem(config = {}, itemId) {
  const normalized = normalizeMetricGroupConfig(config)
  const index = normalized.items.findIndex(item => item.id === itemId)
  if (index < 0) return { config: normalized, selectedId: '' }
  const items = normalized.items.filter(item => item.id !== itemId)
  return { config: { ...normalized, items }, selectedId: items[Math.min(index, items.length - 1)]?.id || '' }
}

export function moveMetricGroupItem(config = {}, itemId, offset) {
  const normalized = normalizeMetricGroupConfig(config)
  const index = normalized.items.findIndex(item => item.id === itemId)
  const nextIndex = index + Number(offset)
  if (index < 0 || !Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= normalized.items.length) return normalized
  const items = [...normalized.items]
  ;[items[index], items[nextIndex]] = [items[nextIndex], items[index]]
  return { ...normalized, items }
}

export function reorderMetricGroupItem(config = {}, itemId, targetId) {
  const normalized = normalizeMetricGroupConfig(config)
  const from = normalized.items.findIndex(item => item.id === itemId)
  const to = normalized.items.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return normalized
  const items = [...normalized.items]
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
  return { ...normalized, items }
}
