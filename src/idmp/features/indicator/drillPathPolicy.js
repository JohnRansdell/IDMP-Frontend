const retiredPathCodes = new Set(['TIME', 'DISEASE', 'FACTOR_TRACE'])

export function isRetiredDrillPath(pathCode) {
  return retiredPathCodes.has(String(pathCode || '').trim().toUpperCase())
}
