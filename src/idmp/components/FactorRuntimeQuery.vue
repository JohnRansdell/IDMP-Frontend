<template>
  <section class="surface-card runtime-query" aria-label="运行参数与即时查询">
    <div class="runtime-heading"><div><h2>运行参数与即时查询</h2><p>参数仅用于本次查询，不修改因子定义，也不提交编译、试算或发布任务。</p></div><el-button :disabled="schemaLoading" @click="load">刷新运行配置</el-button></div>
    <el-alert v-if="!artifactId" title="当前版本尚未取得编译产物，暂不能即时查询。可进入编辑页完成编译。" type="info" :closable="false" />
    <template v-else>
      <StatePanel v-if="schemaLoading" type="loading" title="正在读取运行参数" />
      <el-alert v-if="schemaError" :title="schemaError" type="error" :closable="false"><el-button @click="load">重试</el-button></el-alert>
      <template v-if="!schemaLoading && !schemaError">
        <RuntimeParameterFields v-if="declarations.length" v-model="values" :declarations="declarations" :show-metadata="false" />
        <p v-else>当前版本没有额外业务运行参数。</p>
        <div v-if="calculationMode === 'TEMPORAL'" class="query-period">
          <label>查询周期 <span class="required">*</span></label>
          <el-date-picker v-model="period" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间（不含）" :disabled="recommendationLoading" />
          <small>按 [开始时间，结束时间) 查询。</small>
          <span v-if="recommendationLoading">正在读取推荐周期</span>
          <el-alert v-if="recommendationError" :title="recommendationError" type="info" :closable="false" />
        </div>
        <p v-else>静态因子按当前参数查询，无需选择时间周期。</p>
        <el-button type="primary" :loading="queryLoading" :disabled="recommendationLoading" @click="runQuery">即时查询</el-button>
      </template>
      <el-alert v-if="queryError" :title="queryError" type="error" :closable="false" />
      <div v-if="result" class="query-result">
        <div class="runtime-heading"><h3>查询结果</h3><el-tag>{{ result.executionMode === 'PERSISTED' ? '复用已保存结果' : result.executionMode === 'AD_HOC_SOURCE' ? '源数据即时计算' : '即时结果' }}</el-tag></div>
        <el-table :data="rows" max-height="420" empty-text="当前周期或参数下没有匹配结果">
          <el-table-column label="维度" min-width="220"><template #default="{ row }">{{ dimensions(row.dimensions) }}</template></el-table-column>
          <el-table-column label="结果值" min-width="150"><template #default="{ row }">{{ row.displayValue ?? row.value ?? row.resultValue ?? '-' }}</template></el-table-column>
          <el-table-column label="质量状态" width="140"><template #default="{ row }">{{ getStatusLabel(row.qualityStatus || row.qualityFlag) || '-' }}</template></el-table-column>
        </el-table>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
.runtime-query { padding: 20px; margin-bottom: 16px; }
.runtime-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
h2 { margin: 0; font-size: 18px; }
p, small { color: var(--idmp-text-helper); }
.query-period { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 16px 0; }
.query-period :deep(.el-date-editor) { max-width: 100%; }
.query-result { margin-top: 20px; }
.required { color: var(--el-color-danger); }
@media (max-width: 640px) { .runtime-query { padding: 14px; } .query-period { display: grid; } .query-period :deep(.el-date-editor) { width: 100%; min-width: 0; } }
</style>
