import test from 'node:test'
import assert from 'node:assert/strict'
import { tableRelationPayload, relationValidationMessage } from '../src/idmp/utils/tableRelation.js'

const source = { physicalTableBindingId: '102027642461312817' }, target = { id: '102027642461312818' }
const fields = [
  { semanticFieldCode: 'VISIT_KEY', physicalColumn: 'visit_id', relationDataType: 'STRING' },
  { semanticFieldCode: 'DEPT', physicalColumn: 'dept_code', relationDataType: 'STRING' },
  { semanticFieldCode: 'TIME', physicalColumn: 'in_date', relationDataType: 'DATETIME' }
]
const form = () => ({ joinType: 'LEFT', cardinality: 'MANY_TO_ONE', keys: [{ left: 'VISIT_KEY', right: 'VISIT_KEY' }] })
test('物理表关联由后端生成资源编码，业务字段编码保持不变', () => {
  const payload = tableRelationPayload(source, target, form(), fields, fields)
  assert.equal(Object.hasOwn(payload, 'code'), false)
  assert.deepEqual(payload.leftKeySpec.fieldCodes, ['VISIT_KEY'])
})
test('关联接口提交内部字段编码，保留大整数绑定 ID', () => {
  const payload = tableRelationPayload(source, target, form(), fields, fields)
  assert.equal(payload.leftPhysicalTableBindingId, source.physicalTableBindingId)
  assert.deepEqual(payload.leftKeySpec, { fieldCodes: ['VISIT_KEY'] })
  assert.deepEqual(payload.rightKeySpec, { fieldCodes: ['VISIT_KEY'] })
})
test('复合关联键按顺序一一对应，支持内关联和一对一', () => {
  const input = form(); input.joinType = 'INNER'; input.cardinality = 'ONE_TO_ONE'; input.keys.push({ left: 'DEPT', right: 'DEPT' })
  const payload = tableRelationPayload(source, target, input, fields, fields)
  assert.deepEqual(payload.leftKeySpec.fieldCodes, ['VISIT_KEY', 'DEPT'])
  assert.deepEqual(payload.rightKeySpec.fieldCodes, ['VISIT_KEY', 'DEPT'])
})
for (const [name, modify, message] of [
  ['未选目标表', input => input.target = null, /物理表/],
  ['同表关联', input => input.target = { id: source.physicalTableBindingId }, /不能.*相同/],
  ['一对多', input => input.form.cardinality = 'ONE_TO_MANY', /一对一或多对一/],
  ['多对多', input => input.form.cardinality = 'MANY_TO_MANY', /一对一或多对一/],
  ['无关联键', input => input.form.keys = [], /至少/],
  ['空关联键', input => input.form.keys[0].right = '', /完整/],
  ['不存在的字段', input => input.form.keys[0].left = 'UNKNOWN', /完整/],
  ['类型不一致', input => input.form.keys[0].right = 'TIME', /类型不一致/],
  ['重复的关联字段', input => input.form.keys.push({ left: 'VISIT_KEY', right: 'DEPT' }), /重复/],
  ['不允许的 JOIN', input => input.form.joinType = 'CROSS', /关联方式/]
]) test(`拒绝${name}`, () => {
  const input = { source, target, form: form() }; modify(input)
  assert.throws(() => tableRelationPayload(input.source, input.target, input.form, fields, fields), message)
})
test('校验失败展示业务诊断，不展示诊断码或警告', () => {
  assert.equal(relationValidationMessage({ diagnostics: [{ severity: 'ERROR', code: 'META-001', message: '关联字段未发布' }, { severity: 'WARNING', message: '警告' }] }), '关联字段未发布')
  assert.match(relationValidationMessage({}), /校验未通过/)
})
