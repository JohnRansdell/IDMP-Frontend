import { GRID_COLUMNS, DEFAULT_WIDGET_STYLE, clonePersistableValue, normalizeGridLayout, normalizeWidgetMetadata } from './schema.js'
import { getWidgetGridConstraints } from './gridLayout.js'
import { applyCardSurface } from './cardSurface.js'
import { applyMetricGroupPreset, createMetricGroupItem } from './metricGroup.js'

export const DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY = 'idmp:dashboard-layout-templates:v1'
export const DASHBOARD_LAYOUT_TEMPLATE_VERSION = 1

const TEMPLATE_WIDGET_FIELDS = ['type', 'chartKind', 'visualType', 'preset', 'title']
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function safeTemplateWidget(widget = {}) {
  const result = {}
  TEMPLATE_WIDGET_FIELDS.forEach((field) => { if (widget[field] !== undefined) result[field] = clonePersistableValue(widget[field]) })
  result.type = widget.type
  result.layout = clonePersistableValue(widget.layout)
  result.config = { style: { ...DEFAULT_WIDGET_STYLE, ...(plain(widget.config?.style) ? clonePersistableValue(widget.config.style) : {}) }, ...(widget.type === 'metric-group' ? { metricGroup: clonePersistableValue(widget.config?.metricGroup || {}) } : {}) }
  return result
}

