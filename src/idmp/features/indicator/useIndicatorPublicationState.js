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
      return `后端已返回发布结果，版本 ${indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId} 可用于分析查询。`
    }
    if (!indicatorWorkflow.versionId) return '请先创建指标版本。'
    if (!policySourceState.count) return '请先在第 1 页选择政策文件来源；依据说明选填，场景关联可跳过。'
    if (!indicatorWorkflow.compiled) return '发布时会对当前公式执行编译校验，失败时保留草稿。'
    if (!hasIndicatorTrialResults.value) return '发布前需要成功试算；提交发布时会补齐校验，并以后端最终校验为准。'
    return '发布接口已就绪，点击按钮会写入后端发布状态。'
  })

  const workflowSteps = computed(() => [
    { key: 'basic', label: '基础与版本', description: indicatorWorkflow.versionId ? '指标与版本已创建' : '填写基本信息并选择政策来源', state: indicatorWorkflow.versionId ? 'complete' : 'current' },
    { key: 'formula', label: '公式与试算', description: hasIndicatorTrialResults.value ? '试算结果已读取，可前往发布检查' : indicatorWorkflow.compiled ? '校验通过，可执行试算' : '保存公式后编译、试算', state: hasIndicatorTrialResults.value ? 'complete' : 'pending' },
    { key: 'exclusion', label: '规则与排除', description: '指标级默认排除暂不支持此处保存', state: 'blocked' },
    { key: 'scene', label: '场景关联', description: '可选，不影响独立指标计算', state: 'optional' },
    { key: 'policy', label: '政策依据', description: '选填，自动同步第 1 页政策来源，可跳过', state: 'optional' },
    { key: 'publish', label: '发布检查', description: indicatorWorkflow.published ? '指标已发布，可独立正式计算' : '统一在第 6 页确认发布', state: indicatorWorkflow.published ? 'complete' : 'pending' }
  ])

  const publishGates = computed(() => [
    { label: '政策文件来源（必填）', description: policySourceState.error || `已选择 ${policySourceState.count} 份，待绑定 ${policySourceState.pending} 份；依据说明选填。草稿来源发布后绑定。`, state: policySourceState.error || !policySourceState.count ? 'pending' : policySourceState.pending ? 'warning' : 'pass', stateLabel: policySourceState.error ? '需重试' : !policySourceState.count ? '待选择' : policySourceState.pending ? '待绑定' : '已保存' },
    { label: '场景关联（可选）', description: '无需关联场景即可发布并生成独立正式结果', state: 'pass', stateLabel: '可跳过' },
    {
      label: '稳定指标与草稿版本',
      description: indicatorWorkflow.versionId ? `版本 ${indicatorWorkflow.versionId}` : '尚未创建可发布的草稿版本',
      state: indicatorWorkflow.versionId ? 'pass' : 'pending',
      stateLabel: indicatorWorkflow.versionId ? '已具备' : '待完成'
    },
    {
      label: 'Formula AST 服务端编译',
      description: indicatorWorkflow.compiled ? '服务端编译校验已通过' : '尚未取得有效编译产物',
      state: indicatorWorkflow.compiled ? 'pass' : 'pending',
      stateLabel: indicatorWorkflow.compiled ? '已通过' : '待完成'
    },
    {
      label: '试算结果与配置一致性',
      description: hasIndicatorTrialResults.value
        ? '已读取试算结果，但当前接口未返回配置 Hash'
        : '尚未取得可核验的试算结果',
      state: hasIndicatorTrialResults.value ? 'warning' : 'pending',
      stateLabel: hasIndicatorTrialResults.value ? '需核验 Hash' : '待完成'
    },
    {
      label: '质量、下钻与隐私',
      description: indicatorWorkflow.published ? '发布接口已由后端完成最终校验' : '发布时由后端执行最终门禁校验',
      state: indicatorWorkflow.published ? 'pass' : canPublishIndicatorVersion.value ? 'warning' : 'pending',
      stateLabel: indicatorWorkflow.published ? '已发布' : canPublishIndicatorVersion.value ? '后端校验' : '待发布'
    }
  ])
  return { canPublishIndicatorVersion, publishPanelDescription, workflowSteps, publishGates }
}
