<template>
  <div class="idmp-page source-metadata-page">
    <PageHeader title="数据源管理">
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">当前提供数据表、视图与字段结构同步，为数据模型接入提供基础</span>
      </template>
      <template #actions>
        <el-button :icon="Refresh" :loading="syncLoading" @click="handleSync">
          同步数据结构
        </el-button>
        <el-button type="primary" :icon="Refresh" :loading="tableLoading" @click="loadSourceTables">
          刷新目录
        </el-button>
      </template>
    </PageHeader>

    <div v-if="!hasAccessToken" class="notice-strip is-warning">
      当前未保存访问令牌；如果后端启用鉴权，数据源管理接口可能返回未登录或权限错误。
    </div>

    <div class="notice-strip">
      当前页面用于管理已接入数据源的数据结构；数据源连接的创建、测试与停用需由后端提供相应接口后接入本页。
    </div>

    <section class="surface-card sync-card">
      <div class="section-title">
        <div>
          <h2>数据结构同步</h2>
          <p class="section-title__description">POST /api/v1/meta/source-mappings/sync</p>
        </div>
        <StatusBadge
          v-if="syncFeedback"
          :status="syncFeedback.status"
          :label="syncFeedback.label"
          :tone="syncFeedback.tone"
        />
      </div>

      <div class="sync-summary" :class="{ 'is-muted': !syncSummary }">
        <div><span>同步对象数量</span><strong>{{ syncSummary?.tableCount ?? '-' }}</strong></div>
        <div><span>同步字段数量</span><strong>{{ syncSummary?.fieldCount ?? '-' }}</strong></div>
        <div class="sync-summary__message">{{ syncFeedback?.message || '执行同步后将在此显示本次同步结果。' }}</div>
      </div>

      <div v-if="syncError" class="sync-error">
        <StatePanel
          :type="stateTypeForError(syncError)"
          title="数据结构同步失败"
          :description="syncErrorMessage"
        >
          <template #actions>
            <el-button :disabled="syncLoading" @click="handleSync">重新同步</el-button>
          </template>
        </StatePanel>
      </div>

      <div v-if="syncSummary?.tables?.length" class="sync-tables">
        <div class="sync-tables__heading">本次同步对象清单</div>
        <div class="sync-table-tags">
          <span v-for="item in syncSummary.tables" :key="item.tableName" class="sync-table-tag">
            <strong>{{ item.tableName }}</strong>
            <small>{{ item.fieldCount }} 个字段</small>
          </span>
        </div>
      </div>
    </section>

    <section class="surface-card table-card">
      <div class="section-title section-title--toolbar">
        <div>
          <h2>数据表与视图</h2>
          <p class="section-title__description">GET /api/v1/meta/source-tables</p>
        </div>
        <span class="table-count">共 {{ filteredTables.length }} / {{ sourceTables.length }} 个对象</span>
      </div>

      <div class="filter-bar">
        <el-input v-model="filters.tableName" clearable placeholder="按表/视图名称筛选" />
        <el-input v-model="filters.tableType" clearable placeholder="按对象类型筛选" />
        <el-input v-model="filters.comment" clearable placeholder="按注释筛选" />
        <el-button @click="resetFilters">清空筛选</el-button>
      </div>

      <StatePanel v-if="tableLoading" type="loading" title="正在加载数据表与视图" />
      <StatePanel
        v-else-if="tableError"
        :type="stateTypeForError(tableError)"
        title="数据表与视图加载失败"
        :description="tableErrorMessage"
      >
        <template #actions>
          <el-button @click="loadSourceTables">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!sourceTables.length"
        type="empty"
        title="暂无数据表或视图"
        description="请先同步数据结构，或确认后端远程数据源配置。"
      />
      <StatePanel
        v-else-if="!filteredTables.length"
        type="empty"
        title="没有匹配的数据对象"
        description="请调整表/视图名称、对象类型或注释筛选条件。"
      >
        <template #actions>
          <el-button @click="resetFilters">清空筛选</el-button>
        </template>
      </StatePanel>
      <el-table
        v-else
        :data="filteredTables"
        row-key="tableName"
        highlight-current-row
        table-layout="fixed"
        max-height="560"
        @row-click="selectSourceTable"
      >
        <el-table-column prop="tableName" label="表/视图名称" min-width="240" show-overflow-tooltip />
        <el-table-column prop="tableType" label="对象类型" width="150" />
        <el-table-column prop="comment" label="注释" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.comment || '—' }}</template>
        </el-table-column>
        <el-table-column prop="fieldCount" label="字段数" width="110" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="selectSourceTable(row)">查看字段</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer
      v-model="fieldsDrawerVisible"
      :title="`字段结构：${selectedTable?.tableName || ''}`"
      size="min(720px, 90vw)"
      direction="rtl"
      @closed="clearSelectedTable"
    >
      <p class="drawer-api-note">GET /api/v1/meta/source-tables/{tableName}/fields</p>
      <StatePanel v-if="fieldLoading" type="loading" title="正在加载字段结构" />
      <StatePanel
        v-else-if="fieldError"
        :type="stateTypeForError(fieldError)"
        title="字段结构加载失败"
        :description="fieldErrorMessage"
      >
        <template #actions><el-button :disabled="!selectedTable" @click="loadFields">重试加载</el-button></template>
      </StatePanel>
      <StatePanel
        v-else-if="!sourceFields.length"
        type="empty"
        title="当前对象没有字段"
        description="接口返回了空字段列表，请确认数据结构已经同步。"
      />
      <el-table v-else :data="sourceFields" table-layout="fixed" max-height="calc(100vh - 180px)">
        <el-table-column prop="columnName" label="字段名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="columnType" label="字段类型" width="140" />
        <el-table-column prop="nullable" label="可为空" width="90">
          <template #default="{ row }">{{ nullableLabel(row.nullable) }}</template>
        </el-table-column>
        <el-table-column prop="comment" label="字段注释" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.comment || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getAccessToken } from '@/idmp/api/request'
