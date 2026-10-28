export function activeUserRoles(roles) {
  return roles.filter(item => item.role.status === '0').map(item => ({ id: String(item.roleId), name: item.role.roleName, key: item.role.roleKey }))
}

export function validateNewSystemUser(form, roles, departments) {
  const userName = form.userName.trim(), nickName = form.nickName.trim()
  if (!userName || !/^[A-Za-z0-9_@.-]{1,64}$/.test(userName)) return '请输入有效工号，支持字母、数字及 _ @ . -'
  if (!nickName || nickName.length > 128) return '请输入姓名，最多128个字符'
  if (form.password.length < 8 || new TextEncoder().encode(form.password).length > 72) return '密码至少8个字符，最多72个UTF-8字节'
  if (form.password !== form.confirmPassword) return '两次输入的密码不一致'
  const options = activeUserRoles(roles)
  if (!form.roleIds.length || form.roleIds.some(id => !options.some(role => role.id === id))) return '请至少选择一个可用角色'
  const admin = form.roleIds.some(id => options.some(role => role.id === id && ['ADMIN', 'SYSTEM_ADMIN'].includes(role.key)))
  if (!admin && !form.deptId) return '请选择所属科室'
  if (form.deptId && !departments.some(item => String(item.deptId) === form.deptId && item.dept.status === '0')) return '请选择有效科室'
  if (form.phonenumber.length > 32) return '手机号最多32个字符'
  if (form.email.length > 128 || form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return '请输入有效邮箱'
  if (form.remark.length > 500) return '备注最多500个字符'
  return ''
}

export function newSystemUserPayload(form) {
  return { password: form.password, user: {
    userName: form.userName.trim(), nickName: form.nickName.trim(), deptId: form.deptId || null,
    roleIds: [...form.roleIds], status: form.enabled ? '0' : '1', sex: '2',
    phonenumber: form.phonenumber.trim(), email: form.email.trim(), remark: form.remark.trim() || null
  } }
}
