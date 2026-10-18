<template>
  <div class="idmp-page factor-detail-page">
    <PageHeader :title="`因子详情 / ${factor?.name || factor?.factorName || route.params.id}`" :status="status" :status-label="getStatusLabel(status)">
      <template #meta><span>查看因子</span><span class="mono-data">{{ factor?.code || factor?.factorCode || '' }}</span></template>
      <template #actions><el-button @click="router.push('/factor')">返回因子目录</el-button><el-button v-if="factor" type="primary" @click="edit">编辑因子</el-button></template>
    </PageHeader>
    <StatePanel v-if="loading" type="loading" title="正在读取因子详情" />
    <StatePanel v-else-if="error" type="error" title="因子详情读取失败" :description="error"><template #actions><el-button @click="load">重试</el-button></template></StatePanel>
    <template v-else-if="factor">
      <section class="surface-card factor-basic" aria-label="因子基本信息">
        <div class="basic-heading">
          <div><h2>基本信息</h2><p>查看因子资料、计算配置及当前版本信息</p></div>
          <div v-if="versions.length" class="version-selector"><span>查看版本</span><el-select :model-value="selectedVersionId" aria-label="查看因子版本" @update:model-value="selectVersion"><el-option v-for="item in versions" :key="factorVersionId(item)" :value="factorVersionId(item)" :label="`版本 ${item.versionNo || '-'} · ${getStatusLabel(item.publicationStatus || item.status)}`" /></el-select></div>
        </div>
        <section class="basic-group" aria-label="因子资料">
          <h3>因子资料</h3>
          <dl class="basic-grid">
            <div><dt>因子名称</dt><dd class="factor-name">{{ factor.name || factor.factorName || '-' }}</dd></div>
            <div><dt>因子编码</dt><dd class="mono-data">{{ factor.code || factor.factorCode || '-' }}</dd></div>
            <div><dt>因子类型</dt><dd>{{ getFactorTypeLabel(dsl.definitionKind || factor.definitionKind || factor.factorKind) }}</dd></div>
            <div><dt>业务分类</dt><dd>{{ factor.category || '-' }}</dd></div>
          </dl>
        </section>
        <section class="basic-group" aria-label="计算配置">
          <h3>计算配置</h3>
          <dl class="basic-grid">
            <div><dt>计算模式</dt><dd>{{ mode === 'STATIC' ? '静态（全量）' : '时序（按周期）' }}</dd></div>
            <div><dt>统计方式</dt><dd>{{ dsl.definitionKind === 'DERIVED' ? '复合表达式计算' : dsl.definitionType === 'SQL' ? 'SQL 计算' : getAggregationLabel(dsl.aggregation?.function) }}</dd></div>
            <div><dt>数据域</dt><dd>{{ dsl.primaryDomain?.domainCode || factor.domainCode || '-' }}</dd></div>
            <div><dt>结果粒度</dt><dd>{{ grain.length ? grain.join(' × ') : '总体（不分组）' }}</dd></div>
          </dl>
        </section>
        <section class="basic-group" aria-label="版本信息">
          <h3>版本信息</h3>
          <dl class="basic-grid">
            <div><dt>版本号</dt><dd>{{ version?.versionNo || '-' }}</dd></div>
            <div><dt>版本状态</dt><dd><StatusBadge :status="status" :label="getStatusLabel(status)" /></dd></div>
            <div><dt>因子 ID</dt><dd class="mono-data">{{ factor.id || factor.factorId }}</dd></div>
            <div><dt>版本 ID</dt><dd class="mono-data">{{ selectedVersionId || '尚无版本' }}</dd></div>
          </dl>
        </section>
        <div class="basic-description"><h3>因子说明</h3><p>{{ factor.description || '暂无说明' }}</p></div>
        <el-alert v-if="versionError" :title="versionError" type="error" :closable="false"><el-button @click="load">重新读取版本</el-button></el-alert>
      </section>
      <template v-if="version">
        <FactorRuntimeQuery :key="`${selectedVersionId}-${artifactId}`" :version-id="selectedVersionId" :artifact-id="artifactId" :calculation-mode="mode" />
        <FactorDependencyPanel :key="selectedVersionId" :version-id="selectedVersionId" :artifact-id="artifactId" />
      </template>
      <StatePanel v-else-if="!versionError" type="empty" title="该因子尚无版本" description="可进入编辑页创建版本；暂无可查询或查看依赖的版本。" />
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchFactor, fetchFactors, fetchFactorVersion, fetchFactorVersionsByFactor } from '@/idmp/api/modules/factors'
import { factorDetailVersionId, factorIdText, factorVersionId, assertFactorVersionOwner } from '@/idmp/features/factor/detail'
import { factorCalculationMode } from '@/idmp/utils/factorPeriod'
import { getFactorTypeLabel } from '@/idmp/utils/factorType'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'
import { getStatusLabel } from '@/idmp/design/status'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import FactorRuntimeQuery from '@/idmp/components/FactorRuntimeQuery.vue'
import FactorDependencyPanel from '@/idmp/components/FactorDependencyPanel.vue'
const route = useRoute(), router = useRouter()
const factor = ref(null), version = ref(null), versions = ref([]), selectedVersionId = ref(''), loading = ref(false), error = ref(''), versionError = ref('')
const dsl = computed(() => version.value?.dsl || version.value?.factorDsl || {})
const mode = computed(() => version.value?.calculationMode || factorCalculationMode(dsl.value))
const status = computed(() => version.value?.publicationStatus || version.value?.status || factor.value?.status || 'UNKNOWN')
const artifactId = computed(() => factorIdText(version.value?.currentArtifactId || version.value?.artifactId))
const grain = computed(() => { const value = version.value?.output?.grain || dsl.value.output?.grain || dsl.value.groupBy || []; return value.map(item => typeof item === 'string' ? item : item.fieldCode || item.fieldRef?.fieldCode || item.code || '').filter(Boolean) })
let revision = 0
const rows = data => Array.isArray(data) ? data : data.records || data.items || data.list || []
async function load() {
  const token = ++revision, key = factorIdText(route.params.id), requested = factorIdText(route.query.factorVersionId)
  loading.value = true; error.value = ''; versionError.value = ''; factor.value = null; version.value = null; versions.value = []; selectedVersionId.value = ''
  try {
    let id = key
    if (!/^\d+$/.test(key)) {
      const result = rows(await fetchFactors({ code: key })).find(row => (row.code || row.factorCode) === key)
      if (!result) throw new Error('未找到该因子，请返回目录刷新后重试')
      id = factorIdText(result.id || result.factorId)
    }
    const detail = await fetchFactor(id)
    if (token !== revision) return
    factor.value = detail
    try {
      const list = rows(await fetchFactorVersionsByFactor(id, { cache: 'no-store' }))
      if (token !== revision) return
      versions.value = list
      const chosen = factorDetailVersionId(detail, list, requested)
      if (!chosen) return
      const loaded = await fetchFactorVersion(chosen, { cache: 'no-store' })
      if (token !== revision) return
      assertFactorVersionOwner(loaded, id)
      selectedVersionId.value = chosen
      version.value = loaded
      if (!versions.value.some(row => factorVersionId(row) === chosen)) versions.value = [loaded, ...list]
    } catch (e) { if (token === revision) versionError.value = e.message || '版本读取失败' }
  } catch (e) { if (token === revision) error.value = e.message || '因子读取失败' }
  finally { if (token === revision) loading.value = false }
}
function selectVersion(id) { router.replace({ name: 'FactorDetail', params: { id: factorIdText(factor.value.id || factor.value.factorId) }, query: { ...route.query, factorVersionId: String(id) } }) }
function edit() { router.push({ name: 'FactorEditor', params: { id: factorIdText(factor.value.id || factor.value.factorId) }, query: selectedVersionId.value ? { factorVersionId: selectedVersionId.value } : {} }) }
watch(() => [route.params.id, route.query.factorVersionId], load, { immediate: true })
onBeforeUnmount(() => { revision++ })
</script>
<style scoped>
.factor-basic { padding: 20px; margin-bottom: 16px; }
.basic-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 1px solid var(--idmp-border-subtle); }
.basic-heading h2 { margin: 0; font-size: 18px; }
.basic-heading p { margin: 8px 0 0; color: var(--idmp-text-helper); font-size: 13px; line-height: 1.6; }
.version-selector { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; }
.version-selector > span { color: var(--idmp-text-secondary); font-size: 13px; }
.version-selector .el-select { width: 260px; max-width: 100%; }
.basic-group { padding: 18px 0; }
.basic-group + .basic-group { border-top: 1px solid var(--idmp-border-subtle); }
.basic-group h3, .basic-description h3 { margin: 0; color: var(--idmp-text-primary); font-size: 14px; font-weight: 600; }
.basic-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 12px 0 0; }
.basic-grid > div { min-width: 0; padding: 12px 14px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-sm); background: var(--idmp-layer-02); }
.basic-grid dt { margin-bottom: 8px; color: var(--idmp-text-helper); font-size: 12px; line-height: 1.5; }
.basic-grid dd { margin: 0; color: var(--idmp-text-primary); overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.6; }
.factor-name { font-weight: 600; }
.basic-description { margin-bottom: 16px; padding: 14px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-sm); background: var(--idmp-layer-02); }
.basic-description p { margin: 8px 0 0; color: var(--idmp-text-secondary); overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.8; }
@media (max-width: 1100px) { .basic-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) {
  .factor-basic { padding: 14px; }
  .basic-grid { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .basic-heading { gap: 12px; }
  .version-selector { width: 100%; }
  .version-selector .el-select { flex: 1; width: auto; min-width: 0; }
  .basic-group { padding: 16px 0; }
}
</style>
