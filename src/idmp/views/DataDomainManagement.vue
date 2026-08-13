<template>
  <div class="idmp-page data-domain-page">
    <PageHeader title="数据域管理">
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">把医院物理表转换为指标可复用的业务语义</span>
      </template>
      <template #actions>
        <el-button :icon="Refresh" :loading="listLoading" @click="loadDomains">刷新列表</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建数据域</el-button>
      </template>
    </PageHeader>

    <section class="model-summary-grid">
      <article class="surface-card model-summary-card"><span>全部数据域</span><strong>{{ domains.length }}</strong><small>按业务主题组织</small></article>
      <article class="surface-card model-summary-card"><span>已发布</span><strong>{{ publishedCount }}</strong><small>可被下游配置引用</small></article>
      <article class="surface-card model-summary-card"><span>待完善</span><strong>{{ draftCount }}</strong><small>草稿或尚未发布</small></article>
    </section>

    <section class="surface-card table-card">
      <div class="section-title section-title--toolbar">
        <div>
          <h2>数据域目录</h2>
          <p class="section-title__description">按主题查找模型，进入工作台维护语义表和字段映射</p>
        </div>
        <span class="table-count">共 {{ filteredDomains.length }} / {{ domains.length }} 个</span>
      </div>

      <div class="filter-bar">
        <el-input v-model="filters.code" clearable placeholder="按域编码筛选" />
        <el-input v-model="filters.name" clearable placeholder="按域名称筛选" />
        <el-select v-model="filters.status" clearable placeholder="按状态筛选">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="已发布" value="PUBLISHED" />
          <el-option label="已停用" value="DISABLED" />
        </el-select>
        <el-button @click="resetFilters">清空筛选</el-button>
      </div>

      <StatePanel v-if="listLoading" type="loading" title="正在加载数据域" />
      <StatePanel
        v-else-if="listError"
        :type="stateTypeForError(listError)"
        title="数据域列表加载失败"
        :description="listErrorMessage"
      >
        <template #actions>
          <el-button @click="loadDomains">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!domains.length"
        type="empty"
        title="暂无数据域"
        description="当前接口没有返回数据域记录，可以创建一个新的数据域。"
      >
        <template #actions>
          <el-button type="primary" @click="openCreateDialog">新建数据域</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!filteredDomains.length"
        type="empty"
        title="没有匹配的数据域"
        description="请调整编码、名称或状态筛选条件。"
      >
        <template #actions>
          <el-button @click="resetFilters">清空筛选</el-button>
        </template>
      </StatePanel>
      <el-table
        v-else
        :data="pagedDomains"
        :current-row-key="newlyCreatedId"
        row-key="id"
        highlight-current-row
        table-layout="fixed"
        max-height="560"
        @row-click="openWorkspace"
      >
        <el-table-column prop="code" label="数据域编码" min-width="220" show-overflow-tooltip />
        <el-table-column prop="name" label="数据域名称" min-width="190" show-overflow-tooltip />
        <el-table-column prop="description" label="业务说明" min-width="250" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }"><StatusBadge :status="row.status" /></template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openWorkspace(row)">进入工作台</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="filteredDomains.length" class="pagination-bar">
        <span class="pagination-summary">当前显示 {{ pageStart }}-{{ pageEnd }} / {{ filteredDomains.length }}</span>
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filteredDomains.length"
          background
          layout="prev, pager, next"
        />
      </div>
    </section>

    <el-dialog v-model="createDialogVisible" title="新建数据域" width="520px" destroy-on-close>
      <div class="dialog-api-note">POST /api/v1/meta/data-domains</div>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="数据域编码" prop="code">
          <el-input v-model.trim="createForm.code" placeholder="如 INPATIENT_QUALITY" />
          <div class="field-help">仅允许大写字母、数字和下划线，且必须以字母开头。</div>
        </el-form-item>
        <el-form-item label="数据域名称" prop="name">
          <el-input v-model.trim="createForm.name" placeholder="请输入数据域名称" />
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input v-model.trim="createForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <div v-if="createError" class="create-error">
        <StatePanel :type="stateTypeForError(createError)" title="创建失败" :description="createErrorMessage" />
      </div>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { createDataDomain, fetchDataDomains } from '@/idmp/api/modules/meta'
import { adaptDataDomainList, normalizeDataDomain } from '@/idmp/api/adapters/meta'

const router = useRouter()
const domains = ref([])
const listLoading = ref(false)
const createLoading = ref(false)
const listError = ref(null)
const createError = ref(null)
const createDialogVisible = ref(false)
const newlyCreatedId = ref('')
const createFormRef = ref(null)
const page = ref(1)
const pageSize = 20
const filters = reactive({ code: '', name: '', status: '' })
const createForm = reactive({ code: '', name: '', description: '' })
const publishedCount = computed(() => domains.value.filter((item) => item.status?.toUpperCase() === 'PUBLISHED').length)
const draftCount = computed(() => domains.value.filter((item) => item.status?.toUpperCase() !== 'PUBLISHED').length)

const createRules = {
  code: [
    { required: true, message: '请输入数据域编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]*$/, message: '编码仅允许大写字母、数字和下划线，且必须以字母开头', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入数据域名称', trigger: 'blur' }]
}

