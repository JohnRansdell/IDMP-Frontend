export function newResourceCode(prefix, cryptoApi = globalThis.crypto) {
  // getRandomValues 在公网 HTTP 页面也可用，不依赖时间戳或机器协调。
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `${prefix}_${suffix}`
}
