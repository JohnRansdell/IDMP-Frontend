export const SEMANTIC_DATA_TYPES = ['STRING', 'INTEGER', 'DECIMAL', 'DATE', 'DATETIME', 'BOOLEAN', 'CODE']

export function validateSemanticFieldCode(value, maxLength = 64) {
  const code = String(value || '')
  return code.length > 0 && code.length <= maxLength && /^[A-Z][A-Z0-9_]*$/.test(code)
}

export function validateDataDomainCode(value) {
  return validateSemanticFieldCode(value)
}