import { fetchSourceTableFields, fetchSourceTables, syncSourceMappings } from '@/idmp/api/modules/meta'
import { adaptSourceFieldList, adaptSourceTableList } from '@/idmp/api/adapters/meta'

const sourceTables = ref([])
const sourceFields = ref([])
const selectedTable = ref(null)
const fieldsDrawerVisible = ref(false)
const tableLoading = ref(false)
const fieldLoading = ref(false)
const syncLoading = ref(false)
const tableError = ref(null)
const fieldError = ref(null)
const syncError = ref(null)
const syncSummary = ref(null)
const syncFeedback = ref(null)
const hasAccessToken = ref(Boolean(getAccessToken()))

const filters = reactive({ tableName: '', tableType: '', comment: '' })

const filteredTables = computed(() => {
  const tableName = filters.tableName.trim().toLowerCase()
  const tableType = filters.tableType.trim().toLowerCase()
  const comment = filters.comment.trim().toLowerCase()
  return sourceTables.value.filter((item) => {
    return (!tableName || item.tableName.toLowerCase().includes(tableName))
      && (!tableType || item.tableType.toLowerCase().includes(tableType))
      && (!comment || item.comment.toLowerCase().includes(comment))
  })
})

const tableErrorMessage = computed(() => formatErrorMessage(tableError.value, '数据表与视图加载失败'))
const fieldErrorMessage = computed(() => formatErrorMessage(fieldError.value, '物理字段加载失败'))
const syncErrorMessage = computed(() => formatErrorMessage(syncError.value, '数据结构同步失败'))

onMounted(loadSourceTables)

async function loadSourceTables() {
  tableLoading.value = true
  tableError.value = null
  try {
    sourceTables.value = adaptSourceTableList(await fetchSourceTables())
    if (selectedTable.value) {
      const current = sourceTables.value.find((item) => item.tableName === selectedTable.value.tableName)
      if (current) {
        selectedTable.value = current
      } else {
        clearSelectedTable()
      }
    }
    return true
  } catch (error) {
    tableError.value = error
    ElMessage.error(tableErrorMessage.value)
    return false
  } finally {
    tableLoading.value = false
  }
}

