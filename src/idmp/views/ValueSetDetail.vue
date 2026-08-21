<template>
  <div class="idmp-page value-set-detail-page">
    <PageHeader :title="valueSet?.name || '值集详情'">
      <template #meta><span class="data-source-badge is-live">真实接口</span><span class="header-meta">{{ valueSet?.code || '—' }}</span></template>
      <template #actions><el-button @click="router.push({ name: 'ValueSetManagement' })">返回值集列表</el-button><el-button :loading="loading" @click="loadAll">刷新</el-button></template>
    </PageHeader>
    <StatePanel v-if="error" type="error" title="值集详情加载失败" :description="error" />
    <template v-else>
      <section class="surface-card value-set-summary">
        <div><span>编码</span><strong>{{ valueSet?.code || '—' }}</strong></div><div><span>匹配模式</span><strong>{{ matchModeLabel(version?.matchMode || valueSet?.matchMode) || '—' }}</strong></div><div><span>状态</span><StatusBadge :status="valueSet?.status" /></div><div><span>当前发布版本</span><strong>{{ valueSet?.currentPublishedVersionId || '—' }}</strong></div>
      </section>
      <section class="surface-card table-card">
        <div class="section-title section-title--toolbar"><div><h2>版本历史</h2><p class="section-title__description">选择版本查看完整值项；草稿和已校验版本可进入编辑。</p></div><div><el-select v-model="selectedVersionId" placeholder="选择版本" @change="loadVersion"><el-option v-for="item in versions" :key="item.id" :label="`V${item.versionNo} · ${item.publicationStatus ? getStatusLabel(item.publicationStatus) : '—'}`" :value="String(item.id)" /></el-select><el-button v-if="selectedVersionId" type="primary" @click="editVersion">编辑版本</el-button></div></div>
        <el-table v-if="versions.length" :data="versions" row-key="id" highlight-current-row @row-click="selectVersion"><el-table-column prop="versionNo" label="版本" width="100" /><el-table-column label="状态" width="150"><template #default="{ row }"><StatusBadge :status="row.publicationStatus" /></template></el-table-column><el-table-column prop="resourceVersion" label="资源版本" width="120" /><el-table-column prop="id" label="版本 ID" min-width="220" /></el-table>
        <StatePanel v-else type="empty" title="暂无版本" description="该值集没有可查看的版本。" />
      </section>
      <section class="surface-card table-card">
        <div class="section-title"><div><h2>值项</h2><p class="section-title__description">{{ version?.publicationStatus ? getStatusLabel(version.publicationStatus) : '—' }} · {{ items.length }} 项</p></div></div>
        <el-table v-if="items.length" :data="items" table-layout="fixed"><el-table-column prop="code" label="编码" min-width="160" /><el-table-column prop="value" label="标准值" min-width="160" /><el-table-column prop="label" label="标签" min-width="160" /><el-table-column prop="sortOrder" label="排序" width="100" /><el-table-column label="启用状态" width="130"><template #default="{ row }">{{ row.enableStatus ? getStatusLabel(row.enableStatus) : '—' }}</template></el-table-column></el-table>
        <StatePanel v-else type="empty" title="暂无值项" description="该版本当前没有值项。" />
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { fetchValueSet, fetchValueSetItems, fetchValueSetVersions, fetchValueSetVersion } from '@/idmp/api/modules/valueSets'
import { getStatusLabel } from '@/idmp/design/status'
import { matchModeLabel } from '@/idmp/features/meta'

const route = useRoute(); const router = useRouter()
const valueSet = ref(null); const versions = ref([]); const version = ref(null); const items = ref([]); const selectedVersionId = ref(''); const loading = ref(false); const error = ref('')

async function loadAll() {
  loading.value = true; error.value = ''
  try {
    const valueSetId = String(route.params.valueSetId)
    const [detail, versionRows] = await Promise.all([fetchValueSet(valueSetId), fetchValueSetVersions(valueSetId)])
    valueSet.value = detail?.valueSet || detail
    versions.value = Array.isArray(versionRows) ? versionRows : versionRows?.records || []
    selectedVersionId.value = String(valueSet.value?.currentPublishedVersionId || versions.value[0]?.id || '')
    if (selectedVersionId.value) await loadVersion(selectedVersionId.value)
  } catch (err) { error.value = err?.message || '值集详情加载失败。' } finally { loading.value = false }
}

async function loadVersion(versionId = selectedVersionId.value) {
  if (!versionId) return
  selectedVersionId.value = String(versionId)
  const [detail, itemRows] = await Promise.all([fetchValueSetVersion(versionId), fetchValueSetItems(versionId)])
  version.value = detail?.version || detail
  items.value = Array.isArray(itemRows) ? itemRows : itemRows?.items || []
}
function selectVersion(row) { loadVersion(row.id) }
function editVersion() { router.push({ name: 'ValueSetVersionEditor', params: { versionId: selectedVersionId.value }, query: { valueSetId: route.params.valueSetId } }) }
onMounted(loadAll)
</script>

<style scoped>
.value-set-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; padding: 18px; }
.value-set-summary div { display: flex; flex-direction: column; gap: 6px; }.value-set-summary span { color: var(--idmp-text-secondary); font-size: 12px; }.value-set-summary strong { font-size: 16px; }
.table-card { margin-bottom: 16px; }.section-title--toolbar { display: flex; justify-content: space-between; align-items: center; }
</style>
