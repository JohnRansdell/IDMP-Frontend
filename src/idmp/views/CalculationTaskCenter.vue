<template>
  <div class="idmp-page calc-task-page">
    <PageHeader title="计算任务中心">
      <template #actions>
        <el-button :icon="Refresh" :disabled="!queryForm.batchId && !queryForm.taskId" @click="refreshCurrent">
          刷新状态
        </el-button>
      </template>
    </PageHeader>

    <section class="task-overview">
      <article class="surface-card task-card">
        <div class="task-card__head">
          <h2>查询异步任务</h2>
          <span>GET /async-tasks/{taskId}</span>
        </div>
        <el-form label-width="86px" @submit.prevent="loadTask">
          <el-form-item label="任务 ID">
            <el-input v-model.trim="queryForm.taskId" placeholder="例如：101996817981379215" />
          </el-form-item>
          <el-button type="primary" :loading="taskLoading" @click="loadTask">查询任务</el-button>
        </el-form>
      </article>

      <article class="surface-card task-card">
        <div class="task-card__head">
          <h2>查询计算批次</h2>
          <span>GET /calc/batches/{batchId}</span>
        </div>
        <el-form label-width="86px" @submit.prevent="loadBatch">
          <el-form-item label="批次 ID">
            <el-input v-model.trim="queryForm.batchId" placeholder="例如：101996817981379215" />
          </el-form-item>
          <div class="task-card__actions">
            <el-button type="primary" :loading="batchLoading" @click="loadBatch">查询批次</el-button>
            <el-button :disabled="!batchDetail" :loading="cancelLoading" @click="cancelBatch">取消批次</el-button>
          </div>
        </el-form>
      </article>

      <article class="surface-card task-card">
        <div class="task-card__head">
          <h2>创建计算批次</h2>
          <span>POST /calc/batches</span>
        </div>
        <el-form :model="createForm" label-width="94px" @submit.prevent="createBatch">
          <el-form-item label="对象类型">
            <el-select v-model="createForm.ownerType">
              <el-option label="指标版本" value="INDICATOR" />
              <el-option label="因子版本" value="FACTOR" />
            </el-select>
          </el-form-item>
          <el-form-item label="版本 ID">
            <el-input v-model.trim="createForm.ownerVersionId" placeholder="输入指标/因子版本 ID" />
          </el-form-item>
          <el-form-item label="批次类型">
            <el-select v-model="createForm.batchType">
              <el-option label="试算 TRIAL" value="TRIAL" />
              <el-option label="正式 FULL" value="FULL" />
              <el-option label="重算 RECALC" value="RECALC" />
            </el-select>
          </el-form-item>
          <div class="date-row">
            <el-form-item label="开始时间">
              <el-input v-model="createForm.periodStart" />
            </el-form-item>
            <el-form-item label="结束时间">
              <el-input v-model="createForm.periodEnd" />
            </el-form-item>
          </div>
          <el-button type="primary" :loading="createLoading" @click="createBatch">创建批次</el-button>
        </el-form>
      </article>
    </section>

    <section class="task-status-grid">
      <article class="surface-card status-card">
        <h2>异步任务状态</h2>
        <el-empty v-if="!taskDetail" description="输入任务 ID 后查询" />
        <dl v-else class="status-detail">
          <div><dt>任务 ID</dt><dd>{{ taskDetail.taskId }}</dd></div>
          <div><dt>批次 ID</dt><dd>{{ taskDetail.batchId }}</dd></div>
          <div><dt>任务类型</dt><dd>{{ taskDetail.taskType }}</dd></div>
          <div><dt>状态</dt><dd><span class="status-pill" :class="statusClass(taskDetail.status)">{{ taskDetail.status }}</span></dd></div>
          <div><dt>进度</dt><dd>{{ taskDetail.progress ?? '-' }}%</dd></div>
          <div><dt>开始时间</dt><dd>{{ taskDetail.startedAt || '-' }}</dd></div>
          <div><dt>结束时间</dt><dd>{{ taskDetail.finishedAt || '-' }}</dd></div>
          <div><dt>错误信息</dt><dd>{{ taskDetail.errorMessage || '-' }}</dd></div>
        </dl>
      </article>

      <article class="surface-card status-card">
        <h2>计算批次概览</h2>
        <el-empty v-if="!batchDetail" description="输入批次 ID 后查询" />
        <dl v-else class="status-detail">
          <div><dt>批次 ID</dt><dd>{{ batchDetail.batchId }}</dd></div>
          <div><dt>任务 ID</dt><dd>{{ batchDetail.taskId }}</dd></div>
          <div><dt>批次编码</dt><dd>{{ batchDetail.batchCode || '-' }}</dd></div>
          <div><dt>批次类型</dt><dd>{{ batchDetail.batchType || '-' }}</dd></div>
          <div><dt>状态</dt><dd><span class="status-pill" :class="statusClass(batchDetail.status)">{{ batchDetail.status }}</span></dd></div>
          <div><dt>目标数</dt><dd>{{ batchDetail.targetCount ?? '-' }}</dd></div>
          <div><dt>成功/失败</dt><dd>{{ batchDetail.succeededCount ?? 0 }} / {{ batchDetail.failedCount ?? 0 }}</dd></div>
          <div><dt>错误信息</dt><dd>{{ batchDetail.errorMessage || '-' }}</dd></div>
        </dl>
      </article>
    </section>

    <section class="surface-card node-card">
      <div class="node-card__head">
        <h2>计算目标与节点</h2>
        <span>{{ flatNodes.length }} 个节点</span>
      </div>
      <el-table :data="flatNodes" table-layout="fixed" empty-text="暂无节点数据">
        <el-table-column prop="targetKey" label="目标" min-width="170" show-overflow-tooltip />
        <el-table-column prop="ownerType" label="对象类型" width="92" />
        <el-table-column prop="ownerVersionId" label="版本 ID" width="150" />
        <el-table-column prop="nodeCode" label="节点编码" min-width="190" show-overflow-tooltip />
        <el-table-column prop="nodeType" label="节点类型" width="116" />
        <el-table-column label="状态" width="116">
          <template #default="{ row }">
            <span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="attemptNo" label="尝试次数" width="92" />
        <el-table-column prop="workerId" label="Worker" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="112" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" :disabled="row.status !== 'FAILED'" @click="retryNode(row)">
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
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

