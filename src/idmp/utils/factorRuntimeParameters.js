export async function inheritedFactorParameters(root, loadArtifact) {
  const parameters = new Map(), visited = new Set(), stack = new Set()
  async function visit(artifact, expectedHash) {
    if (expectedHash && artifact.artifactHash !== expectedHash) throw new Error('上游因子定义已变化，请重新编译当前因子后查询')
    const id = String(artifact.id)
    if (stack.has(id)) throw new Error('因子存在循环依赖，请检查计算公式')
    if (visited.has(id)) return
    stack.add(id)
    for (const declaration of artifact.parameterSchema?.parameters || []) {
      if (!declaration.code || declaration.type === 'PERIOD' || ['periodStart','periodEnd'].includes(declaration.code)) continue
      const current = parameters.get(declaration.code)
      if (current && current.type !== declaration.type) throw new Error(`运行参数“${declaration.code}”在上游因子中的类型不一致`)
      parameters.set(declaration.code, { ...declaration, required: Boolean(current?.required || declaration.required),
        parameterMode: current && current.parameterMode !== declaration.parameterMode ? 'TEMPORARY' : declaration.parameterMode })
    }
    for (const edge of artifact.logicalPlan?.factorDependencies || []) await visit(await loadArtifact(String(edge.factorVersionId)), edge.artifactHash)
    stack.delete(id); visited.add(id)
  }
  await visit(root)
  return [...parameters.values()]
}
