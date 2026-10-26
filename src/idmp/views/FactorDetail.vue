<template>
  <div class="idmp-page factor-detail-page">
    <PageHeader :title="`查看因子 / ${factor?.name || factor?.factorName || route.params.id}`" :status="status" :status-label="getStatusLabel(status)">
      <template #meta>
        <span class="mono-data">因子编码：{{ factor?.code || factor?.factorCode || '' }}</span>
        <span v-if="factor">{{ getFactorTypeLabel(dsl.definitionKind || factor.definitionKind || factor.factorKind) }}</span>
      </template>
      <template #actions>
        <el-button @click="router.push('/factor')">返回因子目录</el-button>
        <el-button v-access="'factor.create'" v-if="factor" type="primary" @click="edit">编辑因子</el-button>
      </template>
    </PageHeader>
    <StatePanel v-if="loading" type="loading" title="正在读取因子详情" />
    <StatePanel v-else-if="error" type="error" title="因子详情读取失败" :description="error"><template #actions><el-button @click="load">重试</el-button></template></StatePanel>
    <template v-else-if="factor">
      <section class="surface-card factor-basic" aria-label="因子基本信息">
        <dl class="identity-grid" aria-label="因子标识信息">
          <div><dt>因子名称</dt><dd class="identity-name">{{ factor.name || factor.factorName || '—' }}</dd></div>
          <div><dt>因子 ID</dt><dd class="identity-id mono-data">{{ factor.id || factor.factorId || '—' }}</dd></div>
          <div>
            <dt>当前版本</dt>
            <dd>
              <el-select v-if="versions.length > 1" :model-value="selectedVersionId" class="version-selector" aria-label="查看因子版本" @update:model-value="selectVersion">
                <el-option v-for="item in versions" :key="factorVersionId(item)" :value="factorVersionId(item)" :label="`版本 ${item.versionNo || '-'} · ${getStatusLabel(item.publicationStatus || item.status)}`" />
              </el-select>
              <span v-else class="current-version">{{ selectedVersionLabel }}</span>
              <small class="version-id-text">版本 ID：<span class="mono-data">{{ selectedVersionId || '—' }}</span></small>
            </dd>
          </div>
        </dl>
        <el-alert v-if="versionError" :title="versionError" type="error" :closable="false"><el-button @click="load">重新读取版本</el-button></el-alert>
      </section>
      <div v-if="version" class="factor-workspace">
        <FactorRuntimeQuery v-if="$can('POST', '/factor-versions/1/query')" :key="`${selectedVersionId}-${artifactId}`" :version-id="selectedVersionId" :artifact-id="artifactId" :calculation-mode="mode" />
        <FactorDependencyPanel v-if="$can('GET', '/factor-versions/1/dependency-graph')" :key="selectedVersionId" :version-id="selectedVersionId" :artifact-id="artifactId" />
      </div>
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
import { getStatusLabel } from '@/idmp/design/status'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import FactorRuntimeQuery from '@/idmp/components/FactorRuntimeQuery.vue'
import FactorDependencyPanel from '@/idmp/components/FactorDependencyPanel.vue'
const route = useRoute(), router = useRouter()
const factor = ref(null), version = ref(null), versions = ref([]), selectedVersionId = ref(''), loading = ref(false), error = ref(''), versionError = ref('')
const selectedVersionLabel = computed(() => {
  const number = version.value?.versionNo ?? versions.value.find(item => factorVersionId(item) === selectedVersionId.value)?.versionNo ?? version.value?.version
  return number == null || number === '' ? (selectedVersionId.value ? '版本号未提供' : '暂无版本') : `V${String(number).replace(/^V/i, '')}`
})
const dsl = computed(() => version.value?.dsl || version.value?.factorDsl || {})
const mode = computed(() => version.value?.calculationMode || factorCalculationMode(dsl.value))
const status = computed(() => version.value?.publicationStatus || version.value?.status || factor.value?.status || 'UNKNOWN')
const artifactId = computed(() => factorIdText(version.value?.currentArtifactId || version.value?.artifactId))
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
.factor-basic { min-width: 0; padding: 16px 20px; margin-bottom: 14px; }
.factor-basic > .el-alert { margin-top: 12px; }
.identity-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px 24px; margin: 0; }
.identity-grid > div { min-width: 0; }
.identity-grid dt { color: var(--idmp-text-helper); font-size: 12px; line-height: 20px; }
.identity-grid dd { margin: 5px 0 0; color: var(--idmp-text-primary); font-size: 14px; line-height: 24px; overflow-wrap: anywhere; }
.identity-name, .current-version { font-weight: 600; }
.identity-id, .version-id-text .mono-data { user-select: all; }
.version-id-text { display: block; margin-top: 3px; color: var(--idmp-text-helper); font-size: 12px; line-height: 20px; overflow-wrap: anywhere; }
.version-selector { width: 180px; }
.factor-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.factor-workspace > :deep(section) { min-width: 0; margin-bottom: 0; }
@media (max-width: 640px) { .factor-basic { padding: 14px; } .identity-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; } .version-selector { width: 150px; } }
</style>
