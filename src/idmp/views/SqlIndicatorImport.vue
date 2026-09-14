<template>
  <div class="idmp-page sql-import-page">
    <PageHeader title="SQL 导入指标">
      <template #meta>
        <span>导入后生成受管因子和指标公式</span>
        <span v-if="preview">{{ preview.factors.length }} 个因子</span>
      </template>
      <template #actions>
        <el-button :icon="ArrowLeft" @click="router.push('/indicator')">返回指标目录</el-button>
      </template>
    </PageHeader>

    <section class="surface-card sql-section">
      <div class="section-heading">
        <div>
          <h2>指标 SQL</h2>
          <span v-if="sqlLineCount">{{ sqlLineCount }} 行</span>
        </div>
        <el-button
          type="primary"
          :icon="DocumentChecked"
          :loading="previewLoading"
          :disabled="!sql.trim()"
          @click="runPreview"
        >
          预检 SQL
        </el-button>
      </div>
      <el-input
        v-model="sql"
        class="sql-editor"
        type="textarea"
        :rows="18"
        resize="vertical"
        spellcheck="false"
        placeholder="WITH factor_name AS (SELECT COUNT(*) AS factor_value FROM physical_table WHERE ...), ... SELECT ... FROM factor_name"
        aria-label="指标 SQL"
      />
    </section>

    <section v-if="preview" class="surface-card review-section">
      <div class="section-heading">
        <div>
          <h2>预检结果</h2>
          <el-tag :type="preview.valid ? 'success' : 'danger'" effect="plain">
            {{ preview.valid ? '通过' : '待处理' }}
          </el-tag>
        </div>
        <el-button
          v-if="requiresMapping"
          :icon="Refresh"
          :loading="previewLoading"
          :disabled="!allMappingsSelected"
          @click="runPreview"
        >
          应用映射并重新预检
        </el-button>
      </div>

      <div v-if="preview.tables.length" class="review-block">
        <h3>数据表映射</h3>
        <el-table :data="preview.tables" border>
          <el-table-column prop="physicalTable" label="物理表" min-width="220" />
          <el-table-column label="已发布语义表" min-width="360">
            <template #default="{ row }">
              <el-select
                v-model="tableMappings[row.physicalTable]"
                filterable
                :disabled="row.candidates.length <= 1"
                placeholder="请选择语义映射"
                :aria-label="`${row.physicalTable} 的语义映射`"
              >
                <el-option
                  v-for="candidate in row.candidates"
                  :key="candidate.viewMappingId"
                  :label="mappingLabel(candidate)"
                  :value="candidate.viewMappingId"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="默认时间字段" min-width="150">
            <template #default="{ row }">{{ selectedCandidate(row)?.defaultTimeFieldCode || '未配置' }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="preview.diagnostics.length" class="review-block">
        <h3>诊断</h3>
        <div class="diagnostic-list">
          <div
            v-for="item in preview.diagnostics"
            :key="`${item.code}-${item.path}-${item.message}`"
            class="diagnostic-item"
            :class="item.severity === 'ERROR' ? 'is-error' : 'is-warning'"
          >
            <el-icon><WarningFilled /></el-icon>
            <div>
              <strong>{{ item.code }} · {{ item.message }}</strong>
              <span v-if="item.suggestion">{{ item.suggestion }}</span>
              <code v-if="item.path">{{ item.path }}</code>
            </div>
          </div>
        </div>
      </div>

      <div v-if="preview.valid" class="valid-summary">
        <el-icon><CircleCheckFilled /></el-icon>
        <span>SQL 已转换为 {{ preview.factors.length }} 个因子和 1 个指标公式</span>
        <span v-if="preview.period">周期 {{ preview.period.start }} 至 {{ preview.period.end }}</span>
      </div>
    </section>

    <template v-if="preview?.valid">
      <section class="surface-card metadata-section">
        <div class="section-heading">
          <div><h2>指标信息</h2></div>
        </div>
        <el-form ref="indicatorFormRef" :model="indicator" :rules="indicatorRules" label-position="top">
          <div class="metadata-grid">
            <el-form-item label="指标编码" prop="code">
              <el-input v-model="indicator.code" maxlength="64" placeholder="例如 TRANSFER_RATE_48H" @input="indicator.code = normalizeCode(indicator.code)" />
            </el-form-item>
            <el-form-item label="指标名称" prop="name">
              <el-input v-model.trim="indicator.name" maxlength="200" placeholder="请输入指标名称" />
            </el-form-item>
            <el-form-item label="业务分类">
              <el-input v-model.trim="indicator.category" maxlength="64" placeholder="例如 医疗质量" />
            </el-form-item>
            <el-form-item label="指标说明" class="span-2">
              <el-input v-model="indicator.description" type="textarea" :rows="2" maxlength="512" show-word-limit />
            </el-form-item>
          </div>
        </el-form>
      </section>

      <section class="surface-card metadata-section">
        <div class="section-heading">
          <div>
            <h2>因子信息</h2>
            <span>共 {{ factorMetadata.length }} 项</span>
          </div>
        </div>
        <div class="factor-list">
          <div v-for="(factor, index) in factorMetadata" :key="factor.key" class="factor-row">
            <div class="factor-row__identity">
              <span class="factor-index">{{ index + 1 }}</span>
              <div><strong>{{ factor.key }}</strong><small>CTE 输出 {{ factorOutputAlias(factor.key) }}</small></div>
            </div>
            <el-form label-position="top">
              <div class="factor-fields">
                <el-form-item label="因子编码" :error="factorErrors[factor.key]?.code">
                  <el-input v-model="factor.code" maxlength="64" @input="factor.code = normalizeCode(factor.code)" />
                </el-form-item>
                <el-form-item label="因子名称" :error="factorErrors[factor.key]?.name">
                  <el-input v-model.trim="factor.name" maxlength="128" />
                </el-form-item>
                <el-form-item label="因子说明">
                  <el-input v-model="factor.description" maxlength="512" />
                </el-form-item>
              </div>
            </el-form>
          </div>
        </div>
      </section>

      <section class="surface-card conversion-section">
        <div class="section-heading"><div><h2>转换结果</h2></div></div>
        <el-tabs v-model="activePreviewTab">
          <el-tab-pane v-for="factor in preview.factors" :key="factor.key" :label="factor.key" :name="`factor:${factor.key}`">
            <pre>{{ formatJson(factor.dsl) }}</pre>
          </el-tab-pane>
          <el-tab-pane label="指标公式" name="formula">
            <div class="formula-display">{{ preview.formula?.displayText }}</div>
            <pre>{{ formatJson(preview.formula?.template) }}</pre>
          </el-tab-pane>
        </el-tabs>
      </section>

      <div class="submit-bar">
        <div>
          <strong>创建 {{ factorMetadata.length }} 个因子和 1 个指标</strong>
          <span>因子将自动编译并发布，指标公式将自动编译，时间下钻默认到日。</span>
        </div>
        <el-button type="primary" :icon="CircleCheck" :loading="createLoading" :disabled="hasRunningImport" @click="createResources">
          确认创建
        </el-button>
      </div>
    </template>

    <section v-if="importTask" class="surface-card success-section">
      <div class="section-heading">
        <div><h2>导入任务</h2><span>{{ importTask.step || '等待服务端分配检查点' }}</span></div>
        <el-tag :type="taskTagType" effect="plain">{{ importTask.status }}</el-tag>
      </div>
      <el-alert v-if="importTask.error" type="error" :closable="false" show-icon :title="importTask.error" />
      <el-alert v-if="taskStatusError" type="warning" :closable="false" show-icon :title="taskStatusError" class="task-status-error">
        <template #default><el-button link type="primary" :loading="taskActionLoading" @click="refreshImportTask">重新查询任务状态</el-button></template>
      </el-alert>
      <el-table v-if="importTask.resources.length" :data="importTask.resources" size="small" class="task-resources">
        <el-table-column prop="key" label="资源" min-width="150" />
        <el-table-column prop="type" label="类型" width="110" />
        <el-table-column label="状态" min-width="200"><template #default="{ row }"><span>{{ resourceStatus(row) }}</span></template></el-table-column>
        <el-table-column label="诊断" min-width="240"><template #default="{ row }"><span v-if="!row.diagnostics?.length">—</span><div v-else class="resource-diagnostics"><span v-for="item in row.diagnostics" :key="`${item.code}-${item.message}`">{{ item.code ? `[${item.code}] ` : '' }}{{ item.message || item }}</span></div></template></el-table-column>
      </el-table>
      <div v-if="importTask.status === 'FAILED' || importTask.status === 'CLEANUP_FAILED'" class="task-actions">
        <el-button :loading="taskActionLoading" type="primary" @click="retryImport">重试任务</el-button>
        <el-button :loading="taskActionLoading" type="danger" plain @click="abandonImport">放弃并清理</el-button>
      </div>
      <el-result v-if="importTask.status === 'SUCCEEDED'" icon="success" title="SQL 导入已完成" sub-title="因子已发布；指标已校验，仍需在指标编辑页显式发布。">
        <template #extra>
          <el-button @click="router.push('/indicator')">返回指标目录</el-button>
          <el-button type="primary" :disabled="!importTask.result?.indicatorId" @click="openCreatedIndicator">打开指标并发布</el-button>
        </template>
      </el-result>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, CircleCheck, CircleCheckFilled, DocumentChecked, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { buildSqlIndicatorImportPayload, isSqlImportTerminal, mergeSqlFactorMetadata, normalizeSqlImportPreview, normalizeSqlImportTask, shouldPollSqlImport } from '@/idmp/api/adapters/sqlImport'
