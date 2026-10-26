// Adapters choose aliases explicitly while callers receive the same page contract.
export function normalizePage(payload, {
  listKeys = ['records', 'items', 'list'],
  pageKeys = ['pageNum', 'page'],
  sizeKeys = ['pageSize', 'size']
} = {}) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length, page: 1, size: payload.length }
  const first = (keys, fallback) => keys.map(key => payload?.[key]).find(value => value !== null && value !== undefined) ?? fallback
  const items = listKeys.map(key => payload?.[key]).find(Array.isArray) || []
  return { items, total: Number(payload?.total ?? 0), page: Number(first(pageKeys, 1)), size: Number(first(sizeKeys, 20)) }
}