const taskDetail = ref(null)
const batchDetail = ref(null)
const taskLoading = ref(false)
const batchLoading = ref(false)
const createLoading = ref(false)
const cancelLoading = ref(false)

const flatNodes = computed(() => {
  const targets = Array.isArray(batchDetail.value?.targets) ? batchDetail.value.targets : []
  return targets.flatMap((target) =>
    (target.nodes || []).map((node) => ({
      ...node,
      targetId: target.targetId,
      targetKey: target.targetKey,
      ownerType: target.ownerType,
      ownerVersionId: target.ownerVersionId
    }))
  )
})

async function loadTask() {
  if (!queryForm.taskId) {
    ElMessage.warning('请输入任务 ID')
    return
  }
  taskLoading.value = true
  try {
    taskDetail.value = await fetchAsyncTask(queryForm.taskId)
    if (taskDetail.value?.batchId) queryForm.batchId = String(taskDetail.value.batchId)
    ElMessage.success('异步任务状态已更新')
  } catch (error) {
    ElMessage.error(error?.message || '异步任务查询失败')
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
  try {
    batchDetail.value = await fetchCalcBatch(queryForm.batchId)
    if (batchDetail.value?.taskId) queryForm.taskId = String(batchDetail.value.taskId)
    ElMessage.success('计算批次详情已更新')
  } catch (error) {
    ElMessage.error(error?.message || '计算批次查询失败')
  } finally {
    batchLoading.value = false
  }
}

async function createBatch() {
  if (!createForm.ownerVersionId) {
    ElMessage.warning('请输入对象版本 ID')
    return
  }
  createLoading.value = true
  try {
    const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const accepted = await createCalcBatch(
      {
        ownerType: createForm.ownerType,
        ownerVersionId: Number(createForm.ownerVersionId),
        batchType: createForm.batchType,
        periodStart: createForm.periodStart,
        periodEnd: createForm.periodEnd
      },
      `calc-center-${suffix}`
    )
    queryForm.taskId = String(accepted.taskId)
    queryForm.batchId = String(accepted.batchId)
    taskDetail.value = accepted
    ElMessage.success('计算批次已创建')
    await refreshCurrent()
  } catch (error) {
    ElMessage.error(error?.message || '计算批次创建失败')
  } finally {
    createLoading.value = false
  }
}

async function cancelBatch() {
  if (!queryForm.batchId) return
  try {
    await ElMessageBox.confirm('确认取消当前计算批次？仅未结束批次可以取消。', '操作确认', {
      confirmButtonText: '确认取消',
      cancelButtonText: '返回',
      type: 'warning'
    })
  } catch {
    return
  }
  cancelLoading.value = true
  try {
    await cancelCalcBatch(queryForm.batchId)
    ElMessage.success('取消请求已提交')
    await loadBatch()
  } catch (error) {
    ElMessage.error(error?.message || '批次取消失败')
  } finally {
    cancelLoading.value = false
  }
}

async function retryNode(row) {
  try {
    await retryCalcNode(row.nodeId)
    ElMessage.success('节点重试请求已提交')
    await loadBatch()
  } catch (error) {
    ElMessage.error(error?.message || '节点重试失败')
  }
}

async function refreshCurrent() {
  const jobs = []
  if (queryForm.taskId) jobs.push(loadTask())
  if (queryForm.batchId) jobs.push(loadBatch())
  await Promise.allSettled(jobs)
}

function statusClass(status) {
  if (['SUCCEEDED', 'SUCCESS', 'READY', 'ACTIVE'].includes(status)) return 'is-success'
  if (['FAILED', 'CANCELED', 'CANCELLED', 'INVALID'].includes(status)) return 'is-danger'
  if (['RUNNING', 'QUEUED', 'PENDING', 'LEASED'].includes(status)) return 'is-warning'
  return 'is-muted'
}
</script>

<style scoped lang="scss">
.task-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.task-card,
.status-card,
.node-card {
  padding: 16px 18px;
}

.task-card__head,
.node-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 16px;

  h2 {
    margin: 0;
    color: #262626;
    font-size: 16px;
    line-height: 24px;
  }

  span {
    color: #8c8c8c;
    font-size: 12px;
  }
}

.task-card :deep(.el-select),
.task-card :deep(.el-input) {
  width: 100%;
}

.task-card__actions,
.date-row {
  display: flex;
  gap: 8px;
}

.date-row {
  :deep(.el-form-item) {
    flex: 1;
  }
}

.task-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.status-card h2 {
  margin: 0 0 14px;
  color: #262626;
  font-size: 16px;
}

.status-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  gap: 10px 18px;

  div {
    min-width: 0;
  }

  dt {
    color: #8c8c8c;
    font-size: 12px;
  }

  dd {
    min-height: 22px;
    margin: 3px 0 0;
    overflow: hidden;
    color: #262626;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.status-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  background: #f2f3f5;
  color: #6b7280;
  font-size: 12px;

  &.is-success {
    background: #f6ffed;
    color: #389e0d;
  }

  &.is-warning {
    background: #fffbe6;
    color: #d48806;
  }

  &.is-danger {
    background: #fff1f0;
    color: #cf1322;
  }
}

@media (max-width: 1450px) {
  .task-overview {
    grid-template-columns: 1fr;
  }
}
</style>
