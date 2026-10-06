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
  const graph = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 64, marginx: 24, marginy: 24 }).setDefaultEdgeLabel(() => ({}))
  const nodes = [], codes = new Set(), problems = new Set()
  for (const node of input) {
    if (!node.nodeCode || codes.has(node.nodeCode)) {
      problems.add('节点标识缺失或重复，部分节点无法绘制。')
      continue
    }
    codes.add(node.nodeCode)
    nodes.push(node)
    graph.setNode(node.nodeCode, { width: 224, height: 128 })
  }
  for (const node of nodes) {
    if (!Array.isArray(node.dependencies)) problems.add('当前批次未保存完整依赖信息，连线可能不完整。')
    for (const code of new Set(Array.isArray(node.dependencies) ? node.dependencies : [])) {
      if (!codes.has(code)) problems.add('部分上游节点缺失，无法展示完整依赖关系。')
      else graph.setEdge(code, node.nodeCode)
    }
  }
  const acyclic = dagre.graphlib.alg.isAcyclic(graph)
  if (!acyclic) problems.add('节点依赖存在循环，请检查计算配置。')
  const roots = graph.nodes().filter(code => !graph.inEdges(code)?.length)
  // A layout-only anchor aligns sources; it is never returned as a node or a dependency.
  if (acyclic && roots.length > 1) {
    let anchor = '__layout_source__'
    while (codes.has(anchor)) anchor += '_'
    graph.setNode(anchor, { width: 0, height: 0 })
    roots.forEach(code => graph.setEdge(anchor, code, { weight: 100, minlen: 1 }))
  }
  dagre.layout(graph)
  const offsetX = nodes.length ? Math.min(...nodes.map(node => graph.node(node.nodeCode).x - 112)) - 24 : 0
  const positioned = nodes.map(node => ({ ...node, ...graph.node(node.nodeCode), x: graph.node(node.nodeCode).x - offsetX, y: graph.node(node.nodeCode).y + 32 }))
  const columns = [...new Set(positioned.map(node => node.x))].sort((a, b) => a - b).map(x => {
    const types = [...new Set(positioned.filter(node => node.x === x).map(node => NODE_LABELS[node.nodeType] || '计算节点'))]
    return { x: x - 112, width: 224, label: types.length === 1 ? types[0] : '计算节点' }
  })
  return {
    width: (graph.graph().width - offsetX) || 272,
    height: (graph.graph().height + 32) || 160,
    nodes: positioned,
    columns,
    edges: graph.edges().filter(edge => codes.has(edge.v) && codes.has(edge.w)).map(edge => {
      const points = graph.edge(edge).points.map(p => ({ x: p.x - offsetX, y: p.y + 32 }))
      return { from: edge.v, to: edge.w, points, path: roundedEdgePath(points) }
    }),
    problems: [...problems]
  }
}

export function roundedEdgePath(points) {
  if (!points.length) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1], point = points[index], next = points[index + 1]
    const before = Math.hypot(point.x - previous.x, point.y - previous.y)
    const after = Math.hypot(next.x - point.x, next.y - point.y)
    const radius = Math.min(10, before / 2, after / 2)
    if (!radius) continue
    const start = { x: point.x + (previous.x - point.x) * radius / before, y: point.y + (previous.y - point.y) * radius / before }
    const end = { x: point.x + (next.x - point.x) * radius / after, y: point.y + (next.y - point.y) * radius / after }
    path += ` L ${start.x} ${start.y} Q ${point.x} ${point.y} ${end.x} ${end.y}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}

export function relatedGraphCodes(edges, activeCode) {
  const related = new Set(activeCode ? [activeCode] : [])
  const upstream = new Map(), downstream = new Map()
  for (const edge of edges) {
    if (!upstream.has(edge.to)) upstream.set(edge.to, [])
    if (!downstream.has(edge.from)) downstream.set(edge.from, [])
    upstream.get(edge.to).push(edge.from)
    downstream.get(edge.from).push(edge.to)
  }
  for (const adjacency of [upstream, downstream]) {
    const visited = new Set(activeCode ? [activeCode] : []), queue = activeCode ? [activeCode] : []
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of adjacency.get(queue[index]) || []) {
        if (!visited.has(neighbor)) { related.add(neighbor); visited.add(neighbor); queue.push(neighbor) }
      }
    }
  }
  return related
}
