<template>
  <section class="surface-card runtime-query" aria-label="运行参数与即时查询">
    <div class="query-header">
      <h2>查询条件</h2>
      <div class="query-context">
        <span v-if="calculationMode === 'TEMPORAL'">结束时间不包含在查询范围内</span>
        <el-button :icon="Refresh" size="small" circle title="刷新查询条件" aria-label="刷新查询条件" :disabled="schemaLoading" @click="load" />
      </div>
    </div>
    <el-alert v-if="!artifactId" title="当前版本尚未取得编译产物，暂不能即时查询。可进入编辑页完成编译。" type="info" :closable="false" />
    <template v-else>
      <StatePanel v-if="schemaLoading" type="loading" title="正在读取运行参数" />
      <el-alert v-if="schemaError" :title="schemaError" type="error" :closable="false"><el-button @click="load">重试</el-button></el-alert>
      <template v-if="!schemaLoading && !schemaError">
        <div class="query-controls">
          <div v-if="calculationMode === 'TEMPORAL'" class="query-period">
            <label>查询周期</label>
            <el-date-picker v-model="period" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间（不含）" aria-label="因子查询周期" :disabled="recommendationLoading" />
          </div>
          <RuntimeParameterFields v-if="declarations.length" v-model="values" :declarations="declarations" :show-metadata="false" />
          <span v-else-if="calculationMode !== 'TEMPORAL'" class="query-empty-parameters">无需填写运行参数</span>
          <div class="query-actions">
            <el-button type="primary" :loading="queryLoading" :disabled="recommendationLoading" @click="runQuery">查询</el-button>
          </div>
        </div>
        <span v-if="recommendationLoading" class="query-status">正在读取推荐周期</span>
        <el-alert v-if="recommendationError" :title="recommendationError" type="info" :closable="false" />
      </template>
      <el-alert v-if="queryError" :title="queryError" type="error" :closable="false" />
      <div v-if="result" class="query-result">
        <div class="runtime-heading"><h3>查询结果</h3><el-tag size="small">{{ result.executionMode === 'PERSISTED' ? '复用已保存结果' : result.executionMode === 'AD_HOC_SOURCE' ? '源数据即时计算' : '即时结果' }}</el-tag></div>
        <el-table :data="rows" max-height="220" empty-text="当前周期或参数下没有匹配结果">
          <el-table-column label="维度" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ dimensions(row.dimensions) }}</template></el-table-column>
          <el-table-column label="结果值" min-width="100"><template #default="{ row }">{{ row.displayValue ?? row.value ?? row.resultValue ?? '-' }}</template></el-table-column>
          <el-table-column label="质量状态" width="90"><template #default="{ row }">{{ getStatusLabel(row.qualityStatus || row.qualityFlag) || '-' }}</template></el-table-column>
        </el-table>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { fetchCompileArtifact, fetchFactorVersion, fetchFactorTrialPeriodRecommendation, queryFactorVersion } from '@/idmp/api/modules/factors'
