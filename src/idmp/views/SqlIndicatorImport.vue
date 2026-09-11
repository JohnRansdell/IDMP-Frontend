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
              <el-input v-model.trim="indicator.name" maxlength="128" placeholder="请输入指标名称" />
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
        <el-button type="primary" :icon="CircleCheck" :loading="createLoading" @click="createResources">
          确认创建
        </el-button>
      </div>
    </template>

    <section v-if="createdResult" class="surface-card success-section">
      <el-result icon="success" title="SQL 导入完成" :sub-title="`指标版本 ${createdResult.indicatorVersionId} 已通过编译`">
        <template #extra>
          <el-button @click="router.push('/indicator')">返回指标目录</el-button>
          <el-button type="primary" @click="openCreatedIndicator">打开指标</el-button>
        </template>
      </el-result>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, CircleCheck, CircleCheckFilled, DocumentChecked, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { buildSqlIndicatorImportPayload, mergeSqlFactorMetadata, normalizeSqlImportPreview } from '@/idmp/api/adapters/sqlImport'
import { createSqlIndicatorImport, previewSqlIndicatorImport } from '@/idmp/api/modules/sqlImports'

const router = useRouter()
const sql = ref('')
const preview = ref(null)
const previewLoading = ref(false)
const createLoading = ref(false)
const createdResult = ref(null)
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

watch(sql, () => {
  if (preview.value) {
    preview.value = null
    factorMetadata.value = []
    createdResult.value = null
  }
})

async function runPreview() {
  if (!sql.value.trim()) return
  previewLoading.value = true
  createdResult.value = null
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
  const validIndicator = await indicatorFormRef.value?.validate().catch(() => false)
  if (!validIndicator || !validateFactors()) return
  createLoading.value = true
  try {
    createdResult.value = await createSqlIndicatorImport(buildSqlIndicatorImportPayload({
      sql: sql.value,
      tableMappings,
      indicator,
      factors: factorMetadata.value
    }))
    ElMessage.success('因子和指标创建完成')
    globalThis.scrollTo?.({ top: document.body.scrollHeight, behavior: 'smooth' })
  } catch (error) {
    ElMessage.error(error.message || '创建失败')
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
  router.push(`/indicator/edit/${encodeURIComponent(createdResult.value.indicatorId)}`)
}
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
