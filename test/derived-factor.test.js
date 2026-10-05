import test from 'node:test'
import assert from 'node:assert/strict'
import { newDerivedFactor, newExpression, validateDerivedFactor, configurableSourceFactors, activeSourceBindings } from '../src/idmp/utils/derivedFactor.js'
import { inheritedFactorParameters } from '../src/idmp/utils/factorRuntimeParameters.js'
const source = (id, grain = [], status = 'PUBLISHED') => ({ id, status, output: { grain } })
const fixture = () => ({ ...newDerivedFactor(), primaryDomain: { domainCode: 'INPATIENT_VISIT' },
  expression: { nodeType: 'BINARY', operator: 'DIV', zeroDenominatorPolicy: 'RETURN_NULL', left: { nodeType: 'FACTOR_REF', factorVersionId: '102027642461800096' }, right: { nodeType: 'FACTOR_REF', factorVersionId: '102027642461800094' } } })
const versions = [source('102027642461800096'), source('102027642461800094')]
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
