import { arithmeticFormulaText } from '../indicator/arithmeticFormula.js'

export const differenceFieldLabels = {
  name: '名称', factorName: '因子名称', versionNo: '版本', factorRole: '因子用途', timeBinding: '时间绑定', defaultGrain: '默认粒度',
  parameterValue: '参数值', aggregateMethod: '聚合方式', outputDescriptor: '输出定义', filterConditionDsl: '过滤条件',
  calculationExpressionAst: '计算定义', filterConditionDisplayText: '过滤说明', calculationExpressionDisplayText: '计算说明',
  policyFileName: '政策名称', policyVersionNo: '政策版本', citationText: '引用内容', citationLocation: '引用位置', relationRole: '引用类型',
  output: '输出', grain: '分组', nullable: '允许空值', dimension: '维度', valueType: '数据类型', semanticKind: '语义类型',
  dslType: '定义类型', parameters: '参数', sqlTemplate: '查询 SQL', importSource: '导入来源', cte: '查询步骤', type: '类型', column: '字段',
  periodColumn: '统计时间字段', definitionType: '定义方式', calculationMode: '计算模式', missingRowPolicy: '缺失处理',
  dimensionBindings: '维度绑定', confirmedTimeField: '确认时间字段', scale: '小数位数', format: '展示格式', multiplier: '展示乘数', roundingMode: '舍入方式',
  root: '公式', display: '展示格式', left: '左侧', right: '右侧', operand: '操作数', arguments: '参数', nodeType: '表达式类型',
  operator: '运算符', functionCode: '函数', comparator: '比较方式', value: '值', condition: '条件', whenTrue: '满足时', whenFalse: '否则',
  zeroDenominatorPolicy: '除零处理', nullConditionPolicy: '条件为空时', factorVersionId: '引用因子', typeDescriptor: '类型定义', precision: '精度', unit: '单位', percentile: '分位数'
}
const technicalFields = new Set(['id', 'nodeId', 'schemaVersion', 'factorCode', 'indicatorCode', 'policyFileCode', 'factorVersionId', 'indicatorVersionId', 'policyFileVersionId', 'sourceNodePath', 'importId', 'factorKey'])
export const visibleDifferenceEntries = value => Object.entries(value || {}).filter(([key]) => !technicalFields.has(key))
export const differenceFieldLabel = key => Object.hasOwn(differenceFieldLabels, key) ? differenceFieldLabels[key] : key
const values = { ADD: '加', SUB: '减', MUL: '乘', DIV: '除', RETURN_NULL: '返回空值', RETURN_ZERO: '返回 0', ERROR: '报错',
  HALF_UP: '四舍五入', HALF_EVEN: '半值取偶数', NUMBER: '数值', PERCENT: '百分比', FORMULA_REF: '公式引用', REFERENCE: '参考依据',
  SOURCE: '来源依据', DEFINITION: '定义依据', INTERPRETATION: '解释依据', TEMPORAL: '按统计周期计算', STATIC: '静态',
  MONTHLY: '月', QUARTERLY: '季度', YEARLY: '年', DAILY: '日', KEEP_NULL: '保留空值', WHEN_FALSE: '使用否则分支',
  MEASURE: '度量', DECIMAL: '小数', INTEGER: '整数', BOOLEAN: '布尔值', NATIVE_SQL: 'SQL 查询', FACTOR: '因子', SQL: 'SQL', ONE: '无量纲' }
export function differenceScalar(value) {
  if (value === undefined || value === null || value === '') return '未配置'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return Object.hasOwn(values, value) ? values[value] : String(value)
}
export function sameDifferenceValue(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameDifferenceValue(a[key], b[key]))
}

// Compare calculation structure, never infer mathematical equivalence from its spelling.
export function formulaDifferences(source, target, sourceFactors = [], targetFactors = []) {
  const changes = []
  const describe = (value, factors) => value?.nodeType ? arithmeticFormulaText(value, factors) : typeof value === 'object' && value !== null ? JSON.stringify(value) : differenceScalar(value)
  const walk = (a, b, path) => {
    if (sameDifferenceValue(a, b)) return
    if (a?.nodeType && b?.nodeType && (a.nodeType !== b.nodeType || a.nodeType === 'FACTOR_REF')) {
      if (a.nodeType === b.nodeType && a.factorVersionId === b.factorVersionId) return
      changes.push({ path, source: describe(a, sourceFactors), target: describe(b, targetFactors) }); return
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (['nodeId', 'schemaVersion', 'astType'].includes(key)) continue
        walk(a[key], b[key], [...path, /^\d+$/.test(key) ? `第 ${Number(key) + 1} 项` : differenceFieldLabel(key)])
      }
    } else changes.push({ path, source: describe(a, sourceFactors), target: describe(b, targetFactors) })
  }
  walk(source, target, [])
  return changes
}
