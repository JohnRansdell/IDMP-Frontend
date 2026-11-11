<template>
  <div class="idmp-page calc-task-page">
    <PageHeader
      title="计算任务中心"
    >
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

    <section class="operation-grid">
      <article class="surface-card query-card">
        <div class="section-title">
          <div>
            <h2>查询任务与批次</h2>
          </div>
        </div>
        <div class="query-controls">
          <el-form v-query-enter label-position="top" @submit.prevent="queryTask">
            <el-form-item label="异步任务 ID">
              <el-input v-model.trim="queryForm.taskId" class="mono-input" placeholder="输入完整任务 ID" />
            </el-form-item>
            <el-button :loading="taskLoading" native-type="submit">查询任务</el-button>
          </el-form>
          <el-form v-query-enter label-position="top" @submit.prevent="queryBatch">
            <el-form-item label="计算批次 ID">
              <el-input v-model.trim="queryForm.batchId" class="mono-input" placeholder="输入完整批次 ID" />
            </el-form-item>
            <div class="query-actions">
              <el-button :loading="batchLoading" native-type="submit">查询批次</el-button>
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
          </div>
        </div>
        <div class="notice-strip is-warning create-warning">
          提交前请核对对象版本和时间范围。提交成功不代表计算完成，请查看后续计算状态。
        </div>
        <el-form :model="createForm" label-position="top" :disabled="createBusy" @submit.prevent="createBatch">
          <div class="create-form-grid">
            <el-form-item label="对象类型">
              <el-select v-model="createForm.ownerType" @change="handleOwnerTypeChange">
                <el-option label="指标" value="INDICATOR" />
                <el-option label="因子" value="FACTOR" />
              </el-select>
            </el-form-item>
            <el-form-item :label="createForm.ownerType === 'INDICATOR' ? '指标' : '因子'">
              <el-select default-first-option
                v-model="createForm.ownerId"
                class="owner-select"
                filterable remote clearable
                :remote-method="searchOwners"
                :loading="ownerOptionsLoading || ownerInitializing"
                placeholder="按名称搜索"
                @change="handleOwnerChange"
                @visible-change="handleOwnerSelectVisible"
              >
                <el-option v-for="owner in ownerOptions" :key="owner.id" :label="owner.label" :value="owner.id" />
              </el-select>
              <small v-if="ownerOptionsError" class="form-help is-error">{{ ownerOptionsError }}
                <el-button link type="primary" @click="loadOwnerOptions(ownerSearch)">重试</el-button>
              </small>
            </el-form-item>
            <el-form-item label="版本">
              <el-select
                v-model="createForm.ownerVersionId"
                class="owner-version-select"
                :disabled="!createForm.ownerId || versionOptionsLoading"
                :loading="versionOptionsLoading"
                placeholder="选择版本"
                :no-data-text="versionOptionsError || '当前对象暂无版本'"
              >
                <el-option v-for="version in versionOptions" :key="version.id"
                  :label="version.label" :value="version.id" :disabled="!isVersionEligible(version)">
                  <span>{{ version.label }}</span>
                  <span v-if="!isVersionEligible(version)" class="version-option-reason">{{ versionUnavailableReason(version) }}</span>
                </el-option>
              </el-select>
              <small v-if="versionOptionsError" class="form-help is-error">{{ versionOptionsError }}
                <el-button link type="primary" @click="loadOwnerVersions()">重试</el-button>
              </small>
              <small v-else-if="createForm.ownerId && !versionOptionsLoading && !createForm.ownerVersionId" class="form-help">
                {{ versionOptions.length ? '暂无符合当前计算类型的版本' : '当前对象暂无版本' }}
              </small>
            </el-form-item>
            <el-form-item label="批次类型">
              <el-select v-model="createForm.batchType">
                <el-option label="试算" value="TRIAL" />
                <el-option label="正式计算" value="FULL" />
                <el-option label="重算" value="RECALC" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="createForm.ownerType === 'INDICATOR' && ['FULL', 'RECALC'].includes(createForm.batchType)" label="场景版本（可选）">
              <el-select default-first-option
                v-model="createForm.scenarioVersionId"
                class="scene-version-select"
                filterable
                clearable
                :loading="sceneOptionsLoading"
                placeholder="请选择已发布的关联场景"
                @visible-change="handleScenarioSelectVisible"
              >
                <el-option
                  v-for="scene in sceneOptions"
                  :key="scene.id"
                  :label="scene.label"
                  :value="scene.id"
                />
              </el-select>
              <el-button link type="primary" :loading="sceneOptionsLoading" @click="loadSceneOptions">加载关联场景</el-button>
              <small class="form-help">选择后将以该场景的覆盖规则创建正式计算；留空则创建非场景计算。</small>
            </el-form-item>
            <el-form-item label="开始时间">
              <el-date-picker
                v-model="createForm.periodStart"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择开始时间"
                :editable="false"
                :disabled-date="disableStartDate"
              />
            </el-form-item>
            <el-form-item label="结束时间">
              <el-date-picker
                v-model="createForm.periodEnd"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择结束时间"
                :editable="false"
                :disabled-date="disableEndDate"
              />
            </el-form-item>
          </div>
          <el-button type="primary" :loading="createBusy" :disabled="!selectedVersion || !isVersionEligible(selectedVersion) || versionOptionsLoading" @click="createBatch">确认并创建批次</el-button>
        </el-form>
        <div v-if="createFeedback" class="operation-feedback">
          <StatusBadge
            :status="createFeedback.status"
            :label="createFeedback.label"
            :tone="createFeedback.tone"
          />
          <span>{{ createFeedback.message }}</span>
          <el-button v-if="returnToAnalysis" link type="primary" @click="returnToScenarioComparison">返回场景对比</el-button>
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
            <el-button :disabled="!queryForm.taskId" @click="queryTask">重试查询</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!taskDetail"
          type="empty"
          title="尚未查询任务"
          description="请输入任务 ID。"
        >
          <template #actions>
            <el-button :disabled="!queryForm.taskId" @click="queryTask">查询任务</el-button>
          </template>
        </StatePanel>
        <dl v-else class="detail-list">
          <div><dt>任务 ID</dt><dd class="mono-data">{{ displayId(taskDetail.taskId) }}</dd></div>
          <div><dt>批次 ID</dt><dd class="mono-data">{{ displayId(taskDetail.batchId) }}</dd></div>
          <div><dt>任务类型</dt><dd>{{ enumLabel(taskDetail.taskType, TASK_TYPE_LABELS) }}</dd></div>
          <div class="status-row">
            <dt>状态</dt>
            <dd>
              <StatusBadge :status="taskDetail.status" />
            </dd>
          </div>
          <div><dt>进度</dt><dd>{{ formatProgress(taskDetail) }}</dd></div>
          <div><dt>开始时间</dt><dd class="mono-data">{{ taskDetail.startedAt || '-' }}</dd></div>
          <div><dt>结束时间</dt><dd class="mono-data">{{ taskDetail.finishedAt || '-' }}</dd></div>
          <div><dt>追踪编号</dt><dd class="mono-data">{{ displayId(taskDetail.traceId) }}</dd></div>
          <div class="detail-list__wide"><dt>错误信息</dt><dd>{{ taskDetail.errorMessage || '-' }}</dd></div>
        </dl>
      </article>

      <article id="batch-overview" ref="batchOverview" class="surface-card detail-card">
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
            <el-button :disabled="!queryForm.batchId" @click="queryBatch">重试查询</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!batchDetail"
          type="empty"
          title="尚未查询批次"
          description="请输入批次 ID。"
        >
          <template #actions>
            <el-button :disabled="!queryForm.batchId" @click="queryBatch">查询批次</el-button>
          </template>
        </StatePanel>
        <dl v-else class="detail-list">
          <div><dt>批次 ID</dt><dd class="mono-data">{{ displayId(batchDetail.batchId) }}</dd></div>
          <div><dt>任务 ID</dt><dd class="mono-data">{{ displayId(batchDetail.taskId) }}</dd></div>
          <div><dt>批次编码</dt><dd class="mono-data">{{ batchDetail.batchCode || '-' }}</dd></div>
          <div><dt>批次类型</dt><dd>{{ enumLabel(batchDetail.batchType, BATCH_TYPE_LABELS) }}</dd></div>
          <div class="status-row">
            <dt>状态</dt>
            <dd>
              <StatusBadge :status="batchDetail.status" />
            </dd>
          </div>
          <div><dt>目标数</dt><dd class="clinical-metric">{{ batchDetail.targetCount ?? '-' }}</dd></div>
          <div>
            <dt>成功 / 失败</dt>
            <dd class="clinical-metric">{{ batchDetail.succeededCount ?? 0 }} / {{ batchDetail.failedCount ?? 0 }}</dd>
          </div>
          <div><dt>追踪编号</dt><dd class="mono-data">{{ displayId(batchDetail.traceId) }}</dd></div>
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
        </div>
        <span v-if="batchDetail" class="endpoint-note">{{ batchDetail.targetCount }} 个目标</span>
      </div>
      <div v-if="nodeActionFeedback" class="operation-feedback node-feedback">
        <StatusBadge
          :status="nodeActionFeedback.status"
          :label="nodeActionFeedback.label"
          :tone="nodeActionFeedback.tone"
        />
        <span>{{ nodeActionFeedback.message }}</span>
      </div>
      <StatePanel v-if="batchLoading && !batchDetail" type="loading" title="正在加载计算节点" />
      <StatePanel
        v-else-if="batchError"
        :type="stateTypeForError(batchError)"
        title="节点数据不可读取"
        :description="batchError"
      >
        <template #actions>
          <el-button :disabled="!queryForm.batchId" @click="queryBatch">重试查询批次</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!batchDetail"
        type="empty"
        title="尚无批次上下文"
        description="先查询一个计算批次，再查看其计算目标和节点。"
      />
      <CalculationBatchTargets v-else :key="displayId(batchDetail.batchId)" :overview="batchDetail" :retrying-node-id="retryingNodeId" @retry="retryNode" />
    </section>
  </div>
