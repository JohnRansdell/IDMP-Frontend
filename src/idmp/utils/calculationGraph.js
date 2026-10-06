import dagre from '@dagrejs/dagre'

export const NODE_LABELS = { FACTOR: '原子因子', DERIVED_FACTOR: '复合因子', FORMULA: '指标公式', INDICATOR: '指标公式', QUALITY_CHECK: '质量校验' }
const PERIOD_LABELS = { YEAR: '年度', YEARLY: '年度', QUARTER: '季度', QUARTERLY: '季度', MONTH: '月度', MONTHLY: '月度', DAY: '日度', DAILY: '日度', STATIC: '静态' }

export function targetTitle(target, index = 0) {
  if (target.targetCode === 'BASE') return '基础汇总'
  if (target.drillPathName || target.drillLevelName) return [target.drillPathName, target.drillLevelName].filter(Boolean).join(' · ')
  return `计算目标 ${index + 1}`
}

export function targetPeriod(target) {
  return [PERIOD_LABELS[target.periodType] || '', target.periodStart && target.periodEnd ? `${target.periodStart} 至 ${target.periodEnd}（不含）` : ''].filter(Boolean).join(' · ')
}

export function layoutCalculationGraph(input = []) {
  const graph = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 58, marginx: 22, marginy: 22 }).setDefaultEdgeLabel(() => ({}))
  const nodes = [], codes = new Set(), problems = new Set()
  for (const node of input) {
    if (!node.nodeCode || codes.has(node.nodeCode)) {
      problems.add('节点标识缺失或重复，部分节点无法绘制。')
      continue
    }
    codes.add(node.nodeCode)
    nodes.push(node)
    graph.setNode(node.nodeCode, { width: 220, height: 116 })
  }
  for (const node of nodes) {
    if (!Array.isArray(node.dependencies)) problems.add('当前批次未保存完整依赖信息，连线可能不完整。')
    for (const code of new Set(Array.isArray(node.dependencies) ? node.dependencies : [])) {
      if (!codes.has(code)) problems.add('部分上游节点缺失，无法展示完整依赖关系。')
      else graph.setEdge(code, node.nodeCode)
    }
  }
  if (!dagre.graphlib.alg.isAcyclic(graph)) problems.add('节点依赖存在循环，请检查计算配置。')
  dagre.layout(graph)
  return {
    width: graph.graph().width || 264,
    height: graph.graph().height || 160,
    nodes: nodes.map(node => ({ ...node, ...graph.node(node.nodeCode) })),
    edges: graph.edges().map(edge => ({ from: edge.v, to: edge.w, points: graph.edge(edge).points })),
    problems: [...problems]
  }
}
