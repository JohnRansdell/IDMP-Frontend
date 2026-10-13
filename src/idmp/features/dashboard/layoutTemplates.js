import { GRID_COLUMNS, DEFAULT_WIDGET_STYLE, clonePersistableValue, normalizeGridLayout, normalizeWidgetMetadata } from './schema.js'
import { getWidgetGridConstraints } from './gridLayout.js'
import { applyCardSurface } from './cardSurface.js'
import { applyMetricGroupPreset } from './metricGroup.js'

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
  result.config = {
    style: { ...DEFAULT_WIDGET_STYLE, ...(plain(widget.config?.style) ? clonePersistableValue(widget.config.style) : {}) },
    ...(['metric-group', 'ranking'].includes(widget.type) ? { metricGroup: clonePersistableValue(widget.config?.metricGroup || {}), ...(widget.config?.ranking ? { ranking: clonePersistableValue(widget.config.ranking) } : {}) } : {}),
    ...(plain(widget.config?.templateSlot) ? { templateSlot: clonePersistableValue(widget.config.templateSlot) } : {}),
    ...(widget.type === 'text' ? { text: clonePersistableValue(widget.config?.text || {}) } : {}),
    // Warning filters and display options belong to the reusable component
    // definition. The actual warning events remain server-owned.
    ...(widget.type === 'warnings' ? { warning: clonePersistableValue(widget.config?.warning || {}) } : {})
  }
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
      config: {
        style: item.config?.style,
        ...(item.config?.templateSlot ? { templateSlot: item.config.templateSlot } : {}),
        ...(item.type === 'text' ? { text: item.config?.text || {} } : {}),
        ...(['metric-group', 'ranking'].includes(item.type) ? { metricGroup: item.config?.metricGroup || {}, ...(item.config?.ranking ? { ranking: item.config.ranking } : {}) } : {}),
        ...(item.type === 'warnings' ? { warning: item.config?.warning || {} } : {})
      }
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

// Built-in templates deliberately use overview and period results only.
// Classification, targets, scenarios and multi-indicator ranking are opt-in
// components from the library, because their extra data cannot be inferred.
const style = (surface = 'standard', palettePreset = 'medicalBlue') => ({ ...applyCardSurface(DEFAULT_WIDGET_STYLE, surface), borderRadius: 10, palettePreset })
const design = (id, name, description, tone, tags, appearance, detail, widgets) => ({ version: 1, id, name, description, category: '设计模板', tags, visualTone: tone, density: detail.density, detail, recommendedUse: description, previewPalette: [appearance.background?.assetKey === 'deep-blue' ? '#0f3158' : '#f7fbff', '#1261a6', '#4f8583', '#d8e2e7'], appearance, columns: 24, widgets })
const kpi = (x, y, title, surface, palette, w = 6, h = 3) => ({ type: 'kpi', title, visualType: 'kpi', config: { style: style(surface, palette), templateSlot: { binding: 'overview', title } }, layout: { x, y, w, h } })
const chart = (kind, x, y, w, h, title, surface, palette) => ({ type: 'chart', chartKind: kind, visualType: kind, title, config: { style: style(surface, palette), templateSlot: { binding: 'period', visualType: kind, title } }, layout: { x, y, w, h } })
const group = (x, y, w, h, surface, palette, preset, title = '核心指标') => {
  const metricGroup = applyMetricGroupPreset({ title, items: [] }, preset)
  return { type: 'metric-group', title, config: { style: style(surface, palette), metricGroup: { ...metricGroup, layout: { ...metricGroup.layout, columns: 'auto' } } }, layout: { x, y, w, h } }
}
const text = (x, y, w, h, title, body, surface, palette) => ({ type: 'text', title, config: { style: style(surface, palette), text: { title, body } }, layout: { x, y, w, h } })
const warnings = (x, y, w, h, title, surface, palette) => ({ type: 'warnings', title, config: { style: style(surface, palette) }, layout: { x, y, w, h } })