</template>

<script setup>
import { toOpaqueId } from '@/idmp/utils/resourceId.js'
import { calculationQueryIds, validateCalculationQueryId, calculationQueryError } from '@/idmp/utils/calculationQuery.js'

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import CalculationBatchTargets from '@/idmp/components/CalculationBatchTargets.vue'
import {
  cancelCalcBatch,
  createCalcBatch,
  fetchAsyncTask,
  fetchCalcBatchOverview as fetchCalcBatch,
  retryCalcNode
} from '@/idmp/api/modules/calculation'
import { fetchIndicator, fetchIndicators, fetchIndicatorScenarios, fetchIndicatorVersion, fetchIndicatorVersions } from '@/idmp/api/modules/indicators'
import { fetchFactor, fetchFactors, fetchFactorVersion, fetchFactorVersionsByFactor } from '@/idmp/api/modules/factors'
import { getStatusLabel } from '@/idmp/design/status'
import { canRetryCalculationNode } from '@/idmp/utils/calculationGraph'

const route = useRoute()
const router = useRouter()
const batchOverview = ref(null)
const queryForm = reactive(calculationQueryIds(route.query))

const createForm = reactive({
  ownerType: String(route.query.ownerType || 'INDICATOR'),
  ownerId: '',
  ownerVersionId: '',
  batchType: String(route.query.batchType || 'TRIAL'),
  scenarioVersionId: String(route.query.scenarioVersionId || ''),
  periodStart: String(route.query.periodStart || '2000-01-01T00:00:00'),
  periodEnd: String(route.query.periodEnd || '2030-01-01T00:00:00')
})
const returnToAnalysis = computed(() => route.query.returnTo === '/analysis')

