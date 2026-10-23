<template>
  <el-collapse v-model="expanded" accordion class="calculation-targets">
    <el-collapse-item v-for="(target, index) in targets" :key="String(target.targetId)" :name="String(target.targetId)">
      <template #title>
        <div class="target-header">
          <div class="target-header__text"><strong>{{ targetTitle(target, index) }}</strong><span>{{ targetPeriod(target) }}</span></div>
          <div class="target-header__status"><span>{{ target.nodes?.length || 0 }} 个节点</span><StatusBadge :status="target.status" /></div>
        </div>
      </template>
      <template v-if="expanded === String(target.targetId)">
        <div class="target-grain"><span>分组字段</span><span>{{ target.grain?.length ? target.grain.join(' × ') : '整体汇总' }}</span><StatusBadge v-if="target.resultOutcomeStatus" :status="target.resultOutcomeStatus" /></div>
        <el-alert v-if="target.errorMessage" :title="target.errorMessage" type="error" :closable="false" />
        <CalculationTargetDag v-if="target.nodes?.length" :nodes="target.nodes" :selected-id="selection.nodeId" @select="node => selectNode(target, node)" />
        <el-empty v-else description="此目标暂无计算节点" :image-size="50" />
      </template>
    </el-collapse-item>
  </el-collapse>
  <el-drawer v-model="drawerOpen" title="计算节点详情" :size="drawerSize" append-to-body destroy-on-close>
    <template v-if="selectedNode">
      <div class="node-heading"><h3>{{ selectedNode.nodeName || NODE_LABELS[selectedNode.nodeType] || '计算节点' }}</h3><StatusBadge :status="selectedNode.status" :label="specialStatus(selectedNode.status)" /></div>
      <section class="node-results" aria-label="节点计算结果">
        <div class="node-results__heading"><h4>计算结果</h4><el-button v-if="canLoadResults" text size="small" :loading="resultsLoading" @click="loadResults">刷新结果</el-button></div>
        <StatePanel v-if="resultsLoading" type="loading" title="正在读取节点结果" />
        <StatePanel v-else-if="resultsError" type="error" title="节点结果读取失败" :description="resultsError"><template #actions><el-button size="small" @click="loadResults">重试</el-button></template></StatePanel>
        <template v-else-if="nodeResults?.summary?.status === 'AVAILABLE'">
          <div class="node-results__summary"><span>共 {{ nodeResults.results.total }} 条结果</span><span>第 {{ nodeResults.attemptNo }} 次执行</span></div>
          <el-table :data="nodeResults.results.records || []" size="small" max-height="360" empty-text="当前页暂无结果">
            <el-table-column v-for="field in resultFields" :key="field" :label="field" min-width="110"><template #default="{ row }">{{ calculationDimensionValue(row, field) }}</template></el-table-column>
            <el-table-column label="结果值" min-width="120"><template #default="{ row }">{{ calculationResultValue(row) }}</template></el-table-column>
            <el-table-column v-if="isIndicatorNode" prop="numeratorValue" label="分子" min-width="100" />
            <el-table-column v-if="isIndicatorNode" prop="denominatorValue" label="分母" min-width="100" />
            <el-table-column label="结果状态" min-width="100"><template #default="{ row }"><StatusBadge :status="row.outcomeStatus || row.qualityStatus" /></template></el-table-column>
          </el-table>
          <el-pagination v-if="Number(nodeResults.results.total) > resultPageSize" :current-page="resultPage" :page-size="resultPageSize" :total="Number(nodeResults.results.total)" layout="prev, pager, next" small @current-change="changeResultPage" />
        </template>
        <div v-else class="node-results__empty">
          <StatusBadge v-if="resultSummary?.status === 'QUALITY' && resultSummary.conclusion" :status="resultSummary.conclusion" />
          <span v-else>{{ resultSummary?.message || nodeResultLabel(selectedNode) }}</span>
        </div>
      </section>
      <dl class="node-details">
        <div><dt>节点类型</dt><dd>{{ NODE_LABELS[selectedNode.nodeType] || '计算节点' }}</dd></div>
        <div><dt>所属目标</dt><dd>{{ targetTitle(selectedTarget, targets.indexOf(selectedTarget)) }}</dd></div>
        <div><dt>统计周期</dt><dd>{{ targetPeriod(selectedTarget) || '-' }}</dd></div>
        <div><dt>版本</dt><dd>{{ selectedNode.versionNo ? `V${selectedNode.versionNo}` : '-' }}</dd></div>
        <div><dt>版本 ID</dt><dd>{{ selectedNode.ownerVersionId || '-' }}</dd></div>
        <div><dt>节点 ID</dt><dd>{{ selectedNode.nodeId }}</dd></div>
        <div><dt>快照 ID</dt><dd>{{ selectedTarget.snapshotId || '-' }}</dd></div>
        <div><dt>尝试次数</dt><dd>{{ selectedNode.attemptNo ?? 0 }}</dd></div>
        <div><dt>执行实例</dt><dd>{{ selectedNode.workerId || '-' }}</dd></div>
        <div><dt>开始时间</dt><dd>{{ formatTime(selectedNode.startedAt) }}</dd></div>
        <div><dt>结束时间</dt><dd>{{ formatTime(selectedNode.finishedAt) }}</dd></div>
        <div><dt>租约到期</dt><dd>{{ formatTime(selectedNode.leaseExpireAt) }}</dd></div>
        <div><dt>最近更新</dt><dd>{{ formatTime(selectedNode.updatedAt) }}</dd></div>
        <div><dt>租约序号</dt><dd>{{ selectedNode.fencingToken ?? '-' }}</dd></div>
        <div><dt>源数据状态</dt><dd><StatusBadge :status="selectedNode.sourceDataStatus" /></dd></div>
        <div><dt>源记录数</dt><dd>{{ selectedNode.sourceRecordCount ?? '-' }}</dd></div>
        <div><dt>结果结论</dt><dd><StatusBadge :status="selectedTarget.resultOutcomeStatus" /></dd></div>
      </dl>
      <section class="node-section"><h4>上游依赖</h4>
        <div v-if="selectedNode.dependencies?.length" class="dependency-links">
          <template v-for="code in selectedNode.dependencies" :key="code">
            <el-button v-if="findDependency(code)" text @click="selectNode(selectedTarget, findDependency(code))">{{ findDependency(code).nodeName || NODE_LABELS[findDependency(code).nodeType] || '计算节点' }}</el-button>
            <span v-else>上游节点缺失</span>
          </template>
        </div>
        <span v-else class="muted">{{ Array.isArray(selectedNode.dependencies) ? '无上游依赖' : '未保存依赖信息' }}</span>
      </section>
      <section v-if="selectedNode.errorMessage" class="node-section"><h4>错误信息</h4><p class="node-error">{{ selectedNode.errorMessage }}</p></section>
    </template>
    <template #footer>
      <el-button v-if="canRetryCalculationNode(selectedNode, batchStatus)" type="danger" :disabled="Boolean(retryingNodeId)" :loading="String(retryingNodeId) === String(selectedNode.nodeId)" @click="$emit('retry', selectedNode)">{{ batchStatus === 'CANCELLED' ? '重试已取消批次' : selectedNode.status === 'FAILED' ? '重试失败节点' : '重试节点' }}</el-button>
      <el-button @click="drawerOpen = false">关闭</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import CalculationTargetDag from '@/idmp/components/CalculationTargetDag.vue'
