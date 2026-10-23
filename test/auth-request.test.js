import test from 'node:test'
import assert from 'node:assert/strict'
import { requestJson, requestPdf, requestFile, setSessionRecoveryHandler } from '../src/idmp/api/request.js'

test('failed retried requests notify navigation, but login failures and 403 do not', async () => {
  const saved = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage }
  let token = 'old', status = 401, refreshes = 0
  const events = []
  globalThis.localStorage = { getItem: () => token, removeItem: () => { token = '' } }
  globalThis.window = { dispatchEvent: event => events.push(event.type) }
  globalThis.fetch = async () => ({ ok: false, status, headers: new Headers(), text: async () => JSON.stringify({ code: `COMMON-${status}00` }) })
  setSessionRecoveryHandler(async () => { refreshes++; token = 'new'; return true })
  try {
    for (const run of [() => requestJson('/indicators'), () => requestPdf('/report', {}), () => requestFile('/policies/test/file')]) {
      token = 'old'; events.length = 0; refreshes = 0
      await assert.rejects(run())
      assert.equal(refreshes, 1)
      assert.equal(token, '')
      assert.deepEqual(events, ['idmp:unauthorized'])
    }
    events.length = 0; refreshes = 0
    await assert.rejects(requestJson('/auth/login', { skipSessionRecovery: true }))
    assert.equal(refreshes, 0)
    assert.deepEqual(events, [])
    status = 403; token = 'valid'
    await assert.rejects(requestJson('/system/users'))
    assert.equal(token, 'valid')
    assert.deepEqual(events, [])
  } finally { Object.assign(globalThis, saved); setSessionRecoveryHandler(null) }
})