function disableStartDate(date) {
  if (!createForm.periodEnd) return false
  return startOfDay(date) > startOfDay(createForm.periodEnd)
}

function disableEndDate(date) {
  if (!createForm.periodStart) return false
  return startOfDay(date) < startOfDay(createForm.periodStart)
}

function startOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(String(value || ''))
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const OWNER_TYPE_LABELS = { INDICATOR: '指标版本', FACTOR: '因子版本' }
const BATCH_TYPE_LABELS = { TRIAL: '试算', FULL: '正式计算', RECALC: '重算' }
const TASK_TYPE_LABELS = { FACTOR_TRIAL: '因子试算', INDICATOR_TRIAL: '指标试算', FACTOR_CALC: '因子计算', INDICATOR_CALC: '指标计算' }

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
const sceneOptions = ref([])
const sceneOptionsLoading = ref(false)
const preparingBatch = ref(false)
const createBusy = computed(() => preparingBatch.value || createLoading.value)
const ownerOptions = ref([])
const ownerOptionsLoading = ref(false)
const ownerInitializing = ref(false)
const ownerOptionsError = ref('')
const ownerSearch = ref('')
const versionOptions = ref([])
const versionOptionsLoading = ref(false)
const versionOptionsError = ref('')
const selectedVersion = computed(() => versionOptions.value.find(item => item.id === createForm.ownerVersionId))
const selectedOwner = computed(() => ownerOptions.value.find(item => item.id === createForm.ownerId))
let ownerRequest = 0, versionRequest = 0, sceneRequest = 0, initializationRequest = 0
let ownerSearchTimer