import { inheritedFactorParameters } from '@/idmp/utils/factorRuntimeParameters'
import { buildSqlRuntimeParameterValues, validateSqlRuntimeParameterValues } from '@/idmp/api/adapters/sqlImport'
import { normalizeTrialPeriodRecommendation, recommendationPeriod } from '@/idmp/utils/trialPeriodRecommendation'
import { factorQueryRows } from '@/idmp/features/factor/detail'
import { getStatusLabel } from '@/idmp/design/status'
import RuntimeParameterFields from './RuntimeParameterFields.vue'
import StatePanel from './StatePanel.vue'
const props = defineProps({ versionId: { type: String, required: true }, artifactId: { type: String, default: '' }, calculationMode: { type: String, default: 'TEMPORAL' } })
const declarations = ref([]), values = ref({}), period = ref([]), result = ref(null)
const schemaLoading = ref(false), schemaError = ref(''), queryLoading = ref(false), queryError = ref(''), recommendationLoading = ref(false), recommendationError = ref('')
const rows = computed(() => factorQueryRows(result.value || {}))
let generation = 0, queryRevision = 0
function dimensions(value) { return value && Object.keys(value).length ? Object.entries(value).map(([key, value]) => `${key}：${value ?? '-'}`).join('，') : '总体' }
async function load() {
  const token = ++generation; queryRevision++
  declarations.value = []; values.value = {}; period.value = []; result.value = null; schemaError.value = ''; queryError.value = ''; recommendationError.value = ''; queryLoading.value = false; recommendationLoading.value = false
  schemaLoading.value = Boolean(props.artifactId && props.versionId)
  if (!schemaLoading.value) return
  const artifactId = props.artifactId, versionId = props.versionId
  const recommendation = async () => {
    if (props.calculationMode !== 'TEMPORAL') return
    recommendationLoading.value = true
    try {
      const data = normalizeTrialPeriodRecommendation(await fetchFactorTrialPeriodRecommendation(versionId))
      if (token !== generation) return
      period.value = recommendationPeriod(data)
      if (!period.value.length) recommendationError.value = '暂无推荐周期，请手动选择查询范围。'
    } catch (e) { if (token === generation) recommendationError.value = `${e.message}；可手动选择周期查询。` }
    finally { if (token === generation) recommendationLoading.value = false }
  }
  // A recommendation failure must not prevent parameter loading or manual queries.
  void recommendation()
  try {
    const artifact = await fetchCompileArtifact(artifactId)
    const upstream = new Map()
    const loaded = await inheritedFactorParameters(artifact, id => {
      if (!upstream.has(id)) upstream.set(id, (async () => {
        const version = await fetchFactorVersion(id)
        if (!version.currentArtifactId) throw new Error('上游因子缺少编译信息，请在编辑页检查后重试')
        return fetchCompileArtifact(version.currentArtifactId)
      })())
      return upstream.get(id)
    })
    if (token === generation) declarations.value = loaded.map(item => ({ ...item, label: item.label || item.name || item.code }))
  } catch (e) { if (token === generation) schemaError.value = e.message || '运行参数读取失败' }
  finally { if (token === generation) schemaLoading.value = false }
}
async function runQuery() {
  if (queryLoading.value || schemaLoading.value || schemaError.value || recommendationLoading.value || !props.artifactId || !props.versionId) return
  queryError.value = ''; result.value = null
  const error = validateSqlRuntimeParameterValues(declarations.value, values.value)
  if (error) { queryError.value = error; return }
  if (props.calculationMode === 'TEMPORAL' && (period.value?.length !== 2 || !period.value[0] || !period.value[1] || period.value[0] >= period.value[1])) { queryError.value = '请选择开始时间早于结束时间的完整查询周期'; return }
  const revision = ++queryRevision, token = generation
  const payload = { parameters: buildSqlRuntimeParameterValues(declarations.value, values.value), ...(props.calculationMode === 'TEMPORAL' ? { periodStart: period.value[0], periodEnd: period.value[1] } : {}) }
  queryLoading.value = true
  try {
    const data = await queryFactorVersion(props.versionId, payload, { cache: 'no-store' })
    if (token === generation && revision === queryRevision) result.value = data
  } catch (e) { if (token === generation && revision === queryRevision) queryError.value = e.message || '即时查询失败' }
  finally { if (token === generation && revision === queryRevision) queryLoading.value = false }
}
watch(() => JSON.stringify([values.value, period.value]), () => { queryRevision++; result.value = null; queryError.value = ''; queryLoading.value = false })
watch(() => [props.versionId, props.artifactId, props.calculationMode], load, { immediate: true })
onBeforeUnmount(() => { generation++; queryRevision++ })
</script>
<style scoped>
.runtime-query { display: grid; gap: 14px; min-width: 0; padding: 16px 20px; margin-bottom: 16px; }
.query-header { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; padding-bottom: 12px; border-bottom: 1px solid var(--idmp-border-subtle); }
.query-header h2 { flex: 0 0 auto; }
.query-context { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px 12px; min-width: 0; color: var(--idmp-text-helper); font-size: 12px; }
.query-controls { display: flex; align-items: flex-end; gap: 12px 16px; min-width: 0; }
.query-actions { display: flex; align-items: center; margin-left: auto; }
.query-status, .query-empty-parameters { color: var(--idmp-text-helper); font-size: 12px; }
.query-empty-parameters { align-self: center; }
.runtime-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
h2 { margin: 0; font-size: 16px; }
h3 { margin: 0; font-size: 14px; }
.query-period { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; min-width: 0; }
.query-period label { flex: 0 0 auto; color: var(--idmp-text-primary); font-size: 13px; font-weight: 600; }
.query-period :deep(.el-date-editor) { width: 400px; min-width: 0; max-width: 100%; }
.query-controls :deep(.runtime-parameter-fields) { display: flex; flex: 1 1 auto; align-items: flex-end; flex-wrap: wrap; gap: 12px; min-width: 0; }
.query-controls :deep(.runtime-parameter-field) { flex: 1 1 170px; max-width: 280px; gap: 6px; }
.query-controls :deep(.runtime-parameter-field label) { min-height: 19px; font-size: 13px; }
.query-result { min-width: 0; padding-top: 14px; border-top: 1px solid var(--idmp-border-subtle); }
@media (max-width: 1180px) {
  .query-controls { flex-wrap: wrap; }
  .query-controls :deep(.runtime-parameter-fields) { flex: 1 1 240px; }
}
@media (max-width: 640px) {
  .runtime-query { padding: 16px; }
  .query-header { align-items: flex-start; }
  .query-context { max-width: 65%; }
  .query-controls { align-items: stretch; }
  .query-period { flex: 1 1 100%; flex-wrap: wrap; }
  .query-period :deep(.el-date-editor) { width: 100%; }
  .query-period :deep(.el-range-editor) { display: grid; grid-template-columns: 18px minmax(0, 1fr) 18px; height: auto; gap: 4px; padding: 8px 10px; }
  .query-period :deep(.el-range-input) { grid-column: 2; width: 100%; min-width: 0; }
  .query-period :deep(.el-range-separator) { grid-column: 2; width: 100%; padding: 0; line-height: 20px; }
  .query-period :deep(.el-range__icon) { grid-column: 1; grid-row: 1 / 4; align-self: center; margin: 0; }
  .query-period :deep(.el-range__close-icon) { grid-column: 3; grid-row: 1 / 4; align-self: center; }
  .query-controls :deep(.runtime-parameter-fields) { flex: 1 1 100%; }
  .query-controls :deep(.runtime-parameter-field) { max-width: none; }
  .query-actions { width: 100%; margin-left: 0; }
  .query-actions .el-button { width: 100%; }
}
</style>
