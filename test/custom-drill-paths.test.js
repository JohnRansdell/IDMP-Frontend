import test from 'node:test'
import assert from 'node:assert/strict'
import { createCustomDrillCode, serializeDrillPaths, sqlImportGroupingFields, sqlImportGroupingFieldLabels } from '../src/idmp/features/indicator/grouping.js'
import { buildIndicatorVersionPayload } from '../src/idmp/api/adapters/indicator.js'
import { buildSqlImportMetadataPayload } from '../src/idmp/api/adapters/sqlImport.js'

const path = { pathCode: 'CUSTOM_DEPT_DOCTOR', pathName: '科室医生下钻', maxLevel: 'DOCTOR', levels: [
  { levelCode: 'ROOT', levelName: '全院' },
  { levelCode: 'DEPT', levelName: '科室', dimensionFieldCode: '科室', displayFieldCode: '科室名称' },
  { levelCode: 'DOCTOR', levelName: '医生', dimensionFieldCode: '医生' }
] }

test('codes work with crypto available on HTTP pages without randomUUID', () => {
  const code = createCustomDrillCode('CUSTOM', { getRandomValues: bytes => bytes.fill(0xab) })
  assert.equal(code, `CUSTOM_${'AB'.repeat(16)}`)
  assert.match(createCustomDrillCode('LEVEL'), /^LEVEL_[A-F0-9]{32}$/)
})

test('custom paths serialize business names and direct logical fields without semantic IDs', () => {
  assert.deepEqual(serializeDrillPaths([path]), [path])
  assert.deepEqual(sqlImportGroupingFields([path], ['病种']), ['病种', '科室', '科室名称', '医生'])
  assert.equal(sqlImportGroupingFieldLabels([path], []).科室名称, '科室名称')
  assert.deepEqual(serializeDrillPaths([{ ...path, pathVersionId: '901' }]), [{ pathCode: path.pathCode, pathName: path.pathName, maxLevel: 'DOCTOR', pathVersionId: '901' }])
})

test('maximum level and reordered paths determine mapping fields independently of combination grain', () => {
  assert.deepEqual(sqlImportGroupingFields([{ ...path, maxLevel: 'DEPT' }], ['病种']), ['病种', '科室', '科室名称'])
  assert.deepEqual(sqlImportGroupingFields([{ ...path, maxLevel: 'DEPT', levels: [path.levels[0], path.levels[2], path.levels[1]] }]), ['医生', '科室', '科室名称'])
})

test('custom path validation rejects unnamed repeated and invalid dimensions', () => {
  assert.throws(() => serializeDrillPaths([{ ...path, pathName: '' }]), /路径名称/)
  assert.throws(() => serializeDrillPaths([{ ...path, levels: [path.levels[0]] }]), /业务层级/)
  assert.throws(() => serializeDrillPaths([{ ...path, levels: [path.levels[0], path.levels[1], { ...path.levels[2], dimensionFieldCode: '科室' }] }]), /不能重复/)
  assert.throws(() => serializeDrillPaths([{ ...path, levels: [path.levels[0], { ...path.levels[1], dimensionFieldCode: 'dept;DELETE' }] }]), /只能包含/)
})

test('ordinary versions submit factor-version-local bindings while SQL imports submit factor-key bindings', () => {
  const bindings = { '101': { 科室: 'b.dept_code', 医生: 'b.doctor_code' }, '102': { 科室: 'a.department', 医生: 't.doctor' } }
  const version = buildIndicatorVersionPayload({ drillPaths: [path], factorDimensionBindings: bindings, dimensionGrain: ['科室'] })
  assert.deepEqual(version.factorDimensionBindings, bindings)
  assert.deepEqual(version.drillPaths, [path])
  const metadata = buildSqlImportMetadataPayload({ scope: 'FACTORS_AND_INDICATOR', category: '质量', indicator: { code: 'RATE', name: '比例', drillPaths: [path], dimensionGrain: ['科室'] }, factors: [{ key: 'total', code: 'TOTAL', name: '总数', calculationMode: 'STATIC', dimensionBindings: bindings['101'] }, { key: 'matching', code: 'MATCHING', name: '符合数', calculationMode: 'STATIC', dimensionBindings: bindings['102'] }] })
  assert.deepEqual(metadata.drillPaths, [path])
  assert.deepEqual(metadata.factors.map(factor => factor.dimensionBindings), Object.values(bindings))
})