function listRows(payload) {
  return Array.isArray(payload) ? payload : payload?.records || payload?.items || payload?.list || []
}

function normalizeOwner(item) {
  const id = toOpaqueId(item.id)
  const name = item.name || item.indicatorName || item.factorName || '未命名'
  return { ...item, id, label: name }
}

function isVersionEligible(version) {
  return Boolean(version?.currentArtifactId)
    && (createForm.batchType === 'TRIAL'
      ? ['DRAFT', 'PUBLISHED'].includes(version.status)
      : version.status === 'PUBLISHED')
}

function versionUnavailableReason(version) {
  if (!version.currentArtifactId) return '需先编译'
  if (createForm.batchType !== 'TRIAL' && version.status !== 'PUBLISHED') return '需先发布'
  return '当前状态不可计算'
}

function chooseDefaultVersion(preferredId = '') {
  const eligible = versionOptions.value.filter(isVersionEligible)
  const preferred = eligible.find(item => item.id === preferredId)
  createForm.ownerVersionId = (preferred || eligible.find(item => item.status === 'PUBLISHED') || eligible[0])?.id || ''
}

function clearScenes() {
  ++sceneRequest
  sceneOptions.value = []
  sceneOptionsLoading.value = false
  createForm.scenarioVersionId = ''
}

function clearVersions() {
  ++versionRequest
  versionOptions.value = []
  versionOptionsError.value = ''
  versionOptionsLoading.value = false
  createForm.ownerVersionId = ''
  clearScenes()
  createFeedback.value = null
}

function handleOwnerTypeChange() {
  ++initializationRequest
  ownerInitializing.value = false
  createForm.ownerId = ''
  ownerOptions.value = []
  clearVersions()
  loadOwnerOptions('')
}

function handleOwnerChange() {
  ++initializationRequest
  ownerInitializing.value = false
  clearVersions()
  if (createForm.ownerId) loadOwnerVersions()
}

function searchOwners(keyword) {
  clearTimeout(ownerSearchTimer)
  ++ownerRequest
  ownerSearch.value = keyword
  ownerOptionsLoading.value = true
  ownerSearchTimer = setTimeout(() => loadOwnerOptions(keyword), 250)
}

function handleOwnerSelectVisible(visible) {
  if (visible && !ownerOptions.value.length && !ownerOptionsLoading.value) loadOwnerOptions('')
}

