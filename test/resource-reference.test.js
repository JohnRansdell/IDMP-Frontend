import test from 'node:test'
import assert from 'node:assert/strict'
import {referenceOptions} from '../src/idmp/utils/resourceReference.js'

test('resource selectors keep opaque IDs internal and show names and version numbers', () => {
  assert.deepEqual(referenceOptions([{id:'102027642463201863',indicatorName:'男性出院占比',versionNo:2}],'INDICATOR_VERSION'),[{value:'102027642463201863',label:'男性出院占比 · 版本 2'}])
  assert.deepEqual(referenceOptions([{id:'123',scenarioName:'质量安全',versionNo:3}],'SCENARIO_VERSION'),[{value:'123',label:'质量安全 · 版本 3'}])
  assert.deepEqual(referenceOptions([{ruleId:'456',ruleName:'转科比例预警'}],'RULE'),[{value:'456',label:'转科比例预警'}])
  assert.deepEqual(referenceOptions([{}],'RULE'),[])
})
