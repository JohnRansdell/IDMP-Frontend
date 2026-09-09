import { requestJson } from '@/idmp/api/request'
import { serializeWarningRulePayload } from '@/idmp/api/adapters/warning'

export function fetchWarningRules(params = {}) {
  return requestJson(withQuery('/analysis/warning-rules', params))
}

export function fetchWarningRule(ruleId) {
  return requestJson(`/analysis/warning-rules/${encodeURIComponent(ruleId)}`)
}

export function createWarningRule(payload) {
  return requestJson('/analysis/warning-rules', { method: 'POST', body: serializeWarningRulePayload(payload) })
}

export function updateWarningRuleVersion(versionId, payload) {
  return requestJson(`/analysis/warning-rule-versions/${encodeURIComponent(versionId)}`, {
    method: 'PATCH', body: serializeWarningRulePayload(payload)
  })
}

export function publishWarningRuleVersion(versionId, resourceVersion) {
  return requestJson(`/analysis/warning-rule-versions/${encodeURIComponent(versionId)}/publish`, {
    method: 'POST', body: JSON.stringify({ resourceVersion })
  })
}

export function enableWarningRule(ruleId, resourceVersion) {
  return warningRuleAction(ruleId, 'enable', { resourceVersion })
}

export function disableWarningRule(ruleId, resourceVersion) {
  return warningRuleAction(ruleId, 'disable', { resourceVersion })
}

export function fetchWarnings(params = {}) {
  return requestJson(withQuery('/analysis/warnings', params))
}

export function fetchWarningEvent(eventId) {
  return requestJson(`/analysis/warnings/${encodeURIComponent(eventId)}`)
}

export function acknowledgeWarningEvent(eventId) {
  return requestJson(`/analysis/warnings/${encodeURIComponent(eventId)}/acknowledge`, {
    method: 'POST', body: JSON.stringify({})
  })
}

export function closeWarningEvent(eventId, reasonCode) {
  return requestJson(`/analysis/warnings/${encodeURIComponent(eventId)}/close`, {
    method: 'POST', body: JSON.stringify({ reasonCode })
  })
}

export function fetchWarningDeliveries(eventId, params = {}) {
  return requestJson(withQuery(`/analysis/warnings/${encodeURIComponent(eventId)}/deliveries`, params))
}

export function fetchNotifications(params = {}) {
  return requestJson(withQuery('/me/notifications', params))
}

export function fetchUnreadNotificationCount() {
  return requestJson('/me/notifications/unread-count')
}

export function markNotificationRead(notificationId) {
  return requestJson(`/me/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST', body: JSON.stringify({})
  })
}

export function markAllNotificationsRead() {
  return requestJson('/me/notifications/read-all', { method: 'POST', body: JSON.stringify({}) })
}

function warningRuleAction(ruleId, action, payload) {
  return requestJson(`/analysis/warning-rules/${encodeURIComponent(ruleId)}/${action}`, {
    method: 'POST', body: JSON.stringify(payload)
  })
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.filter((item) => item !== undefined && item !== null && item !== '')
        .forEach((item) => query.append(key, String(item)))
      return
    }
    query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `${path}?${text}` : path
}