async function handleSync() {
  if (syncLoading.value) return
  try {
    await ElMessageBox.confirm(
      '同步会读取远程数据源中的表、视图和字段结构。确认继续？',
      '确认同步数据结构',
      { confirmButtonText: '确认同步', cancelButtonText: '返回', type: 'warning' }
    )
  } catch {
    return
  }

  syncLoading.value = true
  syncError.value = null
  syncSummary.value = null
  syncFeedback.value = { status: 'RUNNING', label: '同步中', message: '正在读取远程数据源结构。' }
  try {
    const result = await syncSourceMappings()
    syncSummary.value = {
      tableCount: result?.tableCount ?? 0,
      fieldCount: result?.fieldCount ?? 0,
      tables: Array.isArray(result?.tables) ? result.tables : []
    }
    syncFeedback.value = {
      status: 'SUCCEEDED',
      label: '同步成功',
      message: `本次同步 ${syncSummary.value.tableCount} 张表、${syncSummary.value.fieldCount} 个字段，正在刷新目录。`
    }
    const refreshed = await loadSourceTables()
    if (!refreshed) throw tableError.value || new Error('同步成功，但源表目录刷新失败')
    ElMessage.success('数据结构同步成功')
  } catch (error) {
    syncError.value = error
    syncFeedback.value = {
      status: 'FAILED',
      label: '同步失败',
      message: `${formatErrorMessage(error, '数据结构同步失败')}。数据表目录未标记为同步成功。`
    }
    ElMessage.error(syncFeedback.value.message)
  } finally {
    syncLoading.value = false
  }
}

function selectSourceTable(row) {
  selectedTable.value = row
  fieldsDrawerVisible.value = true
  sourceFields.value = []
  fieldError.value = null
  loadFields()
}

async function loadFields() {
  if (!selectedTable.value?.tableName) return
  const tableName = selectedTable.value.tableName
  fieldLoading.value = true
  fieldError.value = null
  try {
    sourceFields.value = adaptSourceFieldList(await fetchSourceTableFields(tableName))
  } catch (error) {
    sourceFields.value = []
    fieldError.value = error
    ElMessage.error(fieldErrorMessage.value)
  } finally {
    fieldLoading.value = false
  }
}

function clearSelectedTable() {
  selectedTable.value = null
  sourceFields.value = []
  fieldError.value = null
}

function resetFilters() {
  filters.tableName = ''
  filters.tableType = ''
  filters.comment = ''
}

function nullableLabel(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return '是'
  if (value === false || value === 0 || value === '0' || value === 'false') return '否'
  return '未知'
}

function stateTypeForError(error) {
  const status = error?.status
  if (status === 401) return 'permission'
  if (status === 403) return 'permission'
  if (status === 404 || status === 501 || status === 503) return 'unavailable'
  return 'error'
}

function formatErrorMessage(error, fallback) {
  if (!error) return fallback
  const status = error.status
  const traceId = error.payload?.traceId
  let message = error.payload?.message || error.message || fallback
  if (status === 401) message = `未登录或访问令牌已失效：${message}`
  else if (status === 403) message = `当前账号无权执行此操作：${message}`
  else if (status >= 500) message = `后端或源数据库不可达：${message}`
  else if (!status) message = `网络请求失败：${message}`
  return traceId && !String(message).includes(traceId) ? `${message}（traceId: ${traceId}）` : String(message)
}
</script>

<style scoped lang="scss">
.source-metadata-page { display: flex; flex-direction: column; gap: 16px; }
.sync-card, .table-card { padding: 18px; }
.section-title--toolbar { align-items: center; }
.sync-summary { display: grid; grid-template-columns: 180px 180px 1fr; gap: 16px; align-items: center; padding: 14px 16px; background: var(--idmp-layer-02); border: 1px solid var(--idmp-border-subtle); }
.sync-summary.is-muted { color: var(--idmp-text-helper); }
.sync-summary div:not(.sync-summary__message) { display: flex; flex-direction: column; gap: 4px; }
.sync-summary span { color: var(--idmp-text-secondary); font-size: 12px; }
.sync-summary strong { color: var(--idmp-text-primary); font-size: 22px; font-variant-numeric: tabular-nums; }
.sync-summary__message { color: var(--idmp-text-secondary); font-size: 13px; }
.sync-error { margin-top: 14px; }
.sync-tables { margin-top: 16px; }
.sync-tables__heading { margin-bottom: 8px; color: var(--idmp-text-secondary); font-size: 13px; }
.sync-table-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.sync-table-tag { display: inline-flex; flex-direction: column; gap: 2px; padding: 7px 10px; background: var(--idmp-layer-02); border: 1px solid var(--idmp-border-subtle); }
.sync-table-tag strong { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.sync-table-tag small { color: var(--idmp-text-helper); }
.filter-bar { display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)) auto; gap: 10px; margin-bottom: 14px; }
.drawer-api-note { margin: -8px 0 16px; color: var(--idmp-text-helper); font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
@media (max-width: 900px) {
  .sync-summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
  .sync-summary__message { grid-column: 1 / -1; }
  .filter-bar { grid-template-columns: 1fr 1fr; }
}
</style>