// Presentation changes use the same single-indicator data contract.
const look = (widget, overrides) => ({ ...widget, config: { ...widget.config, style: { ...widget.config.style, ...overrides, kpi: { ...widget.config.style.kpi, ...overrides.kpi }, text: { ...widget.config.style.text, ...overrides.text }, table: { ...widget.config.style.table, ...overrides.table } } } })
const hero = widget => look(widget, { kpiVariant: 'hero' })
const horizontal = widget => look(widget, { kpiVariant: 'horizontal' })
const minimal = widget => {
  const result = look(widget, { borderWidth: 0, shadow: 'none', background: 'transparent', kpiVariant: 'minimal' })
  return widget.type === 'text' ? { ...result, config: { ...result.config, text: { ...result.config.text, align: 'center' } } } : result
}
const dark = widget => look(widget, { kpi: { valueColor: '#8ee4fa', titleColor: '#e3f3ff', trendColor: '#bed5e5' }, text: { titleColor: '#e3f3ff', bodyColor: '#bed5e5' }, table: { headerBackground: '#173c58' } })
const mint = widget => look(widget, { kpi: { valueColor: '#0b9290', titleColor: '#315b5b', trendColor: '#607e7e' }, table: { headerBackground: '#e9f6f4' } })
const compactTable = widget => look(widget, { table: { compact: true, zebra: true, headerBackground: '#eaf4f5' } })
const boardDetail = (density, layout, visual, components, useCase) => ({ density, layout, visual, components, useCase })