async function loadOwnerOptions(keyword = '') {
  clearTimeout(ownerSearchTimer)
  ownerSearch.value = keyword
  const revision = ++ownerRequest
  const ownerType = createForm.ownerType
  ownerOptionsLoading.value = true
  ownerOptionsError.value = ''
  try {
    const fetchOwners = ownerType === 'INDICATOR' ? fetchIndicators : fetchFactors
    const params = { page: 1, size: 50 }
    // The list API has separate name/code filters, not a combined keyword filter.
    const results = keyword.trim()
      ? await Promise.all([fetchOwners({ ...params, name: keyword.trim() }), fetchOwners({ ...params, code: keyword.trim() })])
      : [await fetchOwners(params)]
    if (revision !== ownerRequest || ownerType !== createForm.ownerType) return
    const selected = selectedOwner.value
    const rows = results.flatMap(listRows).map(normalizeOwner).filter(item => item.id)
    ownerOptions.value = [...new Map([...(selected ? [selected] : []), ...rows].map(item => [item.id, item])).values()]
  } catch (error) {
    if (revision !== ownerRequest) return
    ownerOptions.value = selectedOwner.value ? [selectedOwner.value] : []
    ownerOptionsError.value = error?.message || '列表加载失败，请重试'
  } finally {
    if (revision === ownerRequest) ownerOptionsLoading.value = false
  }
}

async function loadOwnerVersions(preferredId = '') {
  const ownerId = createForm.ownerId, ownerType = createForm.ownerType
  if (!ownerId) return
  const revision = ++versionRequest
  versionOptionsLoading.value = true
  versionOptionsError.value = ''
  createForm.ownerVersionId = ''
  clearScenes()
  try {
    const options = { cache: 'no-store' }
    const payload = await (ownerType === 'INDICATOR' ? fetchIndicatorVersions(ownerId, options) : fetchFactorVersionsByFactor(ownerId, options))
    if (revision !== versionRequest || ownerId !== createForm.ownerId || ownerType !== createForm.ownerType) return
    versionOptions.value = listRows(payload).map(item => ({
      ...item, id: toOpaqueId(item.id || item.versionId), status: String(item.status || item.publicationStatus || '').toUpperCase(),
      label: `V${item.versionNo ?? '-'} · ${getStatusLabel(item.status || item.publicationStatus)}`
    })).filter(item => item.id).sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0))
    chooseDefaultVersion(preferredId)
  } catch (error) {
    if (revision !== versionRequest) return
    versionOptions.value = []
    versionOptionsError.value = error?.message || '版本加载失败，请重试'
  } finally {
    if (revision === versionRequest) versionOptionsLoading.value = false
  }
}

async function initializeOwnerSelection() {
  const preferredId = toOpaqueId(route.query.ownerVersionId)
  if (!preferredId) { loadOwnerOptions(''); return }
  const revision = ++initializationRequest
  const ownerType = createForm.ownerType
  ownerInitializing.value = true
  try {
    const options = { cache: 'no-store' }
    const version = await (ownerType === 'INDICATOR' ? fetchIndicatorVersion(preferredId, options) : fetchFactorVersion(preferredId, options))
    const ownerId = toOpaqueId(ownerType === 'INDICATOR' ? version.indicatorId : version.factorId)
    if (!ownerId) throw new Error('无法确认所选版本所属的指标或因子')
    const owner = await (ownerType === 'INDICATOR' ? fetchIndicator(ownerId) : fetchFactor(ownerId))
    if (revision !== initializationRequest || ownerType !== createForm.ownerType) return
    ownerOptions.value = [normalizeOwner(owner)]
    createForm.ownerId = ownerId
    await loadOwnerVersions(preferredId)
    await nextTick()
    if (revision === initializationRequest && createForm.ownerVersionId === preferredId) {
      createForm.scenarioVersionId = String(route.query.scenarioVersionId || '')
    }
  } catch (error) {
    if (revision === initializationRequest) ownerOptionsError.value = error?.message || '预选版本加载失败，请重新选择'
  } finally {
    if (revision === initializationRequest) ownerInitializing.value = false
  }
}

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

