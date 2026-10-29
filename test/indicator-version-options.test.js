import test from 'node:test'
import assert from 'node:assert/strict'
import { groupIndicatorVersions } from '../src/idmp/utils/indicatorVersionOptions.js'
test('indicator options group by identity, not display name, and preserve opaque version IDs', () => {
  const groups = groupIndicatorVersions([
    { id:'90071992547409931', indicatorId:'10', indicatorName:'住院死亡率', versionNo:1 },
    { id:'90071992547409932', indicatorId:'10', indicatorName:'住院死亡率', versionNo:2 },
    { id:'90071992547409933', indicatorId:'11', indicatorName:'住院死亡率', versionNo:1 }
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups[0].versions.map(x => x.id), ['90071992547409932','90071992547409931'])
  assert.equal(groups[1].versions.length, 1)
})
