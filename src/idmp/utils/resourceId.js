// Resource identifiers remain strings, including IDs larger than Number.MAX_SAFE_INTEGER.
export function toOpaqueId(value) {
  return value === undefined || value === null ? '' : String(value)
}
