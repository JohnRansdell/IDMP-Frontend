<template>
  <StatePanel v-if="loading && !targets.length" type="loading" title="正在读取计算目标" />
  <StatePanel v-else-if="error" type="error" title="计算目标读取失败" :description="error">
    <template #actions><el-button @click="loadPage">重试</el-button></template>
  </StatePanel>
  <template v-else>
    <el-empty v-if="!targets.length" description="当前批次暂无计算目标" :image-size="60" />
    <CalculationTargetsPanel v-else :targets="targets" :batch-status="overview.status" :retrying-node-id="retryingNodeId" @expand="expandTarget" @retry="$emit('retry', $event)" />
  </template>
  <el-pagination v-if="total > pageSize" class="target-pagination" :disabled="loading" :current-page="page" :page-size="pageSize" :total="total" layout="total, prev, pager, next" @current-change="changePage" />
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import CalculationTargetsPanel from '@/idmp/components/CalculationTargetsPanel.vue'
import { fetchCalcTargets, fetchCalcTargetNodes } from '@/idmp/api/modules/calculation'
import { calculationQueryError } from '@/idmp/utils/calculationQuery.js'

const props = defineProps({ overview: { type: Object, required: true }, retryingNodeId: { type: String, default: '' } })
defineEmits(['retry'])
const targets = ref([]), total = ref(0), page = ref(1), loading = ref(false), error = ref('')
const pageSize = 20
let pageRevision = 0, nodeRevision = 0, pageAbort, nodeAbort, expanded = '', disposed = false

async function loadPage() {
  pageAbort?.abort(); nodeAbort?.abort(); ++nodeRevision
  const revision = ++pageRevision, batchId = String(props.overview.batchId)
  const controller = new AbortController()
  pageAbort = controller
  loading.value = true; error.value = ''
  targets.value = targets.value.map(target => ({ ...target, nodesLoading: String(target.targetId) === expanded }))
  try {
    const data = await fetchCalcTargets(batchId, page.value, pageSize, { signal: controller.signal })
    if (disposed || revision !== pageRevision || controller.signal.aborted) return
    const count = Number(data.total)
    // A page can disappear while a batch is being prepared; return to its last valid page.
    if (page.value > 1 && !data.records.length && count > 0) {
      page.value = Math.ceil(count / pageSize)
      return loadPage()
    }
    const previous = new Map(targets.value.map(target => [String(target.targetId), target]))
    targets.value = data.records.map(target => ({ ...target, nodes: previous.get(String(target.targetId))?.nodes }))
    total.value = count
    if (expanded && targets.value.some(target => String(target.targetId) === expanded)) void loadNodes(expanded)
    else expanded = ''
  } catch (cause) {
    if (!disposed && revision === pageRevision && !controller.signal.aborted) error.value = calculationQueryError(cause, '计算目标')
  } finally {
    if (revision === pageRevision) loading.value = false
  }
}

async function loadNodes(targetId) {
  nodeAbort?.abort()
  const revision = ++nodeRevision, batchId = String(props.overview.batchId)
  const target = targets.value.find(item => String(item.targetId) === targetId)
  if (!target) return
  const controller = new AbortController()
  nodeAbort = controller
  target.nodesLoading = true; target.nodesError = ''
  try {
    const data = await fetchCalcTargetNodes(batchId, targetId, { signal: controller.signal })
    if (disposed || revision !== nodeRevision || controller.signal.aborted) return
    target.nodes = data
  } catch (cause) {
    if (!disposed && revision === nodeRevision && !controller.signal.aborted) {
      target.nodes = undefined
      target.nodesError = calculationQueryError(cause, '计算节点')
    }
  } finally {
    if (revision === nodeRevision) target.nodesLoading = false
  }
}

function expandTarget(targetId) {
  expanded = targetId
  nodeAbort?.abort(); ++nodeRevision
  for (const target of targets.value) target.nodesLoading = false
  if (targetId) void loadNodes(targetId)
}
function changePage(value) {
  page.value = value; expanded = ''; targets.value = []
  void loadPage()
}
watch(() => props.overview, (value, previous) => {
  if (String(value.batchId) !== String(previous?.batchId)) {
    page.value = 1; expanded = ''; targets.value = []; total.value = 0
  }
  void loadPage()
}, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++pageRevision; ++nodeRevision; pageAbort?.abort(); nodeAbort?.abort() })
</script>

<style scoped>
.target-pagination { margin-top: 16px; justify-content: flex-end; max-width: 100%; flex-wrap: wrap; }
</style>
