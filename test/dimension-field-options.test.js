import test from 'node:test'
import assert from 'node:assert/strict'
import { dimensionFieldTableGroups, dimensionFieldTableKey } from '../src/idmp/utils/dimensionFieldOptions.js'

const option = (tableName, alias, columnName) => ({ tableName, columnName, fieldReference: `${alias}.${columnName}` })

test('按实际物理表拆分主表和 JOIN 字段，保留提交引用', () => {
  const groups = dimensionFieldTableGroups({ fields: [option('admissions', 'b', 'dept'), option('transfers', 't', 'dept'), option('admissions', 'b', 'doctor')] })
  assert.deepEqual(groups.map(group => group.label), ['admissions', 'transfers'])
  assert.deepEqual(groups[0].fields.map(field => field.fieldReference), ['b.dept', 'b.doctor'])
  assert.deepEqual(groups[1].fields.map(field => field.fieldReference), ['t.dept'])
  assert.equal(dimensionFieldTableKey(groups, 't.dept'), groups[1].key)
})

test('同一物理表自关联时按别名区分，不混合两侧字段', () => {
  const groups = dimensionFieldTableGroups({ fields: [option('staff', 'doctor', 'id'), option('staff', 'supervisor', 'id')] })
  assert.deepEqual(groups.map(group => group.label), ['staff（doctor）', 'staff（supervisor）'])
  assert.notEqual(groups[0].key, groups[1].key)
  assert.equal(dimensionFieldTableKey(groups, 'supervisor.id'), groups[1].key)
})

test('兼容字段包级物理表名称和旧 fieldCode 引用', () => {
  const groups = dimensionFieldTableGroups({ tableName: 'visits', fields: [{ fieldCode: 'DEPT', columnName: 'dept' }] })
  assert.equal(groups[0].label, 'visits')
  assert.equal(groups[0].fields[0].fieldReference, 'DEPT')
  assert.equal(dimensionFieldTableKey(groups, 'DEPT'), groups[0].key)
})

test('缺少物理表元数据时不把别名误报为物理表名', () => {
  const groups = dimensionFieldTableGroups({ fields: [{ fieldReference: 'b.dept' }] })
  assert.equal(groups[0].tableName, '')
  assert.equal(groups[0].label, '未提供物理表名称')
  assert.equal(groups[0].sourceAlias, 'b')
})

test('支持带数据库限定名的字段引用，不截断提交内容', () => {
  const groups = dimensionFieldTableGroups({ fields: [option('visits', 'hospital.visits', 'dept')] })
  assert.equal(groups[0].fields[0].fieldReference, 'hospital.visits.dept')
  assert.equal(dimensionFieldTableKey(groups, 'hospital.visits.dept'), groups[0].key)
})

test('空候选与找不到的已保存引用不匹配任何物理表', () => {
  assert.deepEqual(dimensionFieldTableGroups(), [])
  assert.deepEqual(dimensionFieldTableGroups({ fields: [{}] }), [])
  assert.equal(dimensionFieldTableKey(dimensionFieldTableGroups({ fields: [option('visits', 'b', 'dept')] }), 't.dept'), '')
})
