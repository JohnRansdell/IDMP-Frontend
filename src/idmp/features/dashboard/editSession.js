import { clonePersistableValue } from './schema.js'

export function createDashboardEditingSnapshot(viewerSchema, loadFallbackSchema) {
  return clonePersistableValue(viewerSchema || loadFallbackSchema())
}