const filteredDomains = computed(() => {
  const code = filters.code.trim().toLowerCase()
  const name = filters.name.trim().toLowerCase()
  const status = filters.status.toUpperCase()
  return domains.value.filter((item) => {
    return (!code || item.code.toLowerCase().includes(code))
      && (!name || item.name.toLowerCase().includes(name))
      && (!status || item.status.toUpperCase() === status)
  })
})

const pagedDomains = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredDomains.value.slice(start, start + pageSize)
})

const pageStart = computed(() => filteredDomains.value.length ? (page.value - 1) * pageSize + 1 : 0)
const pageEnd = computed(() => Math.min(page.value * pageSize, filteredDomains.value.length))

const listErrorMessage = computed(() => formatErrorMessage(listError.value, '数据域列表加载失败'))
const createErrorMessage = computed(() => formatErrorMessage(createError.value, '数据域创建失败'))

watch(filters, () => {
  page.value = 1
}, { deep: true })

onMounted(loadDomains)

async function loadDomains() {
  listLoading.value = true
  listError.value = null
  try {
    domains.value = adaptDataDomainList(await fetchDataDomains())
    if (newlyCreatedId.value && !domains.value.some((item) => item.id === newlyCreatedId.value)) {
      newlyCreatedId.value = ''
    }
    const createdIndex = domains.value.findIndex((item) => item.id === newlyCreatedId.value)
    if (createdIndex >= 0) page.value = Math.floor(createdIndex / pageSize) + 1
    if (page.value > Math.max(1, Math.ceil(filteredDomains.value.length / pageSize))) page.value = 1
  } catch (error) {
    domains.value = []
    listError.value = error
    ElMessage.error(listErrorMessage.value)
  } finally {
    listLoading.value = false
  }
}

function openCreateDialog() {
  createError.value = null
  createForm.code = ''
  createForm.name = ''
  createForm.description = ''
  createDialogVisible.value = true
}

async function submitCreate() {
  if (createLoading.value) return
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await ElMessageBox.confirm(
      `确认创建数据域 ${createForm.code}（${createForm.name}）？创建后状态为草稿。`,
      '确认创建数据域',
      { confirmButtonText: '确认创建', cancelButtonText: '返回修改', type: 'warning' }
    )
  } catch {
    return
  }

  createLoading.value = true
  createError.value = null
  try {
    const created = normalizeDataDomain(await createDataDomain({
      code: createForm.code,
      name: createForm.name,
      description: createForm.description || null
    }))
    newlyCreatedId.value = created.id
    createDialogVisible.value = false
    await loadDomains()
    const createdRow = domains.value.find((item) => item.id === created.id || item.code === created.code)
    if (createdRow) newlyCreatedId.value = createdRow.id
    ElMessage.success(`数据域 ${created.code} 创建成功，当前状态为${created.status || 'DRAFT'}`)
  } catch (error) {
    createError.value = error
    ElMessage.error(createErrorMessage.value)
  } finally {
    createLoading.value = false
  }
}

function openWorkspace(row) {
  if (!row?.id) return
  router.push({ name: 'DataDomainWorkspace', params: { id: row.id } })
}

function resetFilters() {
  filters.code = ''
  filters.name = ''
  filters.status = ''
}

function formatDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').replace(/([+-]\d{2}:\d{2}|Z)$/, '')
}

function stateTypeForError(error) {
  if (error?.status === 401 || error?.status === 403) return 'permission'
  if (error?.status === 404 || error?.status === 501 || error?.status === 503) return 'unavailable'
  return 'error'
}

function formatErrorMessage(error, fallback) {
  if (!error) return fallback
  const status = error.status
  const traceId = error.payload?.traceId
  let message = error.payload?.message || error.message || fallback
  if (status === 409) message = `数据域编码已存在或发生版本冲突：${message}`
  else if (status === 401) message = `未登录或访问令牌已失效：${message}`
  else if (status === 403) message = `当前账号无权执行此操作：${message}`
  return traceId && !String(message).includes(traceId) ? `${message}（traceId: ${traceId}）` : String(message)
}
</script>

<style scoped lang="scss">
.data-domain-page { display: flex; flex-direction: column; gap: 16px; }
.model-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.model-summary-card { display: flex; flex-direction: column; gap: 5px; padding: 18px; }
.model-summary-card span { color: var(--idmp-text-secondary); font-size: 13px; }
.model-summary-card strong { color: var(--idmp-text-primary); font-size: 28px; font-variant-numeric: tabular-nums; }
.model-summary-card small { color: var(--idmp-text-helper); font-size: 12px; }
.table-card { padding: 18px; }
.section-title--toolbar { align-items: center; }
.filter-bar { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)) auto; gap: 10px; margin-bottom: 14px; }
.pagination-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 16px; }
.pagination-summary { color: var(--idmp-text-helper); font-size: 12px; }
.dialog-api-note { margin-bottom: 18px; color: var(--idmp-text-helper); font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
.field-help { margin-top: 5px; color: var(--idmp-text-helper); font-size: 12px; line-height: 18px; }
.create-error { margin-top: 8px; }
@media (max-width: 900px) { .model-summary-grid { grid-template-columns: 1fr; } .filter-bar { grid-template-columns: 1fr 1fr; } .pagination-bar { align-items: flex-start; flex-direction: column; } }
</style>