import { resourceConflictEditorPath, resolveResourceConflict } from '@/idmp/api/adapters/resourceConflict'
import { abandonSqlIndicatorImport, createSqlIndicatorImport, fetchSqlIndicatorImport, previewSqlIndicatorImport, retrySqlIndicatorImport } from '@/idmp/api/modules/sqlImports'

const router = useRouter()
const route = useRoute()
const sql = ref('')
const preview = ref(null)
const previewLoading = ref(false)
const createLoading = ref(false)
const importTask = ref(null)
const taskActionLoading = ref(false)
const taskStatusError = ref('')
let taskPollTimer = null
let taskRequestSequence = 0
let submissionFingerprint = ''
let submissionIdempotencyKey = ''
const indicatorFormRef = ref()
const activePreviewTab = ref('formula')
const tableMappings = reactive({})
const factorMetadata = ref([])
const factorErrors = reactive({})
const indicator = reactive({ code: '', name: '', category: '', description: '' })

const codePattern = /^[A-Z][A-Z0-9_]*$/
const indicatorRules = {
  code: [
    { required: true, message: '请输入指标编码', trigger: 'blur' },
    { pattern: codePattern, message: '只能使用大写字母、数字和下划线，并以大写字母开头', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入指标名称', trigger: 'blur' }]
}

const sqlLineCount = computed(() => sql.value ? sql.value.split(/\r?\n/).length : 0)
const requiresMapping = computed(() => preview.value?.tables.some(table => table.candidates.length > 1 && !table.selectedViewMappingId))
const allMappingsSelected = computed(() => preview.value?.tables.every(table => table.candidates.length === 0 || tableMappings[table.physicalTable]))
const taskTagType = computed(() => ({ SUCCEEDED: 'success', FAILED: 'danger', CLEANUP_FAILED: 'danger', ABANDONED: 'info', ABANDONED_WITH_RETAINED: 'warning' })[importTask.value?.status] || 'warning')
const hasRunningImport = computed(() => Boolean(importTask.value?.importId) && !isSqlImportTerminal(importTask.value))

watch(sql, () => {
  if (preview.value) {
    preview.value = null
    factorMetadata.value = []
    clearImportTask()
  }
})

async function runPreview() {
  if (!sql.value.trim()) return
  previewLoading.value = true
  clearImportTask()
  try {
    const result = normalizeSqlImportPreview(await previewSqlIndicatorImport({
      sql: sql.value,
      tableMappings: Object.fromEntries(Object.entries(tableMappings).filter(([, value]) => value))
    }))
    preview.value = result
    result.tables.forEach((table) => {
      const selected = table.selectedViewMappingId || tableMappings[table.physicalTable]
      if (selected) tableMappings[table.physicalTable] = selected
    })
    factorMetadata.value = mergeSqlFactorMetadata(factorMetadata.value, result.factors)
    activePreviewTab.value = result.factors[0] ? `factor:${result.factors[0].key}` : 'formula'
    if (result.valid) ElMessage.success('SQL 预检通过')
  } catch (error) {
    ElMessage.error(error.message || 'SQL 预检失败')
  } finally {
    previewLoading.value = false
  }
}

async function createResources() {
  if (hasRunningImport.value) return
  const validIndicator = await indicatorFormRef.value?.validate().catch(() => false)
  if (!validIndicator || !validateFactors()) return
  createLoading.value = true
  try {
    const payload = buildSqlIndicatorImportPayload({
      sql: sql.value,
      tableMappings,
      indicator,
      factors: factorMetadata.value
    })
    const task = await createSqlIndicatorImport(payload, idempotencyKeyForPayload(payload))
    acceptImportTask(task)
    ElMessage.success('SQL 导入任务已创建，正在后台处理')
    globalThis.scrollTo?.({ top: document.body.scrollHeight, behavior: 'smooth' })
  } catch (error) {
    await handleImportError(error, '创建失败')
  } finally {
    createLoading.value = false
  }
}

function validateFactors() {
  let valid = true
  Object.keys(factorErrors).forEach(key => delete factorErrors[key])
  const codes = new Set()
  factorMetadata.value.forEach((factor) => {
    const errors = {}
    if (!factor.code) errors.code = '请输入因子编码'
    else if (!codePattern.test(factor.code)) errors.code = '因子编码格式不正确'
    else if (codes.has(factor.code)) errors.code = '因子编码不能重复'
    if (!factor.name) errors.name = '请输入因子名称'
    codes.add(factor.code)
    if (Object.keys(errors).length) {
      factorErrors[factor.key] = errors
      valid = false
    }
  })
  if (!valid) ElMessage.warning('请补全因子信息')
  return valid
}

function selectedCandidate(table) {
  const selected = tableMappings[table.physicalTable] || table.selectedViewMappingId
  return table.candidates.find(candidate => candidate.viewMappingId === selected)
}

function mappingLabel(candidate) {
  return `${candidate.domainCode} / ${candidate.semanticTableCode}`
}

function factorOutputAlias(key) {
  return preview.value?.factors.find(item => item.key === key)?.outputAlias || ''
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9_]/g, '')
}

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function openCreatedIndicator() {
  const indicatorId = importTask.value?.result?.indicatorId
  if (indicatorId) router.push(`/indicator/edit/${encodeURIComponent(indicatorId)}`)
}

function createIdempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function idempotencyKeyForPayload(payload) {
  const fingerprint = JSON.stringify(payload)
  if (fingerprint !== submissionFingerprint) {
    submissionFingerprint = fingerprint
    submissionIdempotencyKey = createIdempotencyKey('sql-import')
  }
  return submissionIdempotencyKey
}

function resourceStatus(resource) {
  if (resource.retainedReason) return `保留：${resource.retainedReason}`
  if (resource.cleanup) return `清理：${resource.cleanup}`
  if (resource.published) return '已发布'
  if (resource.compiled) return '已编译'
  return resource.trial?.status || '处理中'
}

function acceptImportTask(payload) {
  const task = normalizeSqlImportTask(payload)
  importTask.value = task
  taskStatusError.value = ''
  if (task.importId) router.replace({ query: { ...route.query, importId: task.importId } })
  if (shouldPollSqlImport(task)) scheduleTaskPolling()
}

function clearImportTask() {
  stopTaskPolling()
  importTask.value = null
  taskStatusError.value = ''
  submissionFingerprint = ''
  submissionIdempotencyKey = ''
  if (route.query.importId) {
    const query = { ...route.query }
    delete query.importId
    void router.replace({ query })
  }
}

function scheduleTaskPolling() {
  stopTaskPolling()
  if (!shouldPollSqlImport(importTask.value) || !importTask.value?.importId) return
  taskPollTimer = globalThis.setTimeout(refreshImportTask, 1500)
}

