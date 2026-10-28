import test from 'node:test'
import assert from 'node:assert/strict'
import { activeUserRoles, newSystemUserPayload, validateNewSystemUser } from '../src/idmp/utils/systemUserCreate.js'
const roles = [
  { roleId: '1', role: { roleKey: 'SYSTEM_ADMIN', roleName: '系统管理员', status: '0' } },
  { roleId: '6', role: { roleKey: 'DEPARTMENT_ANALYST', roleName: '科室分析员', status: '0' } },
  { roleId: '8', role: { roleKey: 'READER', roleName: '已停用角色', status: '1' } }
]
const departments = [{ deptId: '10', dept: { deptName: '外科', status: '0' } }, { deptId: '11', dept: { deptName: '停用科室', status: '1' } }]
const form = () => ({ userName: '300115', nickName: '创建用户验收', password: 'password2026', confirmPassword: 'password2026', deptId: '10', roleIds: ['6'], enabled: true, phonenumber: '', email: '', remark: '' })

test('new user payload maps employee login number and existing roles to the identity API', () => {
  const input = form()
  assert.equal(validateNewSystemUser(input, roles, departments), '')
  assert.deepEqual(newSystemUserPayload(input), { password: input.password, user: { userName: '300115', nickName: '创建用户验收', deptId: '10', roleIds: ['6'], status: '0', sex: '2', phonenumber: '', email: '', remark: null } })
  input.enabled = false
  assert.equal(newSystemUserPayload(input).user.status, '1')
  assert.equal('confirmPassword' in newSystemUserPayload(input), false)
  assert.equal(activeUserRoles(roles).length, 2)
})

test('department required for ordinary roles while administrators can omit it', () => {
  assert.match(validateNewSystemUser({ ...form(), deptId: '' }, roles, departments), /所属科室/)
  assert.equal(validateNewSystemUser({ ...form(), deptId: '', roleIds: ['1'] }, roles, departments), '')
  for (const deptId of ['11', 'missing']) assert.match(validateNewSystemUser({ ...form(), deptId }, roles, departments), /有效科室/)
  for (const roleIds of [[], ['8'], ['missing']]) assert.match(validateNewSystemUser({ ...form(), roleIds }, roles, departments), /可用角色/)
})

test('password validation matches BCrypt byte limit and requires confirmation', () => {
  for (const password of ['short', 'a'.repeat(73), '密'.repeat(25)]) assert.match(validateNewSystemUser({ ...form(), password, confirmPassword: password }, roles, departments), /密码/)
  const password = '密'.repeat(24)
  assert.equal(validateNewSystemUser({ ...form(), password, confirmPassword: password }, roles, departments), '')
  assert.match(validateNewSystemUser({ ...form(), confirmPassword: 'different' }, roles, departments), /不一致/)
})

test('invalid employee number, empty names and malformed contact data do not pass', () => {
  for (const userName of ['', 'invalid user', 'a'.repeat(65)]) assert.match(validateNewSystemUser({ ...form(), userName }, roles, departments), /工号/)
  assert.match(validateNewSystemUser({ ...form(), nickName: ' ' }, roles, departments), /姓名/)
  assert.match(validateNewSystemUser({ ...form(), email: 'not-email' }, roles, departments), /邮箱/)
  assert.match(validateNewSystemUser({ ...form(), remark: '长'.repeat(501) }, roles, departments), /备注/)
})
