import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeIndicatorTrialResults } from '../src/idmp/api/adapters/indicator.js'

const source = name => readFileSync(new URL(`../src/idmp/views/${name}.vue`, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
function loadFunction(view, name, scope) {
  const code = source(view)
  const start = code.indexOf(`async function ${name}(`)
  const end = view === 'IndicatorEditor' ? code.indexOf('\n}\n', start) + 2 : code.indexOf('\n', start)
  return Function(...Object.keys(scope), `${code.slice(start, end)}\nreturn ${name}`)(...Object.values(scope))
}
const ref = value => ({ value })
const messages = { error() {}, success() {} }

for (const view of ['FactorEditor', 'FactorTemplateInstantiate']) {
  test(`${view} reads subsequent trial pages without truncating totals`, async () => {
    const calls = []
    const scope = { workflow: { versionId: 'large-version-id', batchId: 'large-batch-id' }, loading: { result: false },
      trialPagination: { page: 1, size: 100, total: 0 }, trialRows: ref([]),
      ElMessage: messages, getStatusLabel: value => value, normalize: rows => rows,
      fetchFactorTrialResults: async (version, batch, page, size) => {
        calls.push([version, batch, page, size])
        return { batchStatus: 'SUCCEEDED', qualityStatus: 'PASSED', results: {
          records: [{ valueDecimal: page }], pageNum: page, pageSize: 100, total: 250
        } }
      } }
    const load = loadFunction(view, 'loadTrialResults', scope)
    await load(1)
    await load(2)
    await load(3)
    assert.deepEqual(calls.map(item => item[2]), [1, 2, 3])
    assert.equal(scope.trialPagination.total, 250)
    assert.equal(scope.trialPagination.page, 3)
    assert.deepEqual(scope.trialRows.value, [{ valueDecimal: 3 }])
    assert.equal(scope.loading.result, false)
    assert.match(source(view), /@current-change="loadTrialResults"/)
  })
  test(`${view} discards results from a replaced batch`, async () => {
    let resolve
    const scope = { workflow: { versionId: 'version', batchId: 'old' }, loading: { result: false },
      trialPagination: { page: 1, size: 100, total: 250 }, trialRows: ref([{ valueDecimal: 'current' }]),
      ElMessage: messages, getStatusLabel: value => value, normalize: rows => rows,
      fetchFactorTrialResults: () => new Promise(done => { resolve = done }) }
    const pending = loadFunction(view, 'loadTrialResults', scope)(2)
    scope.workflow.batchId = 'new'
    resolve({ results: { records: [{ valueDecimal: 'old' }], pageNum: 2, total: 250 } })
    await pending
    assert.deepEqual(scope.trialRows.value, [{ valueDecimal: 'current' }])
    assert.equal(scope.trialPagination.page, 1)
    assert.equal(scope.loading.result, false)
  })
}

const target = (id, page, value) => ({ targetId: id, targetStatus: 'SUCCEEDED', results: { records: [{ resultValue: value }], total: 250, pageNum: page, pageSize: 100, pages: 3 } })
function indicatorScope(fetcher) {
  const targets = normalizeIndicatorTrialResults({ targets: [target('A', 1, 1), target('B', 1, 1)] }).targets
  return { workflowLoading: { result: false }, indicatorWorkflow: { versionId: 'version', batchId: 'batch' },
    selectedIndicatorTrialTarget: ref(targets[0]), selectedIndicatorTrialTargetKey: ref('A'), indicatorTrialTargets: ref(targets),
    normalizeIndicatorTrialResults, fetchIndicatorTrialResults: fetcher, ElMessage: messages }
}
test('indicator trial pagination updates only the selected target', async () => {
  const scope = indicatorScope(async (...args) => {
    assert.deepEqual(args, ['version', 'batch', 2, 100])
    return { targets: [target('A', 2, 2), target('B', 2, 2)] }
  })
  await loadFunction('IndicatorEditor', 'loadIndicatorTrialPage', scope)(2)
  assert.deepEqual(scope.indicatorTrialTargets.value.map(item => item.pageNum), [2, 1])
  assert.equal(scope.indicatorTrialTargets.value[0].total, 250)
})

test('failed or obsolete indicator page requests retain current results', async () => {
  const scope = indicatorScope(async () => { throw new Error('network') })
  const before = scope.indicatorTrialTargets.value
  await loadFunction('IndicatorEditor', 'loadIndicatorTrialPage', scope)(2)
  assert.equal(scope.indicatorTrialTargets.value, before)
  assert.equal(scope.workflowLoading.result, false)
  let resolve
  scope.fetchIndicatorTrialResults = () => new Promise(done => { resolve = done })
  const pending = loadFunction('IndicatorEditor', 'loadIndicatorTrialPage', scope)(2)
  scope.indicatorWorkflow.batchId = 'new-batch'
  resolve({ targets: [target('A', 2, 2)] })
  await pending
  assert.equal(scope.indicatorTrialTargets.value, before)
})
