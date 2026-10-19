import { markRaw } from 'vue'

const transforms = new WeakMap()

// 服务端结果按整批替换，不参与表单编辑，避免为每个单元格创建响应式代理。
export function immutableResultRows(rows) {
  for (const row of rows) if (row && typeof row === 'object' && !Object.isFrozen(row)) Object.freeze(row)
  return Object.freeze(markRaw(rows))
}

export function transformResultRows(rows, key, transform) {
  if (!Object.isFrozen(rows)) return transform()
  let cache = transforms.get(rows)
  if (!cache) { cache = new Map(); transforms.set(rows, cache) }
  if (!cache.has(key)) {
    const result = transform()
    cache.set(key, immutableResultRows(result))
    if (cache.size > 16) cache.delete(cache.keys().next().value)
  }
  return cache.get(key)
}