import { fetchCalcNodeResults } from '@/idmp/api/modules/calculation'
import { calculationDimensionValue, calculationResultFields, calculationResultValue, nodeResultLabel } from '@/idmp/utils/calculationResults'
import { canRetryCalculationNode, NODE_LABELS, targetPeriod, targetTitle } from '@/idmp/utils/calculationGraph'
const props = defineProps({ targets: { type: Array, default: () => [] }, batchStatus: { type: String, default: '' }, retryingNodeId: { type: String, default: '' } })
defineEmits(['retry'])
const expanded = ref(''), drawerOpen = ref(false), selection = reactive({ targetId: '', nodeId: '' })
const drawerSize = 'min(520px, 100vw)'
const selectedTarget = computed(() => props.targets.find(t => String(t.targetId) === selection.targetId))
const selectedNode = computed(() => selectedTarget.value?.nodes?.find(n => String(n.nodeId) === selection.nodeId))
const nodeResults = ref(null), resultsLoading = ref(false), resultsError = ref(''), resultPage = ref(1)
const resultPageSize = 20
let resultRequest = 0, resultAbort
const isIndicatorNode = computed(() => ['FORMULA', 'INDICATOR'].includes(selectedNode.value?.nodeType))
const canLoadResults = computed(() => selectedNode.value?.status === 'SUCCEEDED' && ['FACTOR', 'DERIVED_FACTOR', 'FORMULA', 'INDICATOR'].includes(selectedNode.value?.nodeType))
const resultSummary = computed(() => selectedNode.value?.status === 'SUCCEEDED' ? nodeResults.value?.summary || selectedNode.value?.resultSummary : null)
const resultFields = computed(() => calculationResultFields(nodeResults.value?.dimensionFields, nodeResults.value?.results?.records))
watch(() => props.targets, () => {
  if (!props.targets.some(t => String(t.targetId) === expanded.value)) expanded.value = ''
  if (!selectedNode.value) drawerOpen.value = false
})
function selectNode(target, node) {
  selection.targetId = String(target.targetId)
  selection.nodeId = String(node.nodeId)
  drawerOpen.value = true
}
watch(() => [drawerOpen.value, selection.targetId, selection.nodeId, selectedNode.value?.attemptNo, selectedNode.value?.status, selectedNode.value?.fencingToken], () => {
  resultAbort?.abort()
  resultRequest += 1
  nodeResults.value = null
  resultsError.value = ''
  resultsLoading.value = false
  resultPage.value = 1
  if (drawerOpen.value && canLoadResults.value) loadResults()
})
async function loadResults() {
  if (!drawerOpen.value || !canLoadResults.value) return
  resultAbort?.abort()
  const request = ++resultRequest, nodeId = selection.nodeId, attempt = selectedNode.value.attemptNo
  const controller = new AbortController()
  resultAbort = controller
  resultsLoading.value = true
  resultsError.value = ''
  nodeResults.value = null
  try {
    const data = await fetchCalcNodeResults(nodeId, resultPage.value, resultPageSize, { signal: controller.signal })
    if (request !== resultRequest || controller.signal.aborted) return
    if (String(data.nodeId) !== nodeId || String(data.targetId) !== selection.targetId || Number(data.attemptNo) !== Number(attempt)) {
      throw new Error('节点执行状态已变化，请刷新批次后重新查看')
    }
    nodeResults.value = data
  } catch (error) {
    if (request === resultRequest && !controller.signal.aborted) resultsError.value = error?.message || '节点结果读取失败，请重试'
  } finally {
    if (request === resultRequest) resultsLoading.value = false
  }
}
function changeResultPage(page) { resultPage.value = page; loadResults() }
onBeforeUnmount(() => { resultRequest += 1; resultAbort?.abort() })
function findDependency(code) { return selectedTarget.value?.nodes?.find(n => n.nodeCode === code) }
function specialStatus(status) { return { LEASED: '已领取', SKIPPED: '已跳过' }[status] }
function formatTime(value) { return value ? String(value).replace('T', ' ') : '-' }
</script>