function normalizeScenarioOptions(payload) {
  const records = Array.isArray(payload) ? payload : payload?.records || payload?.items || payload?.list || []
  return records.map((item) => {
    const id = toOpaqueId(item.scenarioVersionId || item.versionId || item.id)
    const name = item.scenarioName || item.name || '未命名场景'
    const period = item.configuredPeriodType || item.defaultPeriodType || ''
    return { id, label: `${name}${period ? ` · ${period}` : ''}` }
  }).filter((item) => item.id)
}

async function loadSceneOptions() {
  if (createForm.ownerType !== 'INDICATOR' || !createForm.ownerVersionId) {
    ElMessage.warning('请先选择指标和版本，再加载关联场景')
    return
  }
  const revision = ++sceneRequest
  const versionId = createForm.ownerVersionId
  sceneOptionsLoading.value = true
  try {
    const version = await fetchIndicatorVersion(versionId, { cache: 'no-store' })
    const indicatorId = toOpaqueId(version?.indicatorId || version?.indicator?.id)
    if (!indicatorId) throw new Error('指标信息读取失败，请刷新后重试')
    const options = normalizeScenarioOptions(await fetchIndicatorScenarios(indicatorId, { page: 1, size: 200 }))
    if (revision !== sceneRequest || versionId !== createForm.ownerVersionId) return
    sceneOptions.value = options
    if (!sceneOptions.value.length) ElMessage.info('当前指标版本暂无已关联场景')
  } catch (error) {
    if (revision !== sceneRequest) return
    sceneOptions.value = []
    ElMessage.warning(error?.message || '关联场景加载失败，请刷新后重新选择场景')
  } finally {
    if (revision === sceneRequest) sceneOptionsLoading.value = false
  }
}

function handleScenarioSelectVisible(visible) {
  if (visible && !sceneOptions.value.length && !sceneOptionsLoading.value) loadSceneOptions()
}

watch(() => createForm.ownerVersionId, () => {
  clearScenes()
})

watch(() => createForm.batchType, () => {
  clearScenes()
  if (!selectedVersion.value || !isVersionEligible(selectedVersion.value)) chooseDefaultVersion()
})

let taskQueryRevision = 0, batchQueryRevision = 0, queryDisposed = false

async function loadTask() {
  const revision = ++taskQueryRevision
  const taskId = queryForm.taskId.trim()
  const batchId = queryForm.batchId.trim(), batchRevision = batchQueryRevision
  const current = () => !queryDisposed && revision === taskQueryRevision && batchRevision === batchQueryRevision
    && queryForm.taskId.trim() === taskId && queryForm.batchId.trim() === batchId
  const validation = validateCalculationQueryId(taskId, '任务')
  if (validation) {
    taskLoading.value = false
    taskDetail.value = null
    taskError.value = ''
    ElMessage.warning(validation)
    return false
  }
  taskLoading.value = true
  taskError.value = ''
  if (String(taskDetail.value?.taskId || '') !== taskId) taskDetail.value = null
  try {
    const detail = await fetchAsyncTask(taskId)
    if (!current()) return false
    taskDetail.value = detail
    const linkedId = toOpaqueId(detail?.batchId)
    if (linkedId !== queryForm.batchId.trim()) { batchDetail.value = null; batchError.value = '' }
    queryForm.batchId = linkedId
    ElMessage.success('异步任务状态已更新')
    return true
  } catch (error) {
    if (!current()) return false
    taskDetail.value = null
    taskError.value = calculationQueryError(error, '异步任务')
    ElMessage.error(taskError.value)
    return false
  } finally {
    if (!queryDisposed && revision === taskQueryRevision) taskLoading.value = false
  }
}

