<template>
  <div class="idmp-page source-metadata-page">
    <PageHeader title="来源元数据">
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">源表与物理字段来自 /api/v1/meta</span>
      </template>
      <template #actions>
        <el-button :icon="Refresh" :loading="syncLoading" @click="handleSync">
          同步来源元数据
        </el-button>
        <el-button type="primary" :icon="Refresh" :loading="tableLoading" @click="loadSourceTables">
          刷新目录
        </el-button>
      </template>
    </PageHeader>

    <div v-if="!hasAccessToken" class="notice-strip is-warning">
      当前未保存访问令牌；如果后端启用鉴权，来源元数据接口可能返回未登录或权限错误。
    </div>

    <section class="surface-card sync-card">
      <div class="section-title">
        <div>
          <h2>来源同步</h2>
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
        <div><span>同步表数量</span><strong>{{ syncSummary?.tableCount ?? '-' }}</strong></div>
        <div><span>同步字段数量</span><strong>{{ syncSummary?.fieldCount ?? '-' }}</strong></div>
        <div class="sync-summary__message">{{ syncFeedback?.message || '执行同步后将在此显示本次同步结果。' }}</div>
      </div>

      <div v-if="syncError" class="sync-error">
        <StatePanel
          :type="stateTypeForError(syncError)"
          title="来源同步失败"
          :description="syncErrorMessage"
        >
          <template #actions>
            <el-button :disabled="syncLoading" @click="handleSync">重新同步</el-button>
          </template>
        </StatePanel>
      </div>

      <div v-if="syncSummary?.tables?.length" class="sync-tables">
        <div class="sync-tables__heading">本次同步表清单</div>
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
          <h2>已发现源表</h2>
          <p class="section-title__description">GET /api/v1/meta/source-tables</p>
        </div>
        <span class="table-count">共 {{ filteredTables.length }} / {{ sourceTables.length }} 张</span>
      </div>

      <div class="filter-bar">
        <el-input v-model="filters.tableName" clearable placeholder="按表名筛选" />
        <el-input v-model="filters.tableType" clearable placeholder="按表类型筛选" />
        <el-input v-model="filters.comment" clearable placeholder="按注释筛选" />
        <el-button @click="resetFilters">清空筛选</el-button>
      </div>

      <StatePanel v-if="tableLoading" type="loading" title="正在加载源表目录" />
      <StatePanel
        v-else-if="tableError"
        :type="stateTypeForError(tableError)"
        title="源表目录加载失败"
        :description="tableErrorMessage"
      >
        <template #actions>
          <el-button @click="loadSourceTables">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!sourceTables.length"
        type="empty"
        title="暂无已发现源表"
        description="请先执行来源元数据同步，或确认后端远程源库配置。"
      />
      <StatePanel
        v-else-if="!filteredTables.length"
        type="empty"
        title="没有匹配的源表"
        description="请调整表名、表类型或注释筛选条件。"
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
        @row-click="selectSourceTable"
      >
        <el-table-column prop="tableName" label="源表名" min-width="240" show-overflow-tooltip />
        <el-table-column prop="tableType" label="表类型" width="150" />
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

    <section class="surface-card table-card fields-card">
      <div class="section-title section-title--toolbar">
        <div>
          <h2>物理字段</h2>
          <p class="section-title__description">GET /api/v1/meta/source-tables/{tableName}/fields</p>
        </div>
        <span class="selected-context">{{ selectedTable?.tableName || '未选择源表' }}</span>
      </div>

      <StatePanel v-if="fieldLoading" type="loading" title="正在加载物理字段" />
      <StatePanel
        v-else-if="fieldError"
        :type="stateTypeForError(fieldError)"
        title="物理字段加载失败"
        :description="fieldErrorMessage"
      >
        <template #actions>
          <el-button :disabled="!selectedTable" @click="loadFields">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!selectedTable"
        type="empty"
        title="尚未选择源表"
        description="从上方源表目录选择一行后查看物理字段。"
      />
      <StatePanel
        v-else-if="!sourceFields.length"
        type="empty"
        title="当前源表没有字段"
        description="接口返回了空字段列表，请确认源表元数据是否已同步。"
      />
      <el-table v-else :data="sourceFields" table-layout="fixed">
        <el-table-column prop="columnName" label="字段名" min-width="240" show-overflow-tooltip />
        <el-table-column prop="columnType" label="字段类型" width="180" />
        <el-table-column prop="nullable" label="可为空" width="120">
          <template #default="{ row }">{{ nullableLabel(row.nullable) }}</template>
        </el-table-column>
        <el-table-column prop="comment" label="字段注释" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.comment || '—' }}</template>
        </el-table-column>
      </el-table>
    </section>
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

const tableErrorMessage = computed(() => formatErrorMessage(tableError.value, '源表目录加载失败'))
const fieldErrorMessage = computed(() => formatErrorMessage(fieldError.value, '物理字段加载失败'))
const syncErrorMessage = computed(() => formatErrorMessage(syncError.value, '来源元数据同步失败'))

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
      '同步会读取远程源库的表和字段元数据。确认继续？',
      '确认同步来源元数据',
      { confirmButtonText: '确认同步', cancelButtonText: '返回', type: 'warning' }
    )
  } catch {
    return
  }

  syncLoading.value = true
  syncError.value = null
  syncSummary.value = null
  syncFeedback.value = { status: 'RUNNING', label: '同步中', message: '正在读取远程源库元数据。' }
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
    ElMessage.success('来源元数据同步成功')
  } catch (error) {
    syncError.value = error
    syncFeedback.value = {
      status: 'FAILED',
      label: '同步失败',
      message: `${formatErrorMessage(error, '来源元数据同步失败')}。源表目录未标记为同步成功。`
    }
    ElMessage.error(syncFeedback.value.message)
  } finally {
    syncLoading.value = false
  }
}

function selectSourceTable(row) {
  selectedTable.value = row
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
.fields-card { min-height: 220px; }
.selected-context { color: var(--idmp-text-secondary); font-size: 13px; }
@media (max-width: 900px) {
  .sync-summary { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
  .sync-summary__message { grid-column: 1 / -1; }
  .filter-bar { grid-template-columns: 1fr 1fr; }
}
</style>
