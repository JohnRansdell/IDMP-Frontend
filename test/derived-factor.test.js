import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { newDerivedFactor, newExpression, validateDerivedFactor, configurableSourceFactors, activeSourceBindings } from '../src/idmp/utils/derivedFactor.js'
import { inheritedFactorParameters } from '../src/idmp/utils/factorRuntimeParameters.js'
import { getFactorTypeLabel } from '../src/idmp/utils/factorType.js'
const source = (id, grain = [], status = 'PUBLISHED') => ({ id, status, output: { grain } })
const fixture = () => ({ ...newDerivedFactor(), primaryDomain: { domainCode: 'INPATIENT_VISIT' },
  expression: { nodeType: 'BINARY', operator: 'DIV', zeroDenominatorPolicy: 'RETURN_NULL', left: { nodeType: 'FACTOR_REF', factorVersionId: '102027642461800096' }, right: { nodeType: 'FACTOR_REF', factorVersionId: '102027642461800094' } } })
const versions = [source('102027642461800096'), source('102027642461800094')]

test('factor list uses returned definition kind and does not guess missing types', () => {
  assert.equal(getFactorTypeLabel('SOURCE'), '原子因子')
  assert.equal(getFactorTypeLabel('DERIVED'), '复合因子')
  assert.equal(getFactorTypeLabel('源表因子'), '原子因子')
  assert.equal(getFactorTypeLabel('组合因子'), '复合因子')
  assert.equal(getFactorTypeLabel(undefined), '-')
  assert.equal(getFactorTypeLabel('UNKNOWN'), '-')
  const management = readFileSync(new URL('../src/idmp/views/FactorManagement.vue', import.meta.url), 'utf8')
  assert.match(management, /getFactorTypeLabel\(item\.definitionKind \|\| item\.factorKind \|\| item\.type\)/)
})

test('factor type labels consistently use atomic and composite terminology', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
  const editor = read('../src/idmp/views/FactorEditor.vue')
  const management = read('../src/idmp/views/FactorManagement.vue')
  const trace = read('../src/idmp/components/FactorTraceTree.vue')
  const demo = read('../src/idmp/data/demo.js')
  assert.match(editor, /label="SOURCE">原子因子/)
  assert.match(editor, /label="DERIVED">复合因子/)
  assert.match(management, /label="复合因子" value="复合因子"/)
  assert.match(trace, /'复合因子' : '原子因子'/)
  assert.doesNotMatch(editor + trace + demo, /源表因子|组合因子/)
  assert.doesNotMatch(management, /label="(?:源表因子|组合因子)"/)
})
test('derived definition has no SQL source configuration', () => {
  const dsl = newDerivedFactor()
  assert.equal(dsl.definitionKind, 'DERIVED')
  for (const field of ['aggregation','filters','joins','periodColumn','sqlTemplate']) assert.equal(dsl[field], undefined)
})
test('valid ratio preserves bigint string references', () => {
  const dsl = validateDerivedFactor(fixture(), versions)
  assert.equal(dsl.expression.left.factorVersionId, '102027642461800096')
})
test('draft upstream is rejected', () => assert.throws(() => validateDerivedFactor(fixture(), [versions[0], source(versions[1].id, [], 'DRAFT')]), /已发布/))
test('zero denominator policy must be explicit', () => { const dsl = fixture(); delete dsl.expression.zeroDenominatorPolicy; assert.throws(() => validateDerivedFactor(dsl, versions), /分母为零/) })
test('grain mismatch rejects incorrect alignment', () => { const dsl = fixture(); dsl.output.grain=['科室']; assert.throws(() => validateDerivedFactor(dsl, versions), /粒度/) })
test('scalar broadcast allows ungrouped upstream', () => { const dsl=fixture(); dsl.output.grain=['科室']; dsl.expression.left.alignmentPolicy='SCALAR_BROADCAST'; dsl.expression.right.alignmentPolicy='SCALAR_BROADCAST'; assert.equal(validateDerivedFactor(dsl,versions),dsl) })
test('scalar broadcast rejects grouped upstream', () => { const dsl=fixture(); dsl.expression.left.alignmentPolicy='SCALAR_BROADCAST'; assert.throws(() => validateDerivedFactor(dsl,[source(versions[0].id,['科室']),versions[1]]), /总体广播/) })
test('constant-only expression is rejected', () => { const dsl=fixture();dsl.expression=newExpression('CONST');assert.throws(()=>validateDerivedFactor(dsl,versions),/至少需要引用/) })
test('nested functions and comparison round-trip without discarding expression nodes', () => { const dsl=fixture();dsl.expression={nodeType:'CONDITION',condition:{nodeType:'COMPARE',comparator:'GT',left:dsl.expression.left,right:newExpression('CONST')},whenTrue:{nodeType:'FUNCTION',functionCode:'ROUND',arguments:[dsl.expression,newExpression('CONST')]},whenFalse:newExpression('CONST')};assert.equal(validateDerivedFactor(dsl,versions),dsl) })
test('invalid numeric constants are rejected', () => { const dsl=fixture();dsl.expression.right={nodeType:'CONST',value:'abc'};assert.throws(()=>validateDerivedFactor(dsl,versions),/有效的数值/) })
test('function arity is validated', () => { const dsl=fixture();dsl.expression={nodeType:'FUNCTION',functionCode:'IF',arguments:[dsl.expression.left]};assert.throws(()=>validateDerivedFactor(dsl,versions),/数量/) })
test('bindings target leaf versions, not derived roots', () => {
  const factors=configurableSourceFactors([{versionId:'C',name:'比例'}],{factorVersionIds:['A','B'],fieldOptions:[{factorVersionId:'A',factorName:'入院人数'}]})
  assert.deepEqual(factors.map(item=>item.versionId),['A','B'])
  assert.equal(factors[0].name,'入院人数')
  assert.deepEqual(activeSourceBindings({A:{科室:'b.out_dept',obsolete:'bad'},B:{科室:'b.in_dept'},C:{科室:'wrong'},X:{科室:'bad'}},factors,['科室']),{A:{科室:'b.out_dept'},B:{科室:'b.in_dept'}})
})
test('ordinary factor mapping falls back to direct roots before capability load', () => assert.deepEqual(configurableSourceFactors([{versionId:'A',name:'人数'}]).map(item=>item.versionId),['A']))
test('old derived artifacts inherit parameters from frozen source dependencies', async () => {
  const leaf={id:'A',artifactHash:'sha256:a',parameterSchema:{parameters:[{code:'patientName',type:'STRING',required:false,parameterMode:'TEMPORARY'},{code:'period',type:'PERIOD'}]}}
  const root={id:'C',logicalPlan:{factorDependencies:[{factorVersionId:'A',artifactHash:'sha256:a'}]}}
  assert.deepEqual((await inheritedFactorParameters(root,async()=>leaf)).map(item=>item.code),['patientName'])
})

