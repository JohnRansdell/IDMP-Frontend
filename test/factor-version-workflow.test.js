import test from 'node:test'
import assert from 'node:assert/strict'
import { useFactorVersionWorkflow } from '../src/idmp/features/factor/useFactorVersionWorkflow.js'

function fixture(api = {}, options = {}) {
  const workflow = { versionId: '9007199254740993123', compiled: true, taskStatus: '', batchId: '', taskId: '' }
  const loading = {}, trialRows = { value: [] }, trialPagination = { page: 1, size: 100, total: 0 }
  const errors = []
  const service = useFactorVersionWorkflow({ workflow, loading, trialRows, trialPagination, api,
    notify: { success() {}, warning() {}, error: message => errors.push(message) }, wait: async () => {}, ...options })
  return { service, workflow, loading, trialRows, trialPagination, errors }
}

test('factor workflow submits parameters, follows the task and preserves paged totals and opaque IDs', async () => {
  let polls = 0
  const f = fixture({
    trial: async (id, payload, key) => {
      assert.equal(id, '9007199254740993123')
      assert.deepEqual(payload, { parameters: { age: 0 } })
      assert.ok(key.startsWith(`factor-trial-${id}-`))
      return { taskId: 'task', status: 'QUEUED' }
    },
    fetchTask: async () => ({ status: ++polls === 2 ? 'SUCCEEDED' : 'RUNNING', batchId: 'batch' }),
    fetchResults: async (_, batch) => {
      assert.equal(batch, 'batch')
      return { results: { records: [{ valueDecimal: '0' }], pageNum: 1, pageSize: 100, total: 250 }, qualityStatus: 'PASSED' }
    }
  })
  await f.service.trial({ parameters: { age: 0 } })
  assert.equal(polls, 2)
  assert.equal(f.trialPagination.total, 250)
  assert.equal(f.workflow.resultsLoaded, true)
  assert.equal(f.loading.trial, false)
})

test('factor scalar and nested result contracts retain zero and quality metadata', async () => {
  const f = fixture({ fetchResults: async () => ({ result: { valueDecimal: 0, qualityStatus: 'PASSED' } }) })
  f.workflow.batchId = 'batch'
  await f.service.loadTrialResults()
  assert.equal(f.trialRows.value[0].valueDecimal, 0)
  assert.equal(f.workflow.qualityStatus, 'PASSED')
  const nested = fixture({ fetchResults: async () => ({ targets: [{ resultSets: [{ sourceRecordCount: 12,
    qualityStatus: 'PASSED', results: [{ valueDecimal: '3' }] }] }] }) })
  nested.workflow.batchId = 'batch'
  await nested.service.loadTrialResults()
  assert.equal(nested.trialRows.value[0].sourceRecordCount, 12)
  assert.equal(nested.workflow.qualityStatus, 'PASSED')
})

test('failed result batches cannot unlock publication and failed reads clear prior success', async () => {
  const f = fixture({ fetchResults: async () => ({ batchStatus: 'FAILED', results: { records: [] } }) })
  f.workflow.batchId = 'batch'; f.workflow.resultsLoaded = true
  await f.service.loadTrialResults()
  assert.equal(f.workflow.resultsLoaded, false)
  assert.equal(f.errors.length, 1)
})

test('replaced versions and disposed editors ignore delayed trial acceptance', async () => {
  for (const action of ['replace', 'dispose']) {
    let resolve
    const f = fixture({ trial: () => new Promise(done => { resolve = done }) })
    const pending = f.service.trial({})
    if (action === 'replace') f.workflow.versionId = 'other'
    else f.service.dispose()
    resolve({ taskId: 'stale', batchId: 'stale', status: 'SUCCEEDED' })
    await pending
    assert.equal(f.workflow.taskId, '')
    assert.equal(f.workflow.batchId, '')
    assert.equal(f.loading.trial, false)
  }
})

test('compile preserves resource version payload and invokes page-specific setup after success', async () => {
  const calls = []
  const f = fixture({ compile: async (_, payload) => { calls.push(payload); return { artifactId: 'artifact', status: 'VALID' } } }, {
    afterCompile: async () => ({ status: 'VALIDATED' }), onCompiled: async () => calls.push('runtime')
  })
  await f.service.compile({ resourceVersion: 7 })
  assert.deepEqual(calls, [{ resourceVersion: 7 }, 'runtime'])
  assert.equal(f.workflow.artifactId, 'artifact')
  assert.equal(f.workflow.status, 'VALIDATED')
})

test('publication is cancelled when the selected version changes during confirmation', async () => {
  let writes = 0
  const f = fixture({ publish: async () => { writes++ } })
  await f.service.publish(async () => { f.workflow.versionId = 'other' })
  assert.equal(writes, 0)
})

test('an unfinished task stops after the bounded polling window without fetching results', async () => {
  let polls = 0, reads = 0
  const f = fixture({ trial: async () => ({ taskId: 'task' }),
    fetchTask: async () => { polls++; return { status: 'RUNNING' } },
    fetchResults: async () => { reads++; return {} } })
  await f.service.trial({})
  assert.equal(polls, 15)
  assert.equal(reads, 0)
  assert.equal(f.workflow.messageType, 'info')
})
