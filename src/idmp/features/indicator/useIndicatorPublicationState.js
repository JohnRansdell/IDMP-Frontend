import { computed } from 'vue'

export function useIndicatorPublicationState({ indicatorWorkflow, policySourceState, hasIndicatorTrialResults }) {
  const canPublishIndicatorVersion = computed(() =>
    Boolean(
      indicatorWorkflow.versionId &&
      !indicatorWorkflow.published
    )
  )

  const publishPanelDescription = computed(() => {
    if (indicatorWorkflow.published) {
      return `指标版本 ${indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId} 已发布，可用于分析查询。`
    }
    if (!indicatorWorkflow.versionId) return '请先完成第 1 页基本信息，再到第 2 页保存公式并创建指标版本。'
    if (!policySourceState.count) return '请先在第 1 页选择政策文件来源；依据说明选填，场景关联可跳过。'
    if (!indicatorWorkflow.compiled) return '请在第 2 页保存并校验公式。直接点击发布时，系统也会先完成检查；未通过则保留草稿。'
    if (!hasIndicatorTrialResults.value) return '请在第 2 页试算并核对结果。直接点击发布时，系统也会先执行试算；未通过则保留草稿。'
    return '已取得试算结果。请确认结果符合业务预期，再点击“发布指标版本”；系统将执行最终检查。'
  })

  const workflowSteps = computed(() => [
    { key: 'basic', label: '基础与政策', description: indicatorWorkflow.versionId ? '指标与版本已创建' : '填写基本信息并选择政策来源', state: indicatorWorkflow.versionId ? 'complete' : 'current' },
    { key: 'formula', label: '公式与试算', description: hasIndicatorTrialResults.value ? '试算结果已读取，可前往发布检查' : indicatorWorkflow.compiled ? '校验通过，可执行试算' : '保存公式后校验并试算', state: hasIndicatorTrialResults.value ? 'complete' : 'pending' },
    { key: 'scene', label: '场景关联', description: '可选，不影响独立指标计算', state: 'optional' },
    { key: 'publish', label: '发布检查', description: indicatorWorkflow.published ? '指标已发布，可独立正式计算' : '在发布检查页确认发布', state: indicatorWorkflow.published ? 'complete' : 'pending' }
  ])

  const publishGates = computed(() => [
    {
      label: '政策文件来源（必填）',
      description: policySourceState.error || (!policySourceState.count
        ? '请到第 1 页选择至少一份政策文件；依据说明可以不填。'
        : `已选择 ${policySourceState.count} 份政策文件。${policySourceState.pending ? '发布后会保存到当前指标版本。' : '政策来源已保存。'}`),
      state: policySourceState.error || !policySourceState.count ? 'pending' : policySourceState.pending ? 'warning' : 'pass',
      stateLabel: policySourceState.error ? '需重试' : !policySourceState.count ? '待选择' : policySourceState.pending ? '发布后保存' : '已保存',
      targetTab: 'basic', targetSection: 'policy', actionLabel: policySourceState.error ? '检查政策来源' : '查看政策来源'
    },
    { label: '场景关联（可选）', description: '无需关联场景即可发布并生成独立正式结果。', state: 'pass', stateLabel: '可跳过' },
    {
      label: '指标版本',
      description: indicatorWorkflow.versionId ? `当前版本：${indicatorWorkflow.versionId}` : '请先完成第 1 页基本信息，再到第 2 页保存公式并创建版本。',
      state: indicatorWorkflow.versionId ? 'pass' : 'pending',
      stateLabel: indicatorWorkflow.versionId ? '已创建' : '待创建',
      targetTab: indicatorWorkflow.versionId ? '' : 'basic', actionLabel: '前往第 1 页填写'
    },
    {
      label: '公式校验',
      description: indicatorWorkflow.compiled ? '当前公式已通过系统校验。修改公式后需要重新校验。' : '请在第 2 页保存公式后点击“公式校验”。发布时系统也会补齐检查。',
      state: indicatorWorkflow.compiled ? 'pass' : 'pending',
      stateLabel: indicatorWorkflow.compiled ? '已通过' : '待校验',
      targetTab: 'formula', actionLabel: indicatorWorkflow.compiled ? '查看公式' : '前往第 2 页校验'
    },
    {
      label: '试算结果',
      description: hasIndicatorTrialResults.value
        ? '已读取试算结果，请核对数值是否符合业务预期。修改公式、参数或周期后请重新试算。'
        : '请在第 2 页执行试算并查看结果。发布时系统也会补齐试算检查。',
      state: hasIndicatorTrialResults.value ? 'pass' : 'pending',
      stateLabel: hasIndicatorTrialResults.value ? '已取得结果' : '待试算',
      targetTab: 'formula', targetSection: 'trial', actionLabel: hasIndicatorTrialResults.value ? '查看试算结果' : '前往第 2 页试算'
    },
    {
      label: '发布确认',
      description: indicatorWorkflow.published ? '系统已完成发布检查，当前版本已发布。' : '点击发布后，系统将检查计算结果及发布要求；未通过会提示原因并保留草稿。',
      state: indicatorWorkflow.published ? 'pass' : 'pending',
      stateLabel: indicatorWorkflow.published ? '已发布' : '发布时检查'
    }
  ])
  return { canPublishIndicatorVersion, publishPanelDescription, workflowSteps, publishGates }
}