async function loadBatch() {
  const revision = ++batchQueryRevision
  const batchId = queryForm.batchId.trim()
  const taskId = queryForm.taskId.trim(), taskRevision = taskQueryRevision
  const current = () => !queryDisposed && revision === batchQueryRevision && taskRevision === taskQueryRevision
    && queryForm.batchId.trim() === batchId && queryForm.taskId.trim() === taskId
  const validation = validateCalculationQueryId(batchId, '批次')
  if (validation) {
    batchLoading.value = false
    batchDetail.value = null
    batchError.value = ''
    ElMessage.warning(validation)
    return false
  }
  batchLoading.value = true
  batchError.value = ''
  if (String(batchDetail.value?.batchId || '') !== batchId) batchDetail.value = null
  try {
    const detail = await fetchCalcBatch(batchId)
    if (!current()) return false
    batchDetail.value = detail
    const linkedId = toOpaqueId(detail?.taskId)
    if (linkedId !== queryForm.taskId.trim()) { taskDetail.value = null; taskError.value = '' }
    queryForm.taskId = linkedId
    ElMessage.success('计算批次详情已更新')
    return true
  } catch (error) {
    if (!current()) return false
    batchDetail.value = null
    batchError.value = calculationQueryError(error, '计算批次')
    ElMessage.error(batchError.value)
    return false
  } finally {
    if (!queryDisposed && revision === batchQueryRevision) batchLoading.value = false
  }
}

async function createBatch() {
  if (createBusy.value) return
  preparingBatch.value = true
  try {
    await createSelectedBatch()
  } finally {
    preparingBatch.value = false
  }
}

