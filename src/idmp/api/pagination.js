export async function fetchAllPages(fetchPage, params = {}) {
  const filters = { ...params }
  const size = filters.size ?? 500
  delete filters.page
  delete filters.size
  const rows = []
  let previousPageSignature
  for (let page = 1; ; page += 1) {
    const result = await fetchPage({ ...filters, page, size })
    if (Array.isArray(result)) return [...rows, ...result]
    const items = result?.records ?? result?.items ?? result?.list
    if (!Array.isArray(items)) throw new Error('列表数据格式异常，请重试')
    const total = result.total == null ? null : Number(result.total)
    const actualSize = Number(result.pageSize ?? result.size ?? size)
    if ((total != null && (!Number.isFinite(total) || total < 0)) || !(actualSize > 0)
      || (result.pageNum != null && Number(result.pageNum) !== page)) {
      throw new Error('列表分页信息异常，请重试')
    }
    if (!items.length && total != null && rows.length < total) {
      throw new Error('列表数据尚未加载完整，请重试')
    }
    const signature = JSON.stringify(items)
    if (items.length && signature === previousPageSignature) {
      throw new Error('列表分页未推进，已停止加载，请重试')
    }
    previousPageSignature = signature
    rows.push(...items)
    if (total != null ? rows.length >= total : items.length < actualSize) return rows
  }
}
