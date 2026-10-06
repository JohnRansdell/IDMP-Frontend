import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutCalculationGraph, targetTitle, targetPeriod } from '../src/idmp/utils/calculationGraph.js'

test('actual dependency codes define edges, not node order or owner', () => {
  const nodes = [
    { nodeId: '102027642462358159', nodeCode: 'formula', dependencies: ['composite', 'total'] },
    { nodeCode: 'composite', dependencies: ['patent', 'herbal'] },
    { nodeCode: 'patent', dependencies: [] },
    { nodeCode: 'total', dependencies: [] },
    { nodeCode: 'herbal', dependencies: [] },
    { nodeCode: 'quality', dependencies: ['formula'] }
  ]
  const graph = layoutCalculationGraph(nodes)
  assert.equal(graph.edges.length, 5)
  assert.equal(graph.nodes[0].nodeId, '102027642462358159')
  assert.equal(graph.problems.length, 0)
  const byCode = new Map(graph.nodes.map(n => [n.nodeCode, n]))
  for (const edge of graph.edges) assert.ok(byCode.get(edge.from).x < byCode.get(edge.to).x)
  for (const node of graph.nodes) {
    assert.ok(node.x - node.width / 2 >= 0)
    assert.ok(node.x + node.width / 2 <= graph.width)
  }
})

test('dependencies stay target-local, repeated codes cannot generate guessed edges', () => {
  const graph = layoutCalculationGraph([{ nodeCode: 'a', dependencies: ['outside', 'outside'] }, { nodeCode: 'a', dependencies: [] }])
  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.edges.length, 0)
  assert.equal(graph.problems.length, 2)
})

test('legacy nodes show missing dependency warning instead of inferring list order', () => {
  const graph = layoutCalculationGraph([{ nodeCode: 'a' }, { nodeCode: 'b' }])
  assert.equal(graph.edges.length, 0)
  assert.equal(graph.problems.length, 1)
  assert.equal(layoutCalculationGraph([]).nodes.length, 0)
})

test('cycles and duplicated dependency declarations are handled', () => {
  const graph = layoutCalculationGraph([{ nodeCode: 'a', dependencies: ['b', 'b'] }, { nodeCode: 'b', dependencies: ['a'] }])
  assert.equal(graph.edges.length, 2)
  assert.ok(graph.problems.some(p => p.includes('循环')))
})

test('malformed dependencies never become guessed edges or crash the graph', () => {
  for (const dependencies of ['a', { code: 'a' }, null]) {
    const graph = layoutCalculationGraph([{ nodeCode: 'a', dependencies: [] }, { nodeCode: 'b', dependencies }])
    assert.equal(graph.edges.length, 0)
    assert.equal(graph.problems.length, 1)
  }
})

test('readable target metadata never exposes opaque target hash as a title', () => {
  assert.equal(targetTitle({ targetCode: 'BASE' }), '基础汇总')
  assert.equal(targetTitle({ drillPathName: '科室医生下钻', drillLevelName: '医生' }), '科室医生下钻 · 医生')
  assert.equal(targetTitle({ targetKey: 'opaque-hash' }, 4), '计算目标 5')
  assert.equal(targetPeriod({ periodType: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-02-01' }), '月度 · 2026-01-01 至 2026-02-01（不含）')
  assert.equal(targetPeriod({ periodType: 'QUARTERLY' }), '季度')
})