function stopTaskPolling() {
  if (taskPollTimer) globalThis.clearTimeout(taskPollTimer)
  taskPollTimer = null
  taskRequestSequence += 1
}

async function refreshImportTask() {
  const importId = importTask.value?.importId
  if (!importId) return
  const requestId = ++taskRequestSequence
  try {
    const task = await fetchSqlIndicatorImport(importId)
    if (requestId !== taskRequestSequence) return
    importTask.value = normalizeSqlImportTask(task)
    taskStatusError.value = ''
    if (shouldPollSqlImport(importTask.value)) scheduleTaskPolling()
  } catch (error) {
    if (requestId !== taskRequestSequence) return
    taskStatusError.value = error.message || '导入任务状态读取失败；任务可能仍在服务端继续执行。'
  }
}

async function retryImport() {
  if (!importTask.value?.importId) return
  taskActionLoading.value = true
  try {
    acceptImportTask(await retrySqlIndicatorImport(importTask.value.importId, createIdempotencyKey('sql-import-retry')))
  } catch (error) {
    await handleImportError(error, '任务重试失败')
  } finally {
    taskActionLoading.value = false
  }
}

async function abandonImport() {
  if (!importTask.value?.importId) return
  try {
    await ElMessageBox.confirm('放弃后服务端将尝试取消任务并清理本次创建的半成品资源。', '确认放弃 SQL 导入', { type: 'warning', confirmButtonText: '放弃并清理', cancelButtonText: '取消' })
  } catch { return }
  taskActionLoading.value = true
  try {
    acceptImportTask(await abandonSqlIndicatorImport(importTask.value.importId, '用户在前端放弃该 SQL 导入任务', createIdempotencyKey('sql-import-abandon')))
  } catch (error) {
    await handleImportError(error, '放弃任务失败')
  } finally {
    taskActionLoading.value = false
  }
}

