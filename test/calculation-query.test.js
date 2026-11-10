import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculationQueryIds, validateCalculationQueryId, calculationQueryError } from '../src/idmp/utils/calculationQuery.js'

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
    validateCalculationQueryId, calculationQueryError, toOpaqueId: String,
    ElMessage: Object.fromEntries(['warning', 'error', 'success'].map(key => [key, value => messages.push([key, value])])),
    fetchCalcBatch: async id => { calls.push(id); return { batchId: id, taskId: '102027642461312817' } },
    fetchAsyncTask: async id => { calls.push(id); return { taskId: id, batchId: '102027642461312818' } }, ...overrides
  }
  const functions = source.slice(source.indexOf('async function loadTask()'), source.indexOf('async function createBatch()'))
  return { ...deps, calls, messages, ...Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; ${functions}; return { loadTask, loadBatch }`)(deps) }
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