async function createSelectedBatch() {
  if (!createForm.ownerId || !selectedVersion.value || !isVersionEligible(selectedVersion.value) || versionOptionsLoading.value) {
    ElMessage.warning('请先选择指标或因子及可计算的版本')
    return
  }
  try {
    const ownerVersion = createForm.ownerType === 'INDICATOR'
      ? await fetchIndicatorVersion(createForm.ownerVersionId, { cache: 'no-store' })
      : await fetchFactorVersion(createForm.ownerVersionId, { cache: 'no-store' })
    const ownerId = toOpaqueId(createForm.ownerType === 'INDICATOR' ? ownerVersion.indicatorId : ownerVersion.factorId)
    if (ownerId !== createForm.ownerId || !isVersionEligible({ ...ownerVersion, status: String(ownerVersion.status || '').toUpperCase() })) {
      ElMessage.warning('所选版本状态已变化，请重新选择可计算的版本')
      await loadOwnerVersions()
      return
    }
    if (resolveOwnerCalculationMode(ownerVersion) === 'STATIC') {
      ElMessage.warning('静态版本不能在计算任务中心手工创建周期批次；请通过发布动作返回的初始化批次跟踪全量计算')
      return
    }
  } catch (error) {
    ElMessage.warning(error?.message || '无法确认对象版本的计算模式，已停止创建批次')
    return
  }
  if (!createForm.periodStart || !createForm.periodEnd) {
    ElMessage.warning('请输入完整的计算时间范围')
    return
  }
  if (new Date(createForm.periodStart).getTime() > new Date(createForm.periodEnd).getTime()) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将为“${selectedOwner.value?.name || selectedOwner.value?.label || '所选对象'}” ${selectedVersion.value.label} 创建${enumLabel(createForm.batchType, BATCH_TYPE_LABELS)}批次，是否继续？`,
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
    message: '正在创建计算批次。'
  }
  try {
    const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const accepted = await createCalcBatch(
      {
        ownerType: createForm.ownerType,
        ownerVersionId: String(createForm.ownerVersionId),
        batchType: createForm.batchType,
        ...(createForm.ownerType === 'INDICATOR' && ['FULL', 'RECALC'].includes(createForm.batchType) && createForm.scenarioVersionId
          ? { scenarioVersionId: String(createForm.scenarioVersionId) }
          : {}),
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
      message: `任务 ID ${queryForm.taskId || '-'}，批次 ID ${queryForm.batchId || '-'}；请继续查询执行状态。`
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

function resolveOwnerCalculationMode(version = {}) {
  const dsl = version.dsl || version.factorDsl || version.definition?.dsl || {}
  const explicit = String(version.calculationMode || version.definition?.calculationMode || dsl.calculationMode || '').toUpperCase()
  if (['STATIC', 'TEMPORAL'].includes(explicit)) return explicit
  return hasPeriodParameter(dsl.filters) ? 'TEMPORAL' : ''
}

function hasPeriodParameter(node) {
  return Boolean(node && ((node.nodeType === 'PREDICATE' && node.parameter === 'period') || (node.children || []).some(hasPeriodParameter) || hasPeriodParameter(node.child) || hasPeriodParameter(node.filters)))
}

function returnToScenarioComparison() {
  if (!returnToAnalysis.value) return
  const returnScenarioVersionIds = String(route.query.returnScenarioVersionIds || createForm.scenarioVersionId || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const query = {
    indicator: route.query.returnIndicator || undefined,
    indicatorVersionId: route.query.returnIndicatorVersionId || undefined,
    periodStart: createForm.periodStart || undefined,
    periodEnd: createForm.periodEnd || undefined,
    scenarioVersionIds: returnScenarioVersionIds.length ? returnScenarioVersionIds : undefined,
    focus: 'scenario-comparison'
  }
  router.push({ path: '/analysis', query })
}

async function cancelBatch() {
  const batchId = toOpaqueId(batchDetail.value?.batchId || queryForm.batchId)
  if (!batchId || !canCancelBatch.value) return
  try {
    await ElMessageBox.confirm(
      `确认取消批次 ${batchId}？已完成的节点不会被回滚。`,
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
      message: '正在取消，请刷新查看最终状态。'
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
  if (!nodeId || !canRetryCalculationNode(row, batchDetail.value?.status) || retryingNodeId.value) return
  try {
    await ElMessageBox.confirm(
      batchDetail.value?.status === 'CANCELLED'
        ? '确认重试已取消批次？该批次内所有取消节点将重新执行，已成功节点保留。'
        : `确认重试节点“${row.nodeName || row.nodeCode || nodeId}”及其受影响的下游节点？`,
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
      message: '重试已提交，请在批次详情查看执行结果。'
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
  if (queryForm.batchId) await queryBatch()
  else if (queryForm.taskId) await queryTask()
}

async function queryBatch() {
  // Resolve the association first so task and batch refresh cannot overwrite
  // each other's IDs with responses from two unrelated selections.
  const revision = batchQueryRevision + 1
  const taskRevision = taskQueryRevision
  const loaded = await loadBatch()
  if (!loaded || queryDisposed || revision !== batchQueryRevision || taskRevision !== taskQueryRevision || !batchDetail.value
    || String(batchDetail.value.batchId) !== queryForm.batchId.trim()) return
  if (queryForm.taskId) await loadTask()
}

async function queryTask() {
  const revision = taskQueryRevision + 1
  const batchRevision = batchQueryRevision
  const loaded = await loadTask()
  if (!loaded || queryDisposed || revision !== taskQueryRevision || batchRevision !== batchQueryRevision || !taskDetail.value
    || String(taskDetail.value.taskId) !== queryForm.taskId.trim()) return
  if (queryForm.batchId) await loadBatch()
}


function displayId(value) {
  return toOpaqueId(value) || '-'
}

function enumLabel(value, labels) {
  return labels[String(value || '').trim().toUpperCase()] || value || '-'
}

onMounted(async () => {
  const batchQuery = refreshCurrent()
  const ownerInitialization = initializeOwnerSelection()
  if (route.hash !== '#batch-overview') return
  await Promise.all([batchQuery, ownerInitialization])
  await nextTick()
  batchOverview.value?.scrollIntoView({ block: 'start' })
})

onBeforeUnmount(() => {
  queryDisposed = true
  ++taskQueryRevision
  ++batchQueryRevision
  clearTimeout(ownerSearchTimer)
  ++ownerRequest
  ++versionRequest
  ++sceneRequest
  ++initializationRequest
})

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

#batch-overview {
  scroll-margin-top: calc(var(--idmp-topbar-height, 56px) + 16px);
}

.endpoint-note {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 20px;
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
.create-card :deep(.el-select),
.create-card :deep(.el-date-editor) {
  width: 100%;
}

.form-help {
  display: block;
  margin-top: 6px;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.form-help.is-error {
  color: var(--el-color-danger);
}

.version-option-reason {
  margin-left: 12px;
  color: var(--idmp-text-helper);
  font-size: 12px;
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
