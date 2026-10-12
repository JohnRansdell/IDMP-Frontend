import test from 'node:test'
import assert from 'node:assert/strict'
import { newResourceCode } from '../src/idmp/utils/resourceCode.js'

test('编码使用完整 128 位随机值，兼容没有 randomUUID 的 HTTP 环境', () => {
  const cryptoApi = {
    getRandomValues(bytes) {
      assert.equal(bytes.length, 16)
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 255])
      return bytes
    }
  }
  assert.equal(newResourceCode('FACTOR', cryptoApi), 'FACTOR_000102030405060708090A0B0C0D0EFF')
  assert.equal(newResourceCode('INDICATOR', cryptoApi), 'INDICATOR_000102030405060708090A0B0C0D0EFF')
})

for (const prefix of ['FACTOR', 'INDICATOR']) {
  test(`${prefix} 连续生成一万次不重复且满足编码格式和长度限制`, () => {
    const codes = Array.from({ length: 10000 }, () => newResourceCode(prefix))
    assert.equal(new Set(codes).size, codes.length)
    for (const code of codes) {
      assert.match(code, new RegExp(`^${prefix}_[0-9A-F]{32}$`))
      assert.ok(code.length <= 64)
    }
  })
}

test('自动编码不读取时钟，不受同毫秒创建影响', () => {
  const originalNow = Date.now
  Date.now = () => { throw new Error('不应依赖时间戳') }
  try {
    assert.notEqual(newResourceCode('FACTOR'), newResourceCode('FACTOR'))
    assert.notEqual(newResourceCode('INDICATOR'), newResourceCode('INDICATOR'))
  } finally {
    Date.now = originalNow
  }
})
