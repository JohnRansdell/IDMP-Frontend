export const WARNING_WIDGET_STATUSES = Object.freeze(['', 'OPEN', 'ACKNOWLEDGED', 'CLOSED'])
export const WARNING_WIDGET_SEVERITIES = Object.freeze(['', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = value => typeof value === 'string' ? value.trim() : ''
const integer = (value, fallback) => Math.min(20, Math.max(1, Number.isInteger(Number(value)) ? Number(value) : fallback))

export function normalizeWarningWidgetConfig(value = {}) {
  const source = record(value)
  return {
    status: WARNING_WIDGET_STATUSES.includes(source.status) ? source.status : 'OPEN',
    severity: WARNING_WIDGET_SEVERITIES.includes(source.severity) ? source.severity : '',
    indicatorVersionId: text(source.indicatorVersionId),
    ruleId: text(source.ruleId),
    pageSize: integer(source.pageSize, 5),
    showTime: source.showTime !== false,
    showSeverity: source.showSeverity !== false,
    showValue: source.showValue !== false
  }
}

export function createWarningWidgetConfig(value = {}) { return normalizeWarningWidgetConfig(value) }

export function warningWidgetQuery(value = {}) {
  const config = normalizeWarningWidgetConfig(value)
  return {
    ...(config.status ? { status: config.status } : {}),
    ...(config.severity ? { severity: config.severity } : {}),
    ...(config.indicatorVersionId ? { indicatorVersionId: config.indicatorVersionId } : {}),
    ...(config.ruleId ? { ruleId: config.ruleId } : {}),
    page: 1,
    size: config.pageSize
  }
}

function valueText(value) { return value === null || value === undefined || value === '' ? '-' : String(value) }
function eventLevel(severity) {
  return ({ CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'info', INFO: 'info' })[String(severity || '').toUpperCase()] || 'info'
}

// This is intentionally a display adapter only. It never changes event status,
// severity, values, or any other audited warning-event field.
export function warningEventToDashboardItem(event = {}, config = {}) {
  const source = record(event)
  const presentation = normalizeWarningWidgetConfig(config)
  const name = text(source.ruleName) || text(source.warningName) || text(source.name) || text(source.warningType) || '预警事件'
  const detail = presentation.showValue ? `当前值 ${valueText(source.actualValue)} / 阈值 ${valueText(source.thresholdValue)}` : ''
  const severity = presentation.showSeverity ? text(source.severity) : ''
  return {
    id: String(source.id || source.eventId || `${name}-${source.triggerTime || ''}`),
    level: eventLevel(source.severity),
    severity,
    status: text(source.status),
    text: [name, detail].filter(Boolean).join(' · '),
    time: presentation.showTime ? (text(source.triggerTime) || text(source.createdAt) || '-') : ''
  }
}
