import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, isReactive } from 'vue'
import { createRequestScope, useLatestResult } from '../src/idmp/features/analysis/useLatestResult.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test('superseded success and failure cannot overwrite the current query, even if transport ignores abort', async () => {
  for (const failed of [false, true]) {
    const query = useLatestResult(), old = deferred(), current = deferred(), warnings = []
    let signal
    const first = query.run(request => { signal = request.signal; return old.promise }, { onError: error => warnings.push(error) })
    const second = query.run(() => current.promise)
    assert.equal(signal.aborted, true)
    failed ? old.reject(new Error('obsolete')) : old.resolve({ value: 99 })
    await first
    assert.equal(query.loading.value, true)
    assert.equal(query.data.value, null)
    current.resolve({ value: 0 })
    await second
    assert.equal(query.data.value.value, 0)
    assert.equal(query.loading.value, false)
    assert.deepEqual(warnings, [])
  }
})

test('independent result channels do not cancel or clear one another', async () => {
  const report = useLatestResult(), trend = useLatestResult(), waiting = deferred()
  await report.run(() => ({ value: 1 / 429 }))
  const pending = trend.run(() => waiting.promise)
  trend.clear()
  waiting.resolve({ value: 9 })
  await pending
  assert.equal(report.data.value.value, 1 / 429)
  assert.equal(trend.data.value, null)
})

test('failure clears previous values and retry resets error without converting null or zero', async () => {
  const query = useLatestResult()
  await query.run(() => ({ value: 5 }))
  await query.run(() => { throw new Error('unavailable') })
  assert.equal(query.error.value, 'unavailable')
  assert.equal(query.data.value, null)
  await query.run(() => ({ value: null, rows: [{ value: 0 }] }))
  assert.equal(query.error.value, '')
  assert.equal(query.data.value.value, null)
  assert.equal(query.data.value.rows[0].value, 0)
  assert.equal(isReactive(query.data.value.rows), false)
})

test('scope disposal aborts transport, clears state and prevents later requests', async () => {
  const scope = effectScope(), waiting = deferred()
  const query = scope.run(useLatestResult)
  let signal
  const pending = query.run(request => { signal = request.signal; return waiting.promise })
  scope.stop()
  assert.equal(signal.aborted, true)
  waiting.resolve({ value: 99 })
  await pending
  let called = false
  await query.run(() => { called = true })
  assert.equal(called, false)
  assert.equal(query.data.value, null)
  assert.equal(query.loading.value, false)
})

test('request scopes invalidate old tickets and can resume after a temporary cancellation', () => {
  const scope = createRequestScope(), first = scope.begin()
  scope.cancel()
  assert.equal(first.isCurrent(), false)
  const second = scope.begin()
  assert.equal(second.isCurrent(), true)
  scope.dispose()
  assert.equal(second.signal.aborted, true)
  assert.equal(scope.begin().isCurrent(), false)
})
