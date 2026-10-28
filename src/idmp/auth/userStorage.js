let owner = ''
let revision = 0

export function setStorageUser(user) {
  const next = String(user?.id ?? user?.username ?? '')
  if (owner !== next) revision += 1
  owner = next
}

// Bind a storage handle to its creator, so a late callback cannot write to a new account.
export function userStorage(kind = 'local', storage = globalThis[`${kind}Storage`]) {
  const user = owner
  const generation = revision
  const keyFor = key => `idmp:user:${encodeURIComponent(user)}:${key}`
  const check = () => {
    if (!user || user !== owner || generation !== revision) {
      const error = new Error('登录状态已变更，请重新打开页面')
      error.name = 'AbortError'
      throw error
    }
  }
  return {
    getItem(key) { if (!user || user !== owner || generation !== revision) return null; return storage?.getItem(keyFor(key)) ?? null },
    setItem(key, value) { check(); storage?.setItem(keyFor(key), value) },
    removeItem(key) { check(); storage?.removeItem(keyFor(key)) }
  }
}
