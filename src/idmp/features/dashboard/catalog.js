import { clonePersistableValue, getDashboardSchemaStorageKey, normalizeDashboardSchema } from './schema.js'
import { persistDashboardSchema, recoverDashboardSchema, DASHBOARD_RECOVERY_STATUS } from './persistence.js'
import { applyLayoutTemplateToDashboard } from './layoutTemplates.js'

export const DASHBOARD_CATALOG_STORAGE_KEY = 'idmp:dashboard-catalog:v1'
export const BUILT_IN_DASHBOARD_IDS = new Set(['quality-overview'])
export const DASHBOARD_STUDIO_MENU_COMMANDS = Object.freeze([
  { id: 'create-blank', label: '新建空白看板' }, { id: 'create-template', label: '从模板创建' },
  { id: 'rename', label: '重命名当前看板' }, { id: 'copy', label: '复制当前看板' }, { id: 'delete', label: '删除当前看板', destructive: true }
])
const TYPES = new Set(['hospital-overview', 'topic', 'scene', 'department', 'custom'])
const SCOPES = new Set(['hospital', 'department', 'personal'])

export function readDashboardCatalog(storage = globalThis.localStorage) {
  try { const value = JSON.parse(storage.getItem(DASHBOARD_CATALOG_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value.map(normalizeCatalogEntry).filter(Boolean) : [] } catch { return [] }
}
export function writeDashboardCatalog(entries, storage = globalThis.localStorage) {
  const normalized = (Array.isArray(entries) ? entries : []).map(normalizeCatalogEntry).filter(Boolean)
  storage.setItem(DASHBOARD_CATALOG_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
export function catalogEntryFromSchema(schema, updatedAt = new Date().toISOString()) {
  const item = normalizeDashboardSchema(schema)
  return normalizeCatalogEntry({ id: item.id, name: item.name || '未命名看板', description: item.description, dashboardType: item.dashboardType, category: item.category, scope: item.scope, updatedAt })
}
export function saveDashboardToCatalog(schema, storage = globalThis.localStorage, updatedAt = new Date().toISOString()) {
  const entry = catalogEntryFromSchema(schema, updatedAt)
  return writeDashboardCatalog([...readDashboardCatalog(storage).filter(item => item.id !== entry.id), entry], storage)
}
export function removeLocalDashboard(id, storage = globalThis.localStorage) {
  if (BUILT_IN_DASHBOARD_IDS.has(id)) throw new Error('内建演示看板不能删除')
  storage.removeItem(getDashboardSchemaStorageKey(id))
  return writeDashboardCatalog(readDashboardCatalog(storage).filter(item => item.id !== id), storage)
}
export function duplicateLocalDashboard(id, storage = globalThis.localStorage, newId = `dashboard-${Date.now()}`) {
  const raw = storage.getItem(getDashboardSchemaStorageKey(id))
  if (!raw) throw new Error('找不到要复制的看板')
  const source = normalizeDashboardSchema(JSON.parse(raw))
  const copy = normalizeDashboardSchema({ ...clonePersistableValue(source), id: newId, name: `${source.name || '未命名看板'} - 副本` })
  storage.setItem(getDashboardSchemaStorageKey(newId), JSON.stringify(copy))
  saveDashboardToCatalog(copy, storage)
  return copy
}
export function createLocalDashboard(metadata = {}, { template = null, storage = globalThis.localStorage, id = `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } = {}) {
  let schema = normalizeDashboardSchema({ version: 1, id, name: metadata.name || '未命名看板', description: metadata.description || '', dashboardType: metadata.dashboardType || 'custom', category: metadata.category || '', scope: metadata.scope || 'personal', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [], globalFilters: [] })
  if (template) schema = normalizeDashboardSchema(applyLayoutTemplateToDashboard(schema, template, { createWidgetId: index => `${id}-widget-${index + 1}` }))
  const persisted = persistDashboardSchema(storage, getDashboardSchemaStorageKey(id), schema)
  saveDashboardToCatalog(persisted, storage)
  return persisted
}
export function renameLocalDashboard(id, name, storage = globalThis.localStorage) {
  const safeName = String(name || '').trim()
  if (!safeName) throw new Error('看板名称不能为空')
  const key = getDashboardSchemaStorageKey(id), recovered = recoverDashboardSchema(storage, key)
  if (recovered.status !== DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) throw new Error('看板配置无法恢复')
  const schema = normalizeDashboardSchema({ ...recovered.schema, name: safeName })
  // Validate both representations before either write, then update schema first.
  const entry = catalogEntryFromSchema(schema)
  persistDashboardSchema(storage, key, schema)
  writeDashboardCatalog([...readDashboardCatalog(storage).filter(item => item.id !== id), entry], storage)
  return schema
}
function normalizeCatalogEntry(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id.trim()) return null
  return { id: value.id.trim(), name: String(value.name || '未命名看板'), description: String(value.description || ''), dashboardType: TYPES.has(value.dashboardType) ? value.dashboardType : 'custom', category: String(value.category || ''), scope: SCOPES.has(value.scope) ? value.scope : 'hospital', updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString() }
}
