import { normalizeDrillLevelDefinition } from '../../api/adapters/drill.js'
import { trendGrainField } from './trendGrain.js'

const keyOf = value => String(value || '').trim().toUpperCase()
const dictionaryRoles = new Set(['DEPARTMENT', 'OUT_DEPT', 'DOCTOR', 'ATTENDING_DOCTOR'])

export function reportDimensionFields(version = {}) {
  const fields = new Map()
  const paths = version.drillConfig?.drillPaths || []
  const add = (code, metadata = {}) => {
    if (!code || ['HOSPITAL_CODE', 'ORG_CODE'].includes(keyOf(code))) return
    const key = keyOf(code)
    const previous = fields.get(key)
    fields.set(key, { code: previous?.code || code, label: code, aliases: [], ...previous, ...metadata })
  }
  for (const path of paths) {
    if (['TIME', 'FACTOR_TRACE', 'SCENARIO'].includes(keyOf(path.pathCode))) continue
    for (const item of path.levels || []) {
      const level = normalizeDrillLevelDefinition(item)
      const code = level.memberKeyFieldCode || level.dimensionFieldCode
      add(code, { label: level.levelName || code, role: keyOf(level.levelCode) })
      if (!dictionaryRoles.has(keyOf(level.levelCode))) {
        for (const extra of [level.dimensionFieldCode, level.displayFieldCode]) {
          if (extra && keyOf(extra) !== keyOf(code)) add(extra)
        }
      }
      if (keyOf(level.levelCode) === keyOf(path.maxLevel)) break
    }
  }
  for (const code of version.dimensionGrain || []) {
    if (fields.has(keyOf(code))) add(code, { grain: true })
    else add(code, { ...trendGrainField(code, paths), grain: true })
  }
  return [...fields.values()]
}

export function normalizeReportFilters(filters = {}, fields = []) {
  const result = {}
  for (const [rawCode, rawValues] of Object.entries(filters)) {
    const field = fields.find(field => [field.code, ...field.aliases || []].some(code => keyOf(code) === keyOf(rawCode)))
    const code = field?.code || rawCode
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '').map(String)
    if (values.length) result[code] = [...new Set([...(result[code] || []), ...values])]
  }
  return result
}

export function reportFilterFields(fields, filters) {
  const known = new Set(fields.map(field => keyOf(field.code)))
  return [...fields, ...Object.keys(normalizeReportFilters(filters, fields))
    .filter(code => !known.has(keyOf(code))).map(code => ({ code, label: code, aliases: [] }))]
}

export function replaceReportFilterQuery(query, filters) {
  return { ...Object.fromEntries(Object.entries(query).filter(([key]) => !key.startsWith('filter.')
    && !['drillResultId', 'drillStartLevel', 'drillParentKeys'].includes(key))),
    ...Object.fromEntries(Object.entries(normalizeReportFilters(filters)).map(([code, values]) => [`filter.${code}`, values])) }
}
