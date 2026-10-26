import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { appendScenarioIndicator, restorePolicyDrafts } from '../src/idmp/features/indicator/editorWorkflow.js'

test('indicator pages use drill configuration without a separate ownership display', () => {
  for (const page of ['IndicatorEditor', 'IndicatorDetail']) {
    const source = readFileSync(new URL(`../src/idmp/views/${page}.vue`, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    assert.doesNotMatch(descriptor.template.content, /数据归属|归属类型|dataOwnership/)
    if (page === 'IndicatorEditor') {
      assert.match(descriptor.template.content, /<CustomDrillPathEditor v-model="selectedDrillPaths"/)
      assert.match(descriptor.scriptSetup.content, /configuredDataOwnership/)
    }
  }
})

test('scenario append preserves all existing binding settings and does not duplicate the indicator', () => {
  const existing = [{ indicatorVersionId: '100000000000000001', displayOrder: 9, required: false, dimensionGrain: ['科室'], periodType: 'MONTHLY', organizationScopeDsl: { nodeType: 'TRUE' }, reportRequirementText: '按月上报', mappingOriginType: 'MANUAL', indicatorName: '只读显示字段' }]
  const result = appendScenarioIndicator(existing, '100000000000000002')
  assert.deepEqual(result[0], Object.fromEntries(Object.entries(existing[0]).filter(([key]) => key !== 'indicatorName')))
  assert.equal(result[1].displayOrder, 10)
  assert.equal(existing.length, 1)
  assert.equal(appendScenarioIndicator(result, '100000000000000002').length, 2)
})
test('scenario append refuses an overflowing replacement list', () => {
  assert.throws(() => appendScenarioIndicator(Array.from({ length: 500 }, (_, index) => ({ indicatorVersionId: String(index) })), 'new'), /500/)
})
test('pending policies restore only into their exact indicator version context', () => {
  const saved = { policyDraftVersionId: 'v1', form: { policyDrafts: [{ policyFileVersionId: '900000000000000001', citationText: '' }] } }
  assert.equal(restorePolicyDrafts(saved, 'v1').length, 1)
  assert.deepEqual(restorePolicyDrafts(saved, 'v2'), [])
  assert.deepEqual(restorePolicyDrafts(saved, ''), [])
  assert.deepEqual(restorePolicyDrafts({ form: { policies: ['旧静态政策'] } }, 'v1'), [])
})