function templateId() {
  return `layout-template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createLayoutTemplateFromDashboard(schema, { id = templateId(), name = '未命名本地模板', description = '' } = {}) {
  const template = {
    version: DASHBOARD_LAYOUT_TEMPLATE_VERSION,
    id: String(id),
    name: String(name).trim(),
    description: String(description).trim(),
    columns: GRID_COLUMNS,
    widgets: (Array.isArray(schema?.widgets) ? schema.widgets : []).map(safeTemplateWidget)
  }
  const validation = validateLayoutTemplate(template)
  if (!validation.valid) throw new TypeError(`invalid layout template: ${validation.errors.join('; ')}`)
  return clonePersistableValue(template)
}

export function validateLayoutTemplate(template) {
  const errors = []
  if (!plain(template)) return { valid: false, errors: ['template must be a plain object'] }
  if (template.version !== DASHBOARD_LAYOUT_TEMPLATE_VERSION) errors.push(`version must be ${DASHBOARD_LAYOUT_TEMPLATE_VERSION}`)
  if (typeof template.id !== 'string' || !template.id.trim()) errors.push('id is required')
  if (typeof template.name !== 'string' || !template.name.trim()) errors.push('name is required')
  if (template.columns !== GRID_COLUMNS) errors.push(`columns must be ${GRID_COLUMNS}`)
  if (!Array.isArray(template.widgets)) errors.push('widgets must be an array')
  else {
    template.widgets.forEach((widget, index) => {
      const prefix = `widgets[${index}]`
      if (!plain(widget)) { errors.push(`${prefix} must be a plain object`); return }
      const metadata = normalizeWidgetMetadata({ id: `template-${index}`, ...widget, config: { style: widget.config?.style } })
      if (!metadata) errors.push(`${prefix}.type is invalid`)
      const layout = widget.layout
      if (!plain(layout) || !['x', 'y', 'w', 'h'].every(key => Number.isInteger(layout[key]))) { errors.push(`${prefix}.layout must use integer x/y/w/h`); return }
      if (layout.x < 0 || layout.y < 0 || layout.w < 1 || layout.h < 1 || layout.x + layout.w > GRID_COLUMNS) errors.push(`${prefix}.layout is out of bounds`)
      const constraints = getWidgetGridConstraints(metadata || widget)
      if (layout.w < constraints.minW || layout.h < constraints.minH) errors.push(`${prefix}.layout is below minimum size`)
    })
    for (let left = 0; left < template.widgets.length; left += 1) for (let right = left + 1; right < template.widgets.length; right += 1) {
      if (template.widgets[left]?.layout && template.widgets[right]?.layout && overlaps(template.widgets[left].layout, template.widgets[right].layout)) errors.push(`widgets[${left}] overlaps widgets[${right}]`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function instantiateLayoutTemplate(template, { createWidgetId = (index) => `dashboard-widget-${Date.now()}-${index + 1}` } = {}) {
  const validation = validateLayoutTemplate(template)
  if (!validation.valid) throw new TypeError(`invalid layout template: ${validation.errors.join('; ')}`)
  const ids = new Set()
  const widgets = template.widgets.map((item, index) => {
    let id = String(createWidgetId(index) || '').trim()
    if (!id || ids.has(id)) throw new TypeError('template instantiation produced duplicate widget ids')
    ids.add(id)
    const metadata = normalizeWidgetMetadata({
      id, type: item.type, chartKind: item.chartKind, visualType: item.visualType, preset: item.preset, title: item.title,
      config: { style: item.config?.style, ...(item.type === 'metric-group' ? { metricGroup: item.config?.metricGroup || {} } : {}) }
    })
    return { ...metadata, layout: normalizeGridLayout(item.layout, GRID_COLUMNS, item.layout) }
  })
  return clonePersistableValue(widgets)
}

// A layout template is deliberately narrower than a dashboard copy: the existing
// dashboard root (identity, metadata, appearance, filters) remains authoritative.
export function applyLayoutTemplateToDashboard(schema, template, options) {
  if (!plain(schema)) throw new TypeError('dashboard schema must be a plain object')
  return { ...clonePersistableValue(schema), ...(plain(template.appearance) ? { appearance: clonePersistableValue(template.appearance) } : {}), widgets: instantiateLayoutTemplate(template, options) }
}

export function readLocalLayoutTemplates(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.filter(template => validateLayoutTemplate(template).valid).map(template => clonePersistableValue(template)) : []
  } catch { return [] }
}

export function writeLocalLayoutTemplates(templates, storage = globalThis.localStorage) {
  const value = Array.isArray(templates) ? templates.map(template => clonePersistableValue(template)) : []
  const invalid = value.find(template => !validateLayoutTemplate(template).valid)
  if (invalid) throw new TypeError('cannot store an invalid layout template')
  storage?.setItem(DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY, JSON.stringify(value))
  return value
}

export function saveLocalLayoutTemplate(template, storage = globalThis.localStorage) {
  const templates = readLocalLayoutTemplates(storage).filter(item => item.id !== template.id)
  const next = [...templates, clonePersistableValue(template)]
  return writeLocalLayoutTemplates(next, storage)
}

export function deleteLocalLayoutTemplate(templateId, storage = globalThis.localStorage) {
  return writeLocalLayoutTemplates(readLocalLayoutTemplates(storage).filter(template => template.id !== templateId), storage)
}

const style = (surface = 'standard', palettePreset = 'medicalBlue') => ({ ...applyCardSurface(DEFAULT_WIDGET_STYLE, surface), borderRadius: 10, palettePreset })
const design = (id, name, description, tone, tags, appearance, detail, widgets) => ({ version: 1, id, name, description, category: '设计模板', tags, visualTone: tone, density: detail.density, detail, recommendedUse: description, previewPalette: [appearance.background?.assetKey === 'deep-blue' ? '#0f3158' : '#f7fbff', '#1261a6', '#4f8583', '#d8e2e7'], appearance, columns: 24, widgets })
const kpi = (x, y, title, surface, palette) => ({ type: 'kpi', title, visualType: 'kpi', config: { style: style(surface, palette) }, layout: { x, y, w: 6, h: 3 } })
const chart = (kind, x, y, w, h, title, surface, palette) => ({ type: 'chart', chartKind: kind, visualType: kind, title, config: { style: style(surface, palette) }, layout: { x, y, w, h } })
const group = (x, y, w, h, surface, palette, preset, count, title = '核心指标') => {
  const items = Array.from({ length: count }, (_, index) => ({ ...createMetricGroupItem({}, index), label: `核心指标 ${index + 1}` }))
  return { type: 'metric-group', title, config: { style: style(surface, palette), metricGroup: applyMetricGroupPreset({ title, items }, preset) }, layout: { x, y, w, h } }
}
const text = (x, y, w, h, title, body, surface, palette) => ({ type: 'text', title, config: { style: style(surface, palette), text: { title, body } }, layout: { x, y, w, h } })
const ranking = (x, y, w, h, title, surface, palette) => ({ type: 'ranking', title, config: { style: style(surface, palette) }, layout: { x, y, w, h } })

export const BUILT_IN_LAYOUT_TEMPLATES = Object.freeze([
  design('builtin-executive-brief', '高管简报', '管理汇报 · Light · 低密度', 'Light', ['Light', '低密度'], { background: { type: 'color', value: '#f4f7f9' } }, { density: '低密度', useCase: '管理层周报、月报与结论汇报', layout: 'Hero 摘要、主趋势与少量辅助分析', visual: '大留白、弱阴影、浅色阅读面', components: '指标组、主趋势、结构、明细' }, [text(0, 0, 24, 2, '管理摘要', '聚焦本期结论与管理动作。', 'standard', 'medicalBlue'), group(0, 3, 24, 6, 'standard', 'medicalBlue', 'hero-secondary', 4, '核心摘要'), chart('line', 0, 10, 16, 9, '主趋势', 'standard', 'medicalBlue'), chart('pie', 16, 10, 8, 9, '结构分析', 'standard', 'medicalBlue'), chart('table', 0, 20, 24, 5, '关键明细', 'standard', 'medicalBlue')]),
  design('builtin-clinical-command', '临床指挥舱', '实时监控 · Dark · Glass', 'Dark', ['Dark', 'Glass', '监控'], { background: { type: 'image', assetKey: 'deep-blue', value: '#0f3158' } }, { density: '中高密度', useCase: '核心指标与风险状态监测', layout: '风险指标组、不对称主监控区与辅助分析', visual: '深蓝背景、Glass 表面、高对比图表', components: '风险指标组、趋势、风险结构、排名、辅助分析' }, [group(0, 0, 24, 5, 'glass', 'blueTeal', 'risk-monitor', 5, '风险与核心指标'), chart('line', 0, 6, 15, 8, '实时监控趋势', 'glass', 'blueTeal'), chart('pie', 15, 6, 9, 8, '风险结构', 'glass', 'blueTeal'), ranking(15, 15, 9, 6, '风险排名', 'glass', 'blueTeal'), chart('bar', 0, 15, 8, 6, '次趋势', 'glass', 'blueTeal'), chart('bar', 8, 15, 7, 6, '辅助分析', 'glass', 'blueTeal'), chart('table', 0, 22, 24, 5, '监测明细', 'translucent', 'blueTeal')]),
  design('builtin-operations-analysis', '运营分析', '运营管理 · Light · 高密度', 'Light', ['Light', '高密度', '分析'], { background: { type: 'color', value: '#edf7f8' } }, { density: '高密度', useCase: '日常运营管理与数据分析', layout: '顶部 KPI Strip、多图对比与完整明细区域', visual: '紧凑蓝青分析面、低留白', components: '指标带、主趋势、排名、结构、比较、明细' }, [group(0, 0, 24, 4, 'standard', 'blueTeal', 'metric-strip', 6, '运营指标带'), chart('line', 0, 5, 12, 6, '主趋势分析', 'standard', 'blueTeal'), ranking(12, 5, 6, 6, '运营排名', 'standard', 'blueTeal'), chart('pie', 18, 5, 6, 6, '结构分析', 'standard', 'blueTeal'), chart('bar', 0, 12, 8, 6, '部门比较', 'standard', 'blueTeal'), chart('bar', 8, 12, 8, 6, '目标达成', 'standard', 'blueTeal'), chart('pie', 16, 12, 8, 6, '构成对比', 'standard', 'blueTeal'), chart('table', 0, 19, 24, 5, '运营明细', 'standard', 'blueTeal'), chart('bar', 0, 25, 24, 5, '补充分析', 'standard', 'blueTeal')]),
  design('builtin-minimal-insight', '极简洞察', '主题洞察 · Minimal', 'Light', ['Minimal', '低密度'], { background: { type: 'color', value: '#fbfcfd' } }, { density: '极低密度', useCase: '单主题分析与重点汇报', layout: '极简数字、单一主图与一句洞察', visual: '大数字、大留白、弱卡片边界', components: '文字洞察、极简指标组、主图' }, [text(0, 0, 24, 4, '关键洞察', '用一条结论讲清一个主题。', 'standard', 'medicalBlue'), group(0, 5, 8, 9, 'standard', 'medicalBlue', 'minimal', 3, '核心数字'), chart('line', 10, 5, 14, 12, '单一主分析', 'standard', 'medicalBlue'), text(0, 18, 24, 5, '解读', '保留空间，让数据与结论成为唯一重点。', 'standard', 'medicalBlue')]),
  design('builtin-glass-medical', '玻璃医疗', '视觉展示 · Glass', 'Glass', ['Glass', '展示'], { background: { type: 'image', assetKey: 'clinical-blue', value: '#eaf5ff' } }, { density: '中密度', useCase: '展示型医疗数据看板', layout: '左主右辅指标组与非对称主分析', visual: '临床浅蓝、正式 Glass、柔和层次', components: '标题、左主右辅指标组、趋势、结构、辅助分析' }, [text(0, 0, 24, 2, '医疗数据概览', '柔和蓝青视觉层次。', 'glass', 'blueTeal'), group(0, 3, 11, 8, 'glass', 'blueTeal', 'left-hero-right-grid', 5, '核心指标'), chart('line', 12, 3, 12, 8, '主分析趋势', 'glass', 'blueTeal'), chart('pie', 0, 12, 8, 7, '结构分析', 'glass', 'blueTeal'), chart('bar', 8, 12, 16, 7, '辅助分析', 'glass', 'blueTeal'), chart('line', 0, 20, 12, 5, '次趋势', 'glass', 'blueTeal'), text(12, 20, 12, 5, '关键说明', '面向展示的柔和医疗信息层级。', 'glass', 'blueTeal')]),
  design('builtin-dark-cockpit', '深色驾驶舱', '大屏展示 · Dark', 'Dark', ['Dark', '大屏'], { background: { type: 'image', assetKey: 'deep-blue', value: '#0f3158' } }, { density: '中密度', useCase: '综合大屏与夜间展示', layout: '顶部指标带、三列对称分析、中央主图', visual: '深蓝全屏、透明表面、对称构图', components: '指标带、左右分析、中央主图、底部分析' }, [group(0, 0, 24, 4, 'transparent', 'colorful', 'metric-strip', 6, '监控指标带'), chart('bar', 0, 5, 6, 10, '左侧分析', 'transparent', 'colorful'), chart('line', 6, 5, 12, 10, '中央主趋势', 'transparent', 'colorful'), chart('pie', 18, 5, 6, 10, '右侧结构', 'transparent', 'colorful'), chart('bar', 0, 16, 12, 6, '底部比较', 'transparent', 'colorful'), chart('table', 12, 16, 12, 6, '底部明细', 'translucent', 'colorful'), chart('line', 0, 23, 24, 5, '综合分析', 'transparent', 'colorful')]),
  { version: 1, id: 'builtin-hospital-overview', name: '全院概览', description: '4 个关键指标、趋势、排名与构成。', columns: 24, widgets: [
    ...[0, 6, 12, 18].map((x, index) => ({ type: 'kpi', title: `关键指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'line', visualType: 'line', title: '质量趋势', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '科室排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'chart', chartKind: 'pie', visualType: 'pie', title: '指标构成', config: { style: {} }, layout: { x: 0, y: 11, w: 12, h: 8 } }
  ] },
  { version: 1, id: 'builtin-topic-analysis', name: '专题分析', description: '专题指标、比较、排名与明细。', columns: 24, widgets: [
    ...[0, 6].map((x, index) => ({ type: 'kpi', title: `专题指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'bar', visualType: 'bar', title: '专题比较', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '专题排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'chart', chartKind: 'table', visualType: 'table', title: '专题明细', config: { style: {} }, layout: { x: 0, y: 11, w: 24, h: 8 } }
  ] },
  { version: 1, id: 'builtin-department-overview', name: '科室概览', description: '4 个科室指标、趋势、排名与预警。', columns: 24, widgets: [
    ...[0, 6, 12, 18].map((x, index) => ({ type: 'kpi', title: `科室指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'line', visualType: 'line', title: '科室趋势', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '科室排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'warnings', title: '预警事项', config: { style: {} }, layout: { x: 14, y: 10, w: 10, h: 7 } }
  ] }
].slice(0, 6))
