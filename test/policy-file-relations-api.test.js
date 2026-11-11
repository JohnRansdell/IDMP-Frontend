import test from 'node:test'
import assert from 'node:assert/strict'
import { removePolicyRelation } from '../src/idmp/api/modules/policies.js'
import { clearAccessToken } from '../src/idmp/api/request.js'

globalThis.localStorage = { getItem: () => '', removeItem() {} }
test('解除关系使用 DELETE，保留长 ID 并提交并发版本号', async () => {
  clearAccessToken()
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /\/meta\/policy-file-relations\/102027642463697111\?resourceVersion=0$/)
      assert.equal(options.method, 'DELETE')
      return new Response(JSON.stringify({ code: 'OK', data: null }), { headers: { 'Content-Type': 'application/json' } })
    }
    assert.equal((await removePolicyRelation('102027642463697111', 0)).code, 'OK')
  } finally { globalThis.fetch = previous }
})
