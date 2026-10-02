const labels = {
  dataSources: '数据来源', dataSourceId: '数据源', sourceCategory: '数据来源分类', resourceVersion: '数据版本', metadataResourceVersion: '基本信息版本',
  periodStart: '开始日期', periodEnd: '结束日期', periodType: '统计周期', granularity: '时间粒度',
  dimensionGrain: '组合粒度', dimensionBindings: '维度字段映射', grainSelection: '组合粒度筛选方式', dimensionHash: '维度组合',
  drillPaths: '下钻路径', pathVersionId: '下钻路径版本', maxLevel: '最大下钻层级', currentLevel: '当前下钻层级',
  fieldCode: '字段', factorVersionId: '因子版本', indicatorVersionId: '指标版本', indicatorId: '指标', factorId: '因子',
  snapshotId: '计算快照', calculationMode: '计算模式', missingRowPolicy: '缺失值处理方式', cronExpression: '执行时间规则',
  ownerType: '计算对象类型', ownerVersionId: '计算对象版本', batchType: '计算类型', dimensions: '维度条件',
  schemaVersion: '配置格式版本', primaryDomain: '主数据表', aggregation: '聚合方式', groupBy: '分组字段',
  sort: '排序规则', name: '名称', code: '编码', formula: '计算公式', deleteReason: '删除原因', page: '页码', size: '每页数量', id: '标识'
}
const modes = { NON_MERGEABLE: '不可精确合并', DAILY: '日', WEEKLY: '周', MONTHLY: '月', QUARTERLY: '季度', YEARLY: '年', CUSTOM: '自定义周期', STATIC: '静态', TEMPORAL: '时序', TRIAL: '试算', FULL: '正式计算', RECALC: '重算', FACTOR: '因子', INDICATOR: '指标', ACTIVE: '生效', BASE: '基础结果', KEEP_NULL: '保留空值', ZERO: '按零处理', ALL: '全部', EXACT: '指定组合' }
export const DEFAULT_ERROR_MESSAGE = '操作未能完成，请检查填写的信息后重试；若持续失败，请联系管理员。'
const hasChinese = text => /[\u3400-\u9fff]/.test(text)
const tokenPattern = token => new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`, 'g')

export function fieldLabel(path = '') {
  const names = String(path).replace(/\[\d+\]/g, '').split(/[./]/).map(name => labels[name]).filter(Boolean)
  const name = [...new Set(names)].join('的') || '填写的信息'
  const index = String(path).match(/\[(\d+)\]/)
  return index ? `第${Number(index[1]) + 1}项${name}` : name
}

export function toUserMessage(value, fallback = DEFAULT_ERROR_MESSAGE) {
  let text = String(value?.message ?? value ?? '').trim().replace(/\s*[（(]traceId\s*:\s*[^）)]+[）)]/gi, '')
  if (!text) return fallback
  if (/SQLSTATE|bad SQL grammar|StatementCallback|jdbc:|Communications link failure|connection refused|access denied for user|unknown column|deadlock|Hikari|SQLException|DataAccessException/i.test(text)) return '数据读取或计算失败，请稍后重试；若持续失败，请联系管理员检查数据源。'
  if (/Encountered unexpected token|Was expecting one of|JSQLParser/i.test(text)) return 'SQL 语句格式有误，请检查语法后重试。'
  if (/Cron expression/i.test(text)) return '执行时间规则无效，请重新设置执行时间。'
  if (/GridStack|invalid .*dashboard schema|dashboard migration|invalid layout template|template instantiation|not JSON persistable|circular reference|undeclared persisted|widgets\[\d+\]\.|layout\.\w+.*(?:must|invalid|required)|schema must|normalization requires/i.test(text)) return '看板布局或组件配置无效，请重新检查配置后保存；若持续失败，请联系管理员。'
  if (/\b[A-Za-z.$]*Exception\b|\bat [\w.$]+\([^)]*\.java:\d+\)|TypeError|NetworkError|Cannot read properties|is not a function/i.test(text)) return fallback
  const bodyField = text.match(/^请求体字段\s+([^\s]+)\s+格式错误/)
  if (bodyField) return `${fieldLabel(bodyField[1])}格式不正确，请重新选择或填写。`
  const constraint = text.match(/^([\w.[\]]+):\s*(must|size|length|不得|不能为)/i)
  if (constraint) return `${fieldLabel(constraint[1])}${/not (?:be )?(?:null|blank|empty)/i.test(text) ? '不能为空' : '填写内容不符合要求'}，请检查后再提交。`
  if (/missingRowPolicy must|Use ZERO or KEEP_NULL/.test(text)) return '请选择缺失值处理方式：按零处理或保留空值。'
  if (/SQL import task not found/i.test(text)) return '导入会话不存在或已失效，请重新导入 SQL。'
  if (!hasChinese(text)) return fallback
  if (/JSON\s*序列化失败/.test(text)) return '配置信息暂时无法保存，请稍后重试。'
  for (const [token, label] of Object.entries({ ...labels, ...modes })) text = text.replace(tokenPattern(token), label)
  return text.replace(/请求超时[（(]\d+ms[）)]/, '请求超时，请稍后重试。')
}

// Only diagnostic fields are transformed; SQL, formulas and result rows stay intact.
export function sanitizeResponseMessages(value) {
  const seen = new WeakSet()
  const excluded = new Set(['dsl', 'factorDsl', 'formula', 'formulaAst', 'template', 'authoringDsl', 'parameters', 'rows', 'dimensionBindings'])
  const fields = new Set(['message', 'errorMessage', 'error', 'reason', 'suggestion', 'retainedReason'])
  function visit(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    for (const [key, child] of Object.entries(node)) {
      if (excluded.has(key)) continue
      if (fields.has(key) && typeof child === 'string' && child && !['success', 'accepted'].includes(child)) {
        // Reasons can also be machine codes or user-authored explanations.
        if (key !== 'reason' || Object.hasOwn(node, 'factorVersionId')) node[key] = toUserMessage(child)
      }
      else if (key === 'diagnostics' && Array.isArray(child)) node[key] = child.map(item => typeof item === 'string' ? toUserMessage(item) : (visit(item), item))
      else visit(child)
    }
  }
  visit(value)
  return value
}
