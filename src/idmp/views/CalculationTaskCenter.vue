<template>
  <div class="idmp-page calc-task-page">
    <PageHeader
      title="计算任务中心"
    >
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">任务与批次 ID 均按不透明字符串处理</span>
      </template>
      <template #actions>
        <el-button
          :icon="Refresh"
          :loading="taskLoading || batchLoading"
          :disabled="!queryForm.batchId && !queryForm.taskId"
          @click="refreshCurrent"
        >
          刷新当前状态
        </el-button>
      </template>
    </PageHeader>

    <div v-if="!hasAccessToken" class="notice-strip is-warning auth-notice">
      当前未保存访问令牌；若后端启用鉴权，查询与写操作会返回未登录或权限错误。
    </div>

    <section class="operation-grid">
      <article class="surface-card query-card">
        <div class="section-title">
          <div>
            <h2>查询任务与批次</h2>
            <p class="section-title__description">查询只读取后端当前状态，不会启动或停止任务。</p>
          </div>
          <span class="endpoint-note">GET /async-tasks · GET /calc/batches</span>
        </div>
        <div class="query-controls">
          <el-form label-position="top" @submit.prevent="loadTask">
            <el-form-item label="异步任务 ID">
              <el-input v-model.trim="queryForm.taskId" class="mono-input" placeholder="输入完整 taskId" />
            </el-form-item>
            <el-button :loading="taskLoading" @click="loadTask">查询任务</el-button>
          </el-form>
          <el-form label-position="top" @submit.prevent="loadBatch">
            <el-form-item label="计算批次 ID">
              <el-input v-model.trim="queryForm.batchId" class="mono-input" placeholder="输入完整 batchId" />
            </el-form-item>
            <div class="query-actions">
              <el-button :loading="batchLoading" @click="loadBatch">查询批次</el-button>
              <el-button
                type="danger"
                plain
                :disabled="!canCancelBatch"
                :loading="cancelLoading"
                @click="cancelBatch"
              >
                {{ batchStatus === 'CANCELLING' ? '取消中' : '取消已查批次' }}
              </el-button>
            </div>
          </el-form>
        </div>
      </article>

      <article class="surface-card create-card">
        <div class="section-title">
          <div>
            <h2>创建计算批次</h2>
            <p class="section-title__description">该操作会写入后端并启动异步计算。</p>
          </div>
          <span class="endpoint-note">POST /calc/batches</span>
        </div>
        <div class="notice-strip is-warning create-warning">
          提交前请核对对象版本和时间范围。接口受理仅表示批次已创建，不代表计算成功。
        </div>
        <el-form :model="createForm" label-position="top" @submit.prevent="createBatch">
          <div class="create-form-grid">
            <el-form-item label="对象类型">
              <el-select v-model="createForm.ownerType">
                <el-option label="指标版本" value="INDICATOR" />
                <el-option label="因子版本" value="FACTOR" />
              </el-select>
            </el-form-item>
            <el-form-item label="对象版本 ID">
              <el-input
                v-model.trim="createForm.ownerVersionId"
                class="mono-input"
                placeholder="按字符串原样提交"
              />
            </el-form-item>
            <el-form-item label="批次类型">
              <el-select v-model="createForm.batchType">
                <el-option label="试算" value="TRIAL" />
                <el-option label="正式计算" value="FULL" />
                <el-option label="重算" value="RECALC" />
              </el-select>
            </el-form-item>
            <el-form-item label="开始时间">
              <el-input v-model.trim="createForm.periodStart" class="mono-input" />
            </el-form-item>
            <el-form-item label="结束时间">
              <el-input v-model.trim="createForm.periodEnd" class="mono-input" />
            </el-form-item>
          </div>
          <el-button type="primary" :loading="createLoading" @click="createBatch">确认并创建批次</el-button>
        </el-form>
        <div v-if="createFeedback" class="operation-feedback">
          <StatusBadge
            :status="createFeedback.status"
            :label="createFeedback.label"
            :tone="createFeedback.tone"
          />
          <span>{{ createFeedback.message }}</span>
        </div>
      </article>
    </section>

    <section class="detail-grid">
      <article class="surface-card detail-card">
        <div class="section-title">
          <h2>异步任务状态</h2>
          <span v-if="taskDetail?.taskId" class="mono-data endpoint-note">{{ taskDetail.taskId }}</span>
        </div>
        <StatePanel v-if="taskLoading" type="loading" title="正在查询异步任务" />
        <StatePanel
          v-else-if="taskError"
          :type="stateTypeForError(taskError)"
          title="异步任务查询失败"
          :description="taskError"
        >
          <template #actions>
            <el-button :disabled="!queryForm.taskId" @click="loadTask">重试查询</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!taskDetail"
          type="empty"
          title="尚未查询任务"
          description="输入完整 taskId 后读取后端状态。"
        >
          <template #actions>
            <el-button :disabled="!queryForm.taskId" @click="loadTask">查询任务</el-button>
          </template>
        </StatePanel>
        <dl v-else class="detail-list">
          <div><dt>任务 ID</dt><dd class="mono-data">{{ displayId(taskDetail.taskId) }}</dd></div>
          <div><dt>批次 ID</dt><dd class="mono-data">{{ displayId(taskDetail.batchId) }}</dd></div>
          <div><dt>任务类型</dt><dd>{{ technicalEnumLabel(taskDetail.taskType, TASK_TYPE_LABELS) }}</dd></div>
          <div class="status-row">
            <dt>状态</dt>
            <dd>
              <StatusBadge :status="taskDetail.status" />
              <span class="mono-data status-code">{{ taskDetail.status || '-' }}</span>
            </dd>
          </div>
          <div><dt>进度</dt><dd>{{ formatProgress(taskDetail) }}</dd></div>
          <div><dt>开始时间</dt><dd class="mono-data">{{ taskDetail.startedAt || '-' }}</dd></div>
          <div><dt>结束时间</dt><dd class="mono-data">{{ taskDetail.finishedAt || '-' }}</dd></div>
          <div><dt>Trace ID</dt><dd class="mono-data">{{ displayId(taskDetail.traceId) }}</dd></div>
          <div class="detail-list__wide"><dt>错误信息</dt><dd>{{ taskDetail.errorMessage || '-' }}</dd></div>
        </dl>
      </article>

      <article class="surface-card detail-card">
        <div class="section-title">
          <h2>计算批次概览</h2>
          <span v-if="batchDetail?.batchId" class="mono-data endpoint-note">{{ batchDetail.batchId }}</span>
        </div>
        <StatePanel v-if="batchLoading" type="loading" title="正在查询计算批次" />
        <StatePanel
          v-else-if="batchError"
          :type="stateTypeForError(batchError)"
          title="计算批次查询失败"
          :description="batchError"
        >
          <template #actions>
            <el-button :disabled="!queryForm.batchId" @click="loadBatch">重试查询</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!batchDetail"
          type="empty"
          title="尚未查询批次"
          description="输入完整 batchId 后读取批次、目标和节点。"
        >
          <template #actions>
            <el-button :disabled="!queryForm.batchId" @click="loadBatch">查询批次</el-button>
          </template>
        </StatePanel>
        <dl v-else class="detail-list">
          <div><dt>批次 ID</dt><dd class="mono-data">{{ displayId(batchDetail.batchId) }}</dd></div>
          <div><dt>任务 ID</dt><dd class="mono-data">{{ displayId(batchDetail.taskId) }}</dd></div>
          <div><dt>批次编码</dt><dd class="mono-data">{{ batchDetail.batchCode || '-' }}</dd></div>
          <div><dt>批次类型</dt><dd>{{ technicalEnumLabel(batchDetail.batchType, BATCH_TYPE_LABELS) }}</dd></div>
          <div class="status-row">
            <dt>状态</dt>
            <dd>
              <StatusBadge :status="batchDetail.status" />
              <span class="mono-data status-code">{{ batchDetail.status || '-' }}</span>
            </dd>
          </div>
          <div><dt>目标数</dt><dd class="clinical-metric">{{ batchDetail.targetCount ?? '-' }}</dd></div>
          <div>
            <dt>成功 / 失败</dt>
            <dd class="clinical-metric">{{ batchDetail.succeededCount ?? 0 }} / {{ batchDetail.failedCount ?? 0 }}</dd>
          </div>
          <div><dt>Trace ID</dt><dd class="mono-data">{{ displayId(batchDetail.traceId) }}</dd></div>
          <div class="detail-list__wide"><dt>错误信息</dt><dd>{{ batchDetail.errorMessage || '-' }}</dd></div>
        </dl>
        <div v-if="batchActionFeedback" class="operation-feedback">
          <StatusBadge
            :status="batchActionFeedback.status"
            :label="batchActionFeedback.label"
            :tone="batchActionFeedback.tone"
          />
          <span>{{ batchActionFeedback.message }}</span>
        </div>
      </article>
    </section>

    <section class="surface-card table-card node-card">
      <div class="section-title">
        <div>
          <h2>计算目标与节点</h2>
          <p class="section-title__description">节点重试会修改后端任务状态，仅失败节点可提交。</p>
        </div>
        <span class="endpoint-note">{{ flatNodes.length }} 个节点</span>
      </div>
      <div v-if="nodeActionFeedback" class="operation-feedback node-feedback">
        <StatusBadge
          :status="nodeActionFeedback.status"
          :label="nodeActionFeedback.label"
          :tone="nodeActionFeedback.tone"
        />
        <span>{{ nodeActionFeedback.message }}</span>
      </div>
      <StatePanel v-if="batchLoading" type="loading" title="正在加载计算节点" />
      <StatePanel
        v-else-if="batchError"
        :type="stateTypeForError(batchError)"
        title="节点数据不可读取"
        :description="batchError"
      >
        <template #actions>
          <el-button :disabled="!queryForm.batchId" @click="loadBatch">重试查询批次</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!batchDetail"
        type="empty"
        title="尚无批次上下文"
        description="先查询一个计算批次，再查看其目标和 DAG 节点。"
      />
      <StatePanel
        v-else-if="!flatNodes.length"
        type="empty"
        title="当前批次没有节点数据"
        description="后端已返回批次，但未返回可展示的目标节点。"
      >
        <template #actions>
          <el-button @click="loadBatch">重新读取批次</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table :data="flatNodes" row-key="nodeId" table-layout="fixed">
          <el-table-column prop="targetKey" label="目标" min-width="180" show-overflow-tooltip />
          <el-table-column label="对象类型" width="160">
            <template #default="{ row }">{{ technicalEnumLabel(row.ownerType, OWNER_TYPE_LABELS) }}</template>
          </el-table-column>
          <el-table-column label="版本 ID" min-width="178">
            <template #default="{ row }">
              <span class="mono-data">{{ displayId(row.ownerVersionId) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="nodeCode" label="节点编码" min-width="190" show-overflow-tooltip />
          <el-table-column prop="nodeType" label="节点类型" width="116" />
          <el-table-column label="状态" width="142">
            <template #default="{ row }">
              <StatusBadge :status="row.status" />
            </template>
          </el-table-column>
          <el-table-column prop="attemptNo" label="尝试次数" width="92" />
          <el-table-column prop="workerId" label="Worker" min-width="150" show-overflow-tooltip />
          <el-table-column label="操作" width="112" fixed="right">
            <template #default="{ row }">
              <el-button
                text
                type="danger"
                :disabled="String(row.status).toUpperCase() !== 'FAILED'"
                :loading="retryingNodeId === displayId(row.nodeId)"
                @click="retryNode(row)"
              >
                确认重试
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getAccessToken } from '@/idmp/api/request'
import {
  cancelCalcBatch,
  createCalcBatch,
  fetchAsyncTask,
  fetchCalcBatch,
  retryCalcNode
} from '@/idmp/api/modules/calculation'

const queryForm = reactive({
  taskId: '101996817981379215',
  batchId: '101996817981379215'
})

const createForm = reactive({
  ownerType: 'INDICATOR',
  ownerVersionId: '',
  batchType: 'TRIAL',
  periodStart: '2000-01-01T00:00:00',
  periodEnd: '2030-01-01T00:00:00'
})

const OWNER_TYPE_LABELS = { INDICATOR: '指标版本', FACTOR: '因子版本' }
const BATCH_TYPE_LABELS = { TRIAL: '试算', FULL: '正式计算', RECALC: '重算' }
const TASK_TYPE_LABELS = { FACTOR_TRIAL: '因子试算', INDICATOR_TRIAL: '指标试算' }

const hasAccessToken = ref(Boolean(getAccessToken()))
const taskDetail = ref(null)
const batchDetail = ref(null)
const taskError = ref('')
const batchError = ref('')
const createFeedback = ref(null)
const batchActionFeedback = ref(null)
const nodeActionFeedback = ref(null)
const taskLoading = ref(false)
const batchLoading = ref(false)
const createLoading = ref(false)
const cancelLoading = ref(false)
const retryingNodeId = ref('')

const batchStatus = computed(() => String(batchDetail.value?.status || '').toUpperCase())
const canCancelBatch = computed(() => {
  if (!batchDetail.value || cancelLoading.value) return false
  return ![
    'SUCCEEDED',
    'SUCCESS',
    'PARTIAL_SUCCEEDED',
    'FAILED',
    'CANCELLING',
    'CANCELLED',
    'CANCELED'
  ].includes(batchStatus.value)
})

const flatNodes = computed(() => {
  const targets = Array.isArray(batchDetail.value?.targets) ? batchDetail.value.targets : []
  return targets.flatMap((target) =>
    (Array.isArray(target.nodes) ? target.nodes : []).map((node) => ({
      ...node,
      targetId: toOpaqueId(target.targetId),
      targetKey: target.targetKey,
      ownerType: target.ownerType,
      ownerVersionId: toOpaqueId(target.ownerVersionId),
      nodeId: toOpaqueId(node.nodeId)
    }))
  )
})

async function loadTask() {
  if (!queryForm.taskId) {
    ElMessage.warning('请输入任务 ID')
    return
  }
  taskLoading.value = true
  taskError.value = ''
  try {
    taskDetail.value = await fetchAsyncTask(queryForm.taskId)
    if (taskDetail.value?.batchId !== undefined && taskDetail.value?.batchId !== null) {
      queryForm.batchId = toOpaqueId(taskDetail.value.batchId)
    }
    ElMessage.success('异步任务状态已更新')
  } catch (error) {
    taskDetail.value = null
    taskError.value = error?.message || '异步任务查询失败'
    ElMessage.error(taskError.value)
  } finally {
    taskLoading.value = false
  }
}

async function loadBatch() {
  if (!queryForm.batchId) {
    ElMessage.warning('请输入批次 ID')
    return
  }
  batchLoading.value = true
  batchError.value = ''
  try {
    batchDetail.value = await fetchCalcBatch(queryForm.batchId)
    if (batchDetail.value?.taskId !== undefined && batchDetail.value?.taskId !== null) {
      queryForm.taskId = toOpaqueId(batchDetail.value.taskId)
    }
    ElMessage.success('计算批次详情已更新')
  } catch (error) {
    batchDetail.value = null
    batchError.value = error?.message || '计算批次查询失败'
    ElMessage.error(batchError.value)
  } finally {
    batchLoading.value = false
  }
}

async function createBatch() {
  if (createLoading.value) return
  if (!createForm.ownerVersionId) {
    ElMessage.warning('请输入对象版本 ID')
    return
  }
  if (!createForm.periodStart || !createForm.periodEnd) {
    ElMessage.warning('请输入完整的计算时间范围')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将为${enumLabel(createForm.ownerType, OWNER_TYPE_LABELS)} ${createForm.ownerVersionId} 创建${enumLabel(createForm.batchType, BATCH_TYPE_LABELS)}批次。该操作会写入后端并启动异步计算，是否继续？`,
      '确认创建计算批次',
      {
        confirmButtonText: '确认创建',
        cancelButtonText: '返回核对',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  createLoading.value = true
  createFeedback.value = {
    status: 'RUNNING',
    label: '正在提交',
    message: '正在向后端创建计算批次。'
  }
  try {
    const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const accepted = await createCalcBatch(
      {
        ownerType: createForm.ownerType,
        ownerVersionId: String(createForm.ownerVersionId),
        batchType: createForm.batchType,
        periodStart: createForm.periodStart,
        periodEnd: createForm.periodEnd
      },
      `calc-center-${suffix}`
    )
    queryForm.taskId = toOpaqueId(accepted.taskId)
    queryForm.batchId = toOpaqueId(accepted.batchId)
    taskDetail.value = accepted
    createFeedback.value = {
      status: accepted.status || 'QUEUED',
      label: '创建请求已受理',
      tone: 'info',
      message: `taskId ${queryForm.taskId || '-'}，batchId ${queryForm.batchId || '-'}；请继续查询执行状态。`
    }
    ElMessage.success('计算批次创建请求已受理')
    await refreshCurrent()
  } catch (error) {
    createFeedback.value = {
      status: 'FAILED',
      label: '创建失败',
      message: error?.message || '计算批次创建失败'
    }
    ElMessage.error(createFeedback.value.message)
  } finally {
    createLoading.value = false
  }
}

async function cancelBatch() {
  const batchId = toOpaqueId(batchDetail.value?.batchId || queryForm.batchId)
  if (!batchId || !canCancelBatch.value) return
  try {
    await ElMessageBox.confirm(
      `确认向后端提交批次 ${batchId} 的取消请求？已完成的节点不会被回滚。`,
      '确认取消计算批次',
      {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        type: 'warning'
      }
    )
  } catch {
    return
  }
  cancelLoading.value = true
  queryForm.batchId = batchId
  batchActionFeedback.value = {
    status: 'CANCELLING',
    label: '正在提交取消',
    message: `正在取消批次 ${batchId}。`
  }
  try {
    await cancelCalcBatch(batchId)
    batchActionFeedback.value = {
      status: 'CANCELLING',
      label: '取消请求已提交',
      message: '最终状态以后端下一次批次查询结果为准。'
    }
    ElMessage.success('取消请求已提交')
    await loadBatch()
  } catch (error) {
    batchActionFeedback.value = {
      status: 'FAILED',
      label: '取消提交失败',
      message: error?.message || '批次取消失败'
    }
    ElMessage.error(batchActionFeedback.value.message)
  } finally {
    cancelLoading.value = false
  }
}

async function retryNode(row) {
  const nodeId = toOpaqueId(row.nodeId)
  if (!nodeId || String(row.status).toUpperCase() !== 'FAILED' || retryingNodeId.value) return
  try {
    await ElMessageBox.confirm(
      `确认重试失败节点 ${row.nodeCode || nodeId}？该操作会修改后端任务状态并增加尝试次数。`,
      '确认重试计算节点',
      {
        confirmButtonText: '确认重试',
        cancelButtonText: '返回',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  retryingNodeId.value = nodeId
  const currentBatchId = toOpaqueId(batchDetail.value?.batchId)
  if (currentBatchId) queryForm.batchId = currentBatchId
  nodeActionFeedback.value = {
    status: 'RUNNING',
    label: '正在提交重试',
    message: `节点 ${row.nodeCode || nodeId} 正在提交。`
  }
  try {
    await retryCalcNode(nodeId)
    nodeActionFeedback.value = {
      status: 'QUEUED',
      label: '重试请求已提交',
      tone: 'info',
      message: '节点是否重新执行以及最终结果以后端批次状态为准。'
    }
    ElMessage.success('节点重试请求已提交')
    await loadBatch()
  } catch (error) {
    nodeActionFeedback.value = {
      status: 'FAILED',
      label: '重试提交失败',
      message: error?.message || '节点重试失败'
    }
    ElMessage.error(nodeActionFeedback.value.message)
  } finally {
    retryingNodeId.value = ''
  }
}

async function refreshCurrent() {
  const jobs = []
  if (queryForm.taskId) jobs.push(loadTask())
  if (queryForm.batchId) jobs.push(loadBatch())
  await Promise.allSettled(jobs)
}

function toOpaqueId(value) {
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

function displayId(value) {
  return toOpaqueId(value) || '-'
}

function enumLabel(value, labels) {
  return labels[String(value || '').trim().toUpperCase()] || value || '-'
}

function technicalEnumLabel(value, labels) {
  const label = enumLabel(value, labels)
  return value && label !== value ? `${label}（${value}）` : label
}

function formatProgress(task) {
  const status = String(task?.status || '').toUpperCase()
  if (status === 'QUEUED') return '等待调度'
  if (task?.progress === undefined || task?.progress === null || task?.progress === '') return '-'
  return `${task.progress}%`
}

function stateTypeForError(message) {
  const normalized = String(message || '').toLowerCase()
  if (/401|403|unauthorized|forbidden|未登录|无权限|权限/.test(normalized)) return 'permission'
  if (/404|501|503|not found|not implemented|unavailable|未实现|不可用/.test(normalized)) return 'unavailable'
  return 'error'
}
</script>

<style scoped lang="scss">
.calc-task-page {
  min-width: 0;
}

.header-meta,
.endpoint-note {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 20px;
}

.auth-notice {
  margin-bottom: var(--idmp-space-4);
}

.operation-grid,
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.8fr);
  gap: var(--idmp-space-4);
  margin-bottom: var(--idmp-space-4);
}

.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.query-card,
.create-card,
.detail-card {
  padding: var(--idmp-space-4);
}

.query-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idmp-space-4);
}

.query-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--idmp-space-2);
}

.create-warning {
  margin-bottom: var(--idmp-space-3);
}

.create-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 var(--idmp-space-3);
}

.mono-input :deep(.el-input__inner) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.query-card :deep(.el-form-item),
.create-card :deep(.el-form-item) {
  margin-bottom: var(--idmp-space-3);
}

.query-card :deep(.el-input),
.create-card :deep(.el-input),
.create-card :deep(.el-select) {
  width: 100%;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid var(--idmp-border-subtle);
  border-left: 1px solid var(--idmp-border-subtle);
}

.detail-list > div {
  min-width: 0;
  padding: var(--idmp-space-3);
  border-right: 1px solid var(--idmp-border-subtle);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.detail-list__wide {
  grid-column: 1 / -1;
}

.detail-list dt {
  margin-bottom: var(--idmp-space-1);
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.detail-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--idmp-text-primary);
  line-height: 20px;
}

.status-row dd {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--idmp-space-2);
}

.status-code {
  color: var(--idmp-text-helper);
  font-size: 11px;
}

.operation-feedback {
  display: flex;
  align-items: flex-start;
  margin-top: var(--idmp-space-3);
  padding-top: var(--idmp-space-3);
  gap: var(--idmp-space-2);
  border-top: 1px solid var(--idmp-border-subtle);
  color: var(--idmp-text-secondary);
  line-height: 22px;
}

.operation-feedback > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.node-card {
  margin-bottom: var(--idmp-space-4);
}

.node-feedback {
  margin: 0 0 var(--idmp-space-3);
  padding: var(--idmp-space-2) 0 var(--idmp-space-3);
}

@media (max-width: 1450px) {
  .operation-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .query-controls,
  .create-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
