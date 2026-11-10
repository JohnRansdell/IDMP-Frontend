import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculationQueryIds, validateCalculationQueryId, calculationQueryError } from '../src/idmp/utils/calculationQuery.js'
import { toOpaqueId } from '../src/idmp/utils/resourceId.js'

test('query IDs start empty and preserve independent large route IDs as strings', () => {
  assert.deepEqual(calculationQueryIds(), { taskId: '', batchId: '' })
  assert.deepEqual(calculationQueryIds({ taskId: ' 102027642461312817 ', batchId: '102027642461312818' }), {
    taskId: '102027642461312817', batchId: '102027642461312818'
  })
  assert.deepEqual(calculationQueryIds({ taskId: ['1', '2'], batchId: 102027642461312818 }), { taskId: '', batchId: '' })
})

test('invalid IDs are rejected before a backend request, including rounded/exponential IDs', () => {
  for (const id of ['', '0', '-1', 'abc', '1e18', '1/2', '1.5', '9223372036854775808']) assert.ok(validateCalculationQueryId(id, '批次'))
  assert.equal(validateCalculationQueryId('102027642461312818', '批次'), '')
  assert.equal(validateCalculationQueryId('9223372036854775807', '批次'), '')
})

const source = await readFile(new URL('../src/idmp/views/CalculationTaskCenter.vue', import.meta.url), 'utf8')
function queries(overrides = {}) {
  const calls = [], messages = [], ref = () => ({ value: '' })
  const deps = {
    queryForm: { taskId: '', batchId: '' }, taskLoading: ref(), batchLoading: ref(), taskError: ref(), batchError: ref(), taskDetail: ref(), batchDetail: ref(),
    validateCalculationQueryId, calculationQueryError, toOpaqueId,
    ElMessage: Object.fromEntries(['warning', 'error', 'success'].map(key => [key, value => messages.push([key, value])])),
    fetchCalcBatch: async id => { calls.push(id); return { batchId: id, taskId: '102027642461312817' } },
    fetchAsyncTask: async id => { calls.push(id); return { taskId: id, batchId: '102027642461312818' } }, ...overrides
  }
  const functions = source.slice(source.indexOf('let taskQueryRevision'), source.indexOf('async function createBatch()'))
  const refresh = source.slice(source.indexOf('async function refreshCurrent()'), source.indexOf('function displayId('))
  return { ...deps, calls, messages, ...Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; ${functions}; ${refresh}; return { loadTask, loadBatch, refreshCurrent, dispose: () => { queryDisposed = true; ++taskQueryRevision; ++batchQueryRevision } }`)(deps) }
}

test('empty and malformed task/batch IDs do not trigger requests', async () => {
  const state = queries()
  await state.loadTask(); await state.loadBatch()
  state.queryForm.batchId = '1e18'
  await state.loadBatch()
  assert.deepEqual(state.calls, [])
  assert.equal(state.messages.filter(([type]) => type === 'warning').length, 3)
})

test('batch and task queries use distinct exact IDs and fill their associated ID', async () => {
  const state = queries()
  state.queryForm.batchId = '102027642461312818'
  await state.loadBatch()
  assert.equal(state.queryForm.taskId, '102027642461312817')
  await state.loadTask()
  assert.deepEqual(state.calls, ['102027642461312818', '102027642461312817'])
  assert.equal(state.queryForm.batchId, '102027642461312818')
  assert.equal(state.batchLoading.value, false)
})

test('missing and forbidden batches clear stale details and provide actionable messages', async () => {
  for (const status of [403, 404]) {
    const state = queries({ fetchCalcBatch: async () => { throw { status, message: 'backend failure' } } })
    state.queryForm.batchId = '123'
    state.batchDetail.value = { batchId: 'old' }
    await state.loadBatch()
    assert.equal(state.batchDetail.value, null)
    assert.match(state.batchError.value, status === 403 ? /无权/ : /未找到/)
    assert.equal(state.batchLoading.value, false)
  }
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

for (const channel of ['task', 'batch']) {
  const method = channel === 'task' ? 'loadTask' : 'loadBatch', api = channel === 'task' ? 'fetchAsyncTask' : 'fetchCalcBatch'
  const ownId = `${channel}Id`, linkedId = channel === 'task' ? 'batchId' : 'taskId'
  test(`${channel} queries ignore old successes, old errors and premature loading completion`, async () => {
    for (const oldFails of [false, true]) {
      const old = deferred(), latest = deferred()
      const state = queries({ [api]: id => id === '1' ? old.promise : latest.promise })
      state.queryForm[ownId] = '1'
      const first = state[method]()
      state.queryForm[ownId] = '2'
      const second = state[method]()
      if (oldFails) old.reject(new Error('过期错误')); else old.resolve({ [ownId]: '1', [linkedId]: '10' })
      assert.equal(await first, false)
      assert.equal(state[`${channel}Loading`].value, true)
      assert.equal(state[`${channel}Detail`].value, null)
      assert.deepEqual(state.messages, [])
      latest.resolve({ [ownId]: '2', [linkedId]: '20' })
      assert.equal(await second, true)
      assert.equal(state[`${channel}Detail`].value[ownId], '2')
      assert.equal(state.queryForm[linkedId], '20')
      assert.equal(state[`${channel}Loading`].value, false)
    }
  })

  test(`${channel} old response cannot overwrite a newer completed result or ID`, async () => {
    const old = deferred()
    const state = queries({ [api]: async id => id === '1' ? old.promise : { [ownId]: id, [linkedId]: '20' } })
    state.queryForm[ownId] = '1'
    const first = state[method]()
    state.queryForm[ownId] = '2'
    await state[method]()
    old.resolve({ [ownId]: '1', [linkedId]: '10' })
    await first
    assert.equal(state[`${channel}Detail`].value[ownId], '2')
    assert.equal(state.queryForm[linkedId], '20')
    assert.equal(state.messages.length, 1)
  })

  test(`${channel} responses after input changes or unmount never update state or notifications`, async () => {
    for (const action of ['input', 'unmount']) {
      const pending = deferred(), state = queries({ [api]: () => pending.promise })
      state.queryForm[ownId] = '1'
      const request = state[method]()
      if (action === 'input') state.queryForm[ownId] = '2'; else state.dispose()
      pending.resolve({ [ownId]: '1', [linkedId]: '10' })
      assert.equal(await request, false)
      assert.equal(state[`${channel}Detail`].value, null)
      assert.equal(state.queryForm[linkedId], '')
      assert.deepEqual(state.messages, [])
    }
  })
}

test('a later batch lookup supersedes an unrelated pending task lookup', async () => {
  const pending = deferred(), state = queries({ fetchAsyncTask: () => pending.promise })
  state.queryForm.taskId = '1'
  const old = state.loadTask()
  state.queryForm.batchId = '2'
  await state.loadBatch()
  pending.resolve({ taskId: '1', batchId: '10' })
  await old
  assert.equal(state.queryForm.batchId, '2')
  assert.equal(state.queryForm.taskId, '102027642461312817')
  assert.equal(state.taskDetail.value, null)
})

test('a later task lookup supersedes an unrelated pending batch lookup', async () => {
  const pending = deferred(), state = queries({ fetchCalcBatch: () => pending.promise })
  state.queryForm.batchId = '1'
  const old = state.loadBatch()
  state.queryForm.taskId = '2'
  await state.loadTask()
  pending.resolve({ taskId: '10', batchId: '1' })
  await old
  assert.equal(state.queryForm.taskId, '2')
  assert.equal(state.queryForm.batchId, '102027642461312818')
  assert.equal(state.batchDetail.value, null)
})

test('a lookup with no associated ID clears the previous unrelated details', async () => {
  const state = queries({ fetchCalcBatch: async () => ({ batchId: '2' }) })
  state.queryForm.batchId = '2'; state.queryForm.taskId = '1'
  state.taskDetail.value = { taskId: '1' }; state.taskError.value = '旧错误'
  await state.loadBatch()
  assert.equal(state.queryForm.taskId, '')
  assert.equal(state.taskDetail.value, null)
  assert.equal(state.taskError.value, '')
})

test('refresh resolves the current batch association before fetching its task', async () => {
  const state = queries()
  state.queryForm.batchId = '102027642461312818'
  state.queryForm.taskId = '999'
  await state.refreshCurrent()
  assert.deepEqual(state.calls, ['102027642461312818', '102027642461312817'])
  assert.equal(state.taskDetail.value.taskId, '102027642461312817')
  assert.equal(state.batchDetail.value.batchId, '102027642461312818')
})

test('a failed batch refresh does not fall through to an unrelated task query', async () => {
  const state = queries({ fetchCalcBatch: async () => { throw { status: 404 } } })
  state.queryForm.batchId = '2'; state.queryForm.taskId = '1'
  await state.refreshCurrent()
  assert.deepEqual(state.calls, [])
  assert.match(state.batchError.value, /未找到/)
})

test('task-only refresh follows the returned batch association', async () => {
  const state = queries()
  state.queryForm.taskId = '102027642461312817'
  await state.refreshCurrent()
  assert.deepEqual(state.calls, ['102027642461312817', '102027642461312818'])
})

test('same-batch refresh retains displayed data while switching batches clears it', async () => {
  const pending = deferred(), state = queries({ fetchCalcBatch: () => pending.promise })
  state.queryForm.batchId = '2'
  const displayed = { batchId: '2', targets: [{ targetId: 'original' }] }
  state.batchDetail.value = displayed
  const refresh = state.loadBatch()
  assert.equal(state.batchDetail.value, displayed)
  pending.resolve({ batchId: '2' })
  await refresh
  const next = deferred()
  const switched = queries({ fetchCalcBatch: () => next.promise })
  switched.queryForm.batchId = '3'; switched.batchDetail.value = displayed
  const query = switched.loadBatch()
  assert.equal(switched.batchDetail.value, null)
  next.resolve({ batchId: '3' })
  await query
})