async function handleImportError(error, fallback) {
  const conflict = resolveResourceConflict(error)
  if (!conflict) {
    ElMessage.error(error.message || fallback)
    return
  }
  const action = await ElMessageBox.confirm(`已存在同名${conflict.type === 'factor' ? '因子' : '指标'}：${conflict.resource.name}（${conflict.resource.code}）。SQL 导入未创建任务，请修改名称后重新提交。`, '名称冲突', { type: 'warning', confirmButtonText: '打开已有资源', cancelButtonText: '返回修改', distinguishCancelAndClose: true }).catch(() => 'cancel')
  if (action === 'confirm') {
    const path = resourceConflictEditorPath(conflict)
    if (path) router.push(path)
  }
}

onMounted(() => {
  const importId = String(route.query.importId || '')
  if (importId) {
    importTask.value = { importId, status: 'RUNNING', step: '恢复导入任务', resources: [], result: null }
    void refreshImportTask()
  }
})

onBeforeUnmount(stopTaskPolling)
</script>

<style scoped lang="scss">
.sql-import-page {
  padding-bottom: 88px;
}

.sql-section,
.review-section,
.metadata-section,
.conversion-section,
.success-section {
  margin-bottom: 16px;
  padding: 18px;
}

.task-status-error {
  margin: 12px 0;
}

.resource-diagnostics {
  display: grid;
  gap: 4px;
  color: #8a4b08;
  font-size: 12px;
  line-height: 18px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-heading > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-heading h2,
.review-block h3 {
  margin: 0;
  letter-spacing: 0;
}

.section-heading h2 {
  font-size: 16px;
  line-height: 24px;
}

.section-heading span {
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.sql-editor :deep(textarea) {
  min-height: 360px !important;
  padding: 14px 16px;
  background: #111b24;
  color: #e6edf3;
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 13px;
  line-height: 1.65;
  tab-size: 2;
}

.review-block + .review-block {
  margin-top: 20px;
}

.review-block h3 {
  margin-bottom: 10px;
  font-size: 14px;
}

.review-block :deep(.el-select) {
  width: 100%;
}

.diagnostic-list {
  display: grid;
  border-top: 1px solid var(--idmp-border-subtle);
}

.diagnostic-item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--idmp-border-subtle);
  background: var(--idmp-support-warning-bg);
  color: var(--idmp-support-warning);
}

.diagnostic-item.is-error {
  background: var(--idmp-support-danger-bg);
  color: var(--idmp-support-danger);
}

.diagnostic-item div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.diagnostic-item span,
.diagnostic-item code {
  color: var(--idmp-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.valid-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 12px 14px;
  background: var(--idmp-support-success-bg);
  color: var(--idmp-support-success);
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

.span-2 {
  grid-column: 1 / -1;
}

.factor-list {
  border-top: 1px solid var(--idmp-border-subtle);
}

.factor-row {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 20px;
  padding: 16px 0 0;
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.factor-row__identity {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.factor-row__identity div {
  display: grid;
  min-width: 0;
}

.factor-row__identity strong,
.factor-row__identity small {
  overflow-wrap: anywhere;
}

.factor-row__identity small {
  margin-top: 4px;
  color: var(--idmp-text-helper);
}

.factor-index {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 50%;
  background: var(--idmp-interactive-subtle);
  color: var(--idmp-interactive);
  font-size: 12px;
  font-weight: 700;
}

.factor-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 14px;
}

.conversion-section pre {
  max-height: 420px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--idmp-border-subtle);
  background: var(--idmp-field);
  color: var(--idmp-text-primary);
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.formula-display {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-left: 3px solid var(--idmp-interactive);
  background: var(--idmp-interactive-subtle);
  font-family: Consolas, "SFMono-Regular", monospace;
  overflow-wrap: anywhere;
}

.submit-bar {
  position: sticky;
  z-index: 5;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 18px;
  border: 1px solid var(--idmp-border-strong);
  background: var(--idmp-layer-01);
  box-shadow: 0 4px 16px rgb(23 33 43 / 12%);
}

.submit-bar > div {
  display: grid;
  gap: 2px;
}

.submit-bar span {
  color: var(--idmp-text-helper);
  font-size: 12px;
}

@media (max-width: 900px) {
  .metadata-grid,
  .factor-fields {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }

  .factor-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

@media (max-width: 620px) {
  .section-heading,
  .submit-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .section-heading .el-button,
  .submit-bar .el-button {
    width: 100%;
  }
}
</style>