<style scoped>
.calculation-targets { --el-collapse-header-height: auto; }
.target-header { display: flex; gap: 12px; align-items: center; justify-content: space-between; width: 100%; padding: 14px 12px 14px 0; text-align: left; line-height: 1.5; }
.target-header__text { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.target-header__text strong { font-size: 14px; font-weight: 600; }
.target-header__text span, .target-header__status > span, .muted { color: var(--el-text-color-secondary); font-size: 12px; }
.target-header__status { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.target-grain { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 2px 0 14px; line-height: 1.6; overflow-wrap: anywhere; }
.target-grain > span:first-child { color: var(--el-text-color-secondary); }
.node-heading { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; margin-bottom: 20px; }
.node-heading h3 { font-size: 17px; margin: 0; overflow-wrap: anywhere; }
.node-results { margin-bottom: 22px; }
.node-results__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.node-results__heading h4 { margin: 0; font-size: 14px; }
.node-results__summary { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
.node-results__empty { color: var(--el-text-color-secondary); font-size: 13px; }
.node-results :deep(.el-pagination) { margin-top: 12px; justify-content: flex-end; }
.node-details { margin: 0; }
.node-details > div { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--el-border-color-lighter); line-height: 1.5; }
.node-details dt { color: var(--el-text-color-secondary); }
.node-details dd { margin: 0; overflow-wrap: anywhere; }
.node-section { margin-top: 22px; }
.node-section h4 { font-size: 14px; margin: 0 0 10px; }
.dependency-links { display: flex; flex-wrap: wrap; gap: 6px; }
.dependency-links :deep(.el-button) { height: auto; white-space: normal; margin-left: 0; text-align: left; }
.node-error { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--el-color-danger); font-size: 14px; }
@media (max-width: 600px) { .target-header { align-items: flex-start; flex-direction: column; gap: 8px; } .node-details > div { grid-template-columns: 76px minmax(0, 1fr); } }
</style>
