const labels = {
  deptcode: '科室编码', departmentcode: '科室编码', deptname: '科室名称', departmentname: '科室名称',
  doctorcode: '医师编码', doctorno: '医师工号', doctorname: '医师姓名',
  startdate: '开始日期', enddate: '结束日期', starttime: '开始时间', endtime: '结束时间'
}

export function runtimeParameterDisplayName(parameter = {}) {
  const code = String(parameter.code || '').trim()
  for (const value of [parameter.displayName, parameter.label, parameter.name]) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text && text !== code) return text
  }
  return ''
}

export function runtimeParameterLabel(parameter = {}) {
  const code = String(parameter.code || '').trim()
  return runtimeParameterDisplayName(parameter) || labels[code.replace(/_/g, '').toLowerCase()] || code || '运行参数'
}