export const BUILT_IN_LAYOUT_TEMPLATES = Object.freeze([
  design('builtin-quality-overview', '全院质量总览', '全院总览 · 左侧指标与预警，右侧趋势与结果', 'Mint', ['总览', '侧栏', '推荐'], { theme: 'mint-medical', background: { type: 'color', value: '#eaf8f6', intensity: 100 } }, boardDetail('中密度', '左侧纵向指标组与预警，右侧宽趋势和期间结果表', '浅青页面、白色卡片、青色指标', '说明、指标组、预警、趋势、期间结果表', '集中查看全院指标与需要关注的预警'), [
    text(0, 0, 24, 2, '质量指标概览', '查看正式指标结果与预警事件。', 'standard', 'blueTeal'),
    mint(group(0, 3, 8, 7, 'standard', 'blueTeal', 'uniform', '核心指标')),
    mint(warnings(0, 11, 8, 8, '预警事件', 'standard', 'blueTeal')),
    mint(chart('line', 8, 3, 16, 10, '指标趋势', 'standard', 'blueTeal')),
    mint(chart('table', 8, 14, 16, 5, '期间结果', 'standard', 'blueTeal'))
  ]),
  design('builtin-executive-brief', '高管简报', '管理汇报 · 大指标、结论说明和横向趋势', 'Light', ['汇报', '大指标', '低密度'], { background: { type: 'color', value: '#f5f1ea' } }, boardDetail('低密度', '左侧大指标，右侧结论和辅助指标，底部横向趋势', '暖白页面、浅橙重点卡片、较大留白', '重点指标卡、辅助指标卡、说明、趋势', '管理层月报与重点指标汇报'), [
    look(hero(kpi(0, 0, '重点指标', 'standard', 'warm', 8, 8)), { background: '#fff3e6', borderColor: '#ead1b7', kpi: { valueColor: '#a15a34', titleColor: '#715848' } }),
    look(text(8, 0, 16, 3, '本期结论', '在此填写本期结论与需要跟进的事项。', 'standard', 'warm'), { background: '#fffdf8', text: { titleColor: '#715848', bodyColor: '#796b5f' } }),
    horizontal(kpi(8, 4, '辅助指标 1', 'standard', 'warm', 8, 4)), horizontal(kpi(16, 4, '辅助指标 2', 'standard', 'warm', 8, 4)),
    chart('line', 0, 9, 24, 8, '指标趋势', 'standard', 'warm'),
    minimal(text(0, 18, 24, 3, '解读与行动', '填写指标变化的业务解读与后续行动。', 'standard', 'warm'))
  ]),
  design('builtin-clinical-command', '临床监测', '预警优先 · 左侧事件列表与右侧监测区', 'Dark', ['预警', '监测', 'Dark'], { background: { type: 'image', assetKey: 'deep-blue', value: '#0f3158' } }, boardDetail('中密度', '左侧高预警栏，右侧指标带和主趋势', '深蓝背景、玻璃面板、青白文字', '说明、真实预警、指标组、趋势', '预警跟进与核心指标的日常监测'), [
    dark(text(0, 0, 24, 2, '临床指标监测', '关注真实预警与正式指标的期间变化。', 'transparent', 'blueTeal')),
    dark(warnings(0, 3, 8, 16, '预警事件', 'glass', 'blueTeal')),
    dark(group(8, 3, 16, 4, 'glass', 'blueTeal', 'metric-strip', '监测指标')),
    dark(chart('line', 8, 8, 16, 11, '指标趋势', 'glass', 'blueTeal'))
  ]),
  design('builtin-operations-analysis', '运营分析', '结果表优先 · 左侧明细阅读与右侧趋势', 'Light', ['运营', '结果表', '紧凑'], { background: { type: 'color', value: '#edf5f6' } }, boardDetail('较高密度', '顶部指标带，左侧大结果表，右侧趋势和当前值', '紧凑蓝青配色、斑马结果表与弱阴影', '指标组、期间结果表、趋势、指标卡', '频繁阅读期间结果和指标变化的运营分析'), [
    mint(group(0, 0, 24, 4, 'standard', 'blueTeal', 'metric-strip', '运营指标带')),
    compactTable(chart('table', 0, 5, 15, 12, '期间结果', 'standard', 'blueTeal')),
    chart('line', 15, 5, 9, 7, '指标趋势', 'standard', 'blueTeal'),
    look(kpi(15, 13, '当前指标', 'standard', 'blueTeal', 9, 4), { kpiVariant: 'trend', kpi: { valueColor: '#187f91' } })
  ]),
  design('builtin-minimal-insight', '极简洞察', '居中大数字 · 轻量趋势与一句说明', 'Light', ['居中', '极简', '低密度'], { background: { type: 'color', value: '#ffffff' } }, boardDetail('极低密度', '居中大指标，下方窄幅趋势，底部一句解读', '无卡片边界、居中排版、充足留白', '说明、极简指标卡、趋势', '单一主题洞察或一项重点指标的分享'), [
    minimal(text(0, 0, 24, 3, '关键洞察', '在此填写一句主题说明。', 'standard', 'medicalBlue')),
    minimal(kpi(0, 4, '重点指标', 'standard', 'medicalBlue', 24, 6)),
    minimal(chart('line', 3, 11, 18, 8, '指标趋势', 'standard', 'medicalBlue')),
    minimal(text(0, 20, 24, 2, '指标解读', '填写一句简短解读。', 'standard', 'medicalBlue'))
  ]),
  design('builtin-glass-medical', '玻璃医疗', '浅蓝玻璃 · 左主右辅的非对称构图', 'Glass', ['Glass', '非对称', '展示'], { background: { type: 'image', assetKey: 'clinical-blue', value: '#eaf5ff' } }, boardDetail('中密度', '左侧大指标，右侧趋势，下方指标组与短结果表', '浅蓝玻璃层次、非对称主次比例', '重点指标卡、趋势、指标组、说明、期间结果表', '展示型医疗指标概览'), [
    look(hero(kpi(0, 0, '重点指标', 'glass', 'blueTeal', 10, 8)), { kpi: { valueColor: '#12616d', titleColor: '#45656c' }, borderRadius: 16 }),
    chart('line', 11, 0, 13, 8, '指标趋势', 'glass', 'blueTeal'),
    group(0, 9, 24, 4, 'glass', 'blueTeal', 'uniform', '辅助指标'),
    text(0, 14, 6, 5, '业务说明', '填写指标口径与使用说明。', 'glass', 'blueTeal'),
    chart('table', 7, 14, 17, 5, '期间结果', 'glass', 'blueTeal')
  ]),
  design('builtin-dark-cockpit', '深色驾驶舱', '中央主图 · 两侧指标与底部结果带', 'Dark', ['Dark', '中央主图', '大屏'], { background: { type: 'image', assetKey: 'deep-blue', value: '#0f3158' } }, boardDetail('中密度', '顶部指标带、中央大趋势、左右指标列、底部结果表', '深蓝背景、透明面板、青色大数字', '指标组、指标卡、主趋势、说明、期间结果表', '需要远距离阅读的大屏展示'), [
    dark(group(0, 0, 24, 4, 'transparent', 'blueTeal', 'metric-strip', '核心指标')),
    dark(hero(kpi(0, 5, '重点指标 1', 'transparent', 'blueTeal', 6, 6))),
    dark(kpi(0, 12, '重点指标 2', 'transparent', 'blueTeal', 6, 5)),
    dark(chart('line', 6, 5, 12, 12, '主指标趋势', 'transparent', 'blueTeal')),
    dark(hero(kpi(18, 5, '重点指标 3', 'transparent', 'blueTeal', 6, 6))),
    dark(text(18, 12, 6, 5, '指标说明', '填写重点指标的口径说明。', 'transparent', 'blueTeal')),
    dark(chart('table', 0, 18, 24, 5, '期间结果', 'transparent', 'blueTeal'))
  ]),
  design('builtin-hospital-overview', '全院概览', '均衡总览 · 四张指标卡与右侧趋势', 'Light', ['四指标', '均衡', '总览'], { background: { type: 'color', value: '#f3f7fb' } }, boardDetail('中密度', '左侧两行四张指标卡，右侧趋势，底部结果表和预警', '蓝白页面、均匀卡片网格', '指标卡、趋势、期间结果表、真实预警', '同时查看少量核心指标的全院概览'), [
    kpi(0, 0, '关键指标 1', 'standard', 'medicalBlue'), kpi(6, 0, '关键指标 2', 'standard', 'medicalBlue'),
    kpi(0, 4, '关键指标 3', 'standard', 'medicalBlue'), kpi(6, 4, '关键指标 4', 'standard', 'medicalBlue'),
    chart('line', 12, 0, 12, 7, '指标趋势', 'standard', 'medicalBlue'),
    chart('table', 0, 8, 16, 7, '期间结果', 'standard', 'medicalBlue'), warnings(16, 8, 8, 7, '预警事件', 'standard', 'medicalBlue')
  ]),
  design('builtin-performance-assessment', '绩效指标监测', '指标阅读 · 右侧大表与底部长趋势', 'Light', ['绩效', '大结果表', '阅读'], { background: { type: 'color', value: '#f1f6f2' } }, boardDetail('中密度', '左侧重点指标与辅助指标，右侧大结果表，底部趋势', '柔和绿白配色、清晰结果阅读区', '指标卡、期间结果表、趋势', '查看绩效指标的正式结果与期间变化'), [
    look(hero(kpi(0, 0, '重点绩效指标', 'standard', 'green', 8, 6)), { background: '#eff8f1', kpi: { valueColor: '#357b62', titleColor: '#426650' } }),
    horizontal(kpi(0, 7, '辅助绩效指标', 'standard', 'green', 8, 4)),
    look(chart('table', 8, 0, 16, 11, '期间结果', 'standard', 'green'), { table: { zebra: true, headerBackground: '#e9f3eb' } }),
    chart('line', 0, 12, 24, 7, '指标趋势', 'standard', 'green')
  ]),
  design('builtin-topic-analysis', '医疗质量专题', '专题解读 · 重点指标与并列时间趋势', 'Light', ['专题', '双趋势', '解读'], { background: { type: 'color', value: '#f5f3fa' } }, boardDetail('中密度', '左上重点指标与右上专题说明，下方并列趋势和结果表', '柔和紫白配色、并列分析区', '重点指标卡、说明、两张趋势、期间结果表', '围绕一个主题分别阅读重点指标与参考指标'), [
    look(hero(kpi(0, 0, '专题重点指标', 'standard', 'colorful', 6, 5)), { background: '#f1edfb', kpi: { valueColor: '#65548c', titleColor: '#6c6480' } }),
    look(text(6, 0, 18, 5, '专题说明', '填写主题、指标口径与业务解读。', 'standard', 'colorful'), { text: { titleColor: '#65548c', bodyColor: '#6c6480' } }),
    chart('line', 0, 6, 12, 8, '重点指标趋势', 'standard', 'medicalBlue'), chart('line', 12, 6, 12, 8, '参考指标趋势', 'standard', 'green'),
    chart('table', 0, 15, 24, 5, '期间结果', 'standard', 'colorful')
  ]),
  design('builtin-department-overview', '科室指标监测', '轻量监测 · 横排指标、趋势和预警', 'Mint', ['科室', '横排指标', '监测'], { background: { type: 'color', value: '#f1f9f8' } }, boardDetail('低密度', '顶部两张横向指标卡，左侧趋势、右侧预警，底部范围说明', '浅青配色、轻量横向指标', '横向指标卡、趋势、真实预警、说明', '指定科室或组织范围内的日常指标监测'), [
    mint(horizontal(kpi(0, 0, '科室指标 1', 'standard', 'blueTeal', 12, 4))), mint(horizontal(kpi(12, 0, '科室指标 2', 'standard', 'blueTeal', 12, 4))),
    mint(chart('line', 0, 5, 14, 8, '指标趋势', 'standard', 'blueTeal')), mint(warnings(14, 5, 10, 8, '预警事件', 'standard', 'blueTeal')),
    minimal(text(0, 14, 24, 2, '统计范围说明', '通过看板筛选或组件查询范围设置科室；请在此填写范围说明。', 'standard', 'blueTeal'))
  ])
])
