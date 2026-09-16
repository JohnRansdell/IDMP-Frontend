import {
  assertDashboardPersistenceContract,
  createPersistableDashboardSnapshot,
  normalizeDashboardSchema,
  semanticDashboardEquals,
  validateDashboardSchema
} from './schema.js'

export const DASHBOARD_RECOVERY_STATUS = Object.freeze({
  VALID_CURRENT_SCHEMA: 'VALID_CURRENT_SCHEMA',
  MIGRATED_LEGACY_SCHEMA: 'MIGRATED_LEGACY_SCHEMA',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  NO_SCHEMA: 'NO_SCHEMA'
})

export function recoverDashboardSchema(storage, key) {
  let raw
  try {
    raw = storage.getItem(key)
  } catch (error) {
    return invalid(error, null)
  }
  if (raw === null) return { status: DASHBOARD_RECOVERY_STATUS.NO_SCHEMA, schema: null, raw: null, error: null }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return invalid(error, raw)
  }
  const validation = validateDashboardSchema(parsed)
  if (!validation.valid) return invalid(new TypeError(validation.errors.join('; ')), raw)
  try {
    assertDashboardPersistenceContract(parsed)
    return {
      status: DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA,
      schema: normalizeDashboardSchema(parsed),
      raw,
      error: null
    }
  } catch (error) {
    return invalid(error, raw)
  }
}

export function persistDashboardSchema(storage, key, schema) {
  const validation = validateDashboardSchema(schema)
  if (!validation.valid) throw new TypeError(validation.errors.join('; '))
  assertDashboardPersistenceContract(schema)
  const before = createPersistableDashboardSnapshot(schema)
  storage.setItem(key, JSON.stringify(before))
  const recovered = recoverDashboardSchema(storage, key)
  if (recovered.status !== DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    throw new TypeError(`保存回读校验失败：${recovered.error?.message || recovered.status}`)
  }
  const after = createPersistableDashboardSnapshot(recovered.schema)
  if (JSON.stringify(before) !== JSON.stringify(after) || !semanticDashboardEquals(schema, recovered.schema)) {
    throw new TypeError('保存回读内容与当前编辑内容不一致')
  }
  return recovered.schema
}

function invalid(error, raw) {
  return { status: DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA, schema: null, raw, error: error instanceof Error ? error : new Error(String(error)) }
}