test('source factors expose business parameters but not system-provided inputs', async () => {
  const patientName={code:'patientName',type:'STRING',required:false,parameterMode:'TEMPORARY'}
  const requiredDate={code:'admissionDate',type:'DATETIME',required:true,systemProvided:false,parameterMode:'TEMPORARY'}
  const root={id:'A',parameterSchema:{parameters:[patientName,requiredDate,
    {code:'period',type:'DATETIME_RANGE',required:true,systemProvided:true},
    {code:'executionContext',type:'STRING',required:true,systemProvided:true}]}}
  assert.deepEqual(await inheritedFactorParameters(root,async()=>assert.fail('no dependencies')), [patientName,requiredDate])
})

test('composite factors exclude system inputs at every dependency level', async () => {
  const period={code:'period',type:'DATETIME_RANGE',required:true,systemProvided:true}
  const patientName={code:'patientName',type:'STRING',required:false,parameterMode:'TEMPORARY'}
  const root={id:'C',parameterSchema:{parameters:[period]},logicalPlan:{factorDependencies:[{factorVersionId:'B'}]}}
  const artifacts={
    B:{id:'B',parameterSchema:{parameters:[period]},logicalPlan:{factorDependencies:[{factorVersionId:'A'}]}},
    A:{id:'A',parameterSchema:{parameters:[patientName,period]}}
  }
  assert.deepEqual(await inheritedFactorParameters(root,async id=>artifacts[id]), [patientName])
})

test('legacy period ranges without the system flag remain hidden', async () => {
  const root={id:'A',parameterSchema:{parameters:[
    {code:'period',type:'DATETIME_RANGE',required:true},
    {code:'periodStart',type:'DATETIME',required:true},
    {code:'periodEnd',type:'DATETIME',required:true},
    {code:'patientName',type:'STRING',required:false}
  ]}}
  assert.deepEqual((await inheritedFactorParameters(root,async()=>assert.fail('no dependencies'))).map(item=>item.code), ['patientName'])
})
test('parameter type conflict is explicit instead of picking the last upstream', async () => {
  const root={id:'C',logicalPlan:{factorDependencies:[{factorVersionId:'A'},{factorVersionId:'B'}]}}
  await assert.rejects(inheritedFactorParameters(root,async id=>({id,parameterSchema:{parameters:[{code:'x',type:id==='A'?'STRING':'INTEGER'}]}})),/类型不一致/)
})
test('frozen artifact mismatch is not silently accepted', async () => {
  const root={id:'C',logicalPlan:{factorDependencies:[{factorVersionId:'A',artifactHash:'sha256:old'}]}}
  await assert.rejects(inheritedFactorParameters(root,async()=>({id:'A',artifactHash:'sha256:new'})),/重新编译/)
})
test('inherited required flags are combined conservatively', async () => {
  const root={id:'C',parameterSchema:{parameters:[{code:'x',type:'STRING',required:false,parameterMode:'PERSISTED'}]},logicalPlan:{factorDependencies:[{factorVersionId:'A'}]}}
  const result=await inheritedFactorParameters(root,async()=>({id:'A',parameterSchema:{parameters:[{code:'x',type:'STRING',required:true,parameterMode:'TEMPORARY'}]}}))
  assert.equal(result[0].required,true);assert.equal(result[0].parameterMode,'TEMPORARY')
})
test('cycle in a frozen dependency graph is rejected', async () => {
  const root={id:'A',logicalPlan:{factorDependencies:[{factorVersionId:'A'}]}}
  await assert.rejects(inheritedFactorParameters(root,async()=>root),/循环/)
})
