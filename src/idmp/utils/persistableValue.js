export function clonePersistableValue(value, path = '$', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === undefined) return undefined
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new TypeError(`${path} is not JSON persistable`)
  }
  if (typeof value !== 'object') return value
  if (seen.has(value)) throw new TypeError(`${path} contains a circular reference`)
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => clonePersistableValue(item, `${path}[${index}]`, seen) ?? null)
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain JSON object`)
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${path} contains symbol keys`)
    return Object.keys(value).reduce((result, key) => {
      const cloned = clonePersistableValue(value[key], `${path}.${key}`, seen)
      if (cloned !== undefined) result[key] = cloned
      return result
    }, {})
  } finally {
    seen.delete(value)
  }
}
