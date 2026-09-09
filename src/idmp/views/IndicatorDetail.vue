<template>
  <div class="idmp-page indicator-detail-page">
    <PageHeader
      :title="`查看指标：${indicatorName}`"
      :status="indicatorStatus"
    >
      <template #meta>
        <span class="mono-data">指标编码：{{ detail.code || routeIndicatorKey }}</span>
        <span class="mono-data">指标 ID：{{ detail.id || '未返回' }}</span>
        <span>只读详情</span>
      </template>
      <template #actions>
        <el-button @click="router.push('/indicator')">返回指标目录</el-button>
        <el-button type="primary" plain @click="router.push(`/indicator/edit/${detail.code || routeIndicatorKey}`)">
          编辑指标
        </el-button>
      </template>
    </PageHeader>

    <div v-if="loadError" class="notice-strip is-warning detail-notice">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ loadError }}</span>
    </div>

    <section class="detail-layout">
      <article class="surface-card detail-main">
        <div class="section-title">
          <div>
            <h2>基础信息</h2>
            <p class="section-title__description">当前只读页面优先使用后端指标详情、版本列表与版本定义接口。</p>
          </div>
          <StatusBadge :status="indicatorStatus" :label="indicatorStatus" :tone="statusTone(indicatorStatus)" />
        </div>

        <dl class="detail-grid">
          <div>
            <dt>指标名称</dt>
            <dd>{{ detail.name || '-' }}</dd>
          </div>
          <div>
            <dt>指标编码</dt>
            <dd class="mono-data">{{ detail.code || routeIndicatorKey }}</dd>
          </div>
          <div>
            <dt>分类</dt>
            <dd>{{ detail.category || '-' }}</dd>
          </div>
          <div>
            <dt>属性</dt>
            <dd>{{ detail.attribute || '-' }}</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{{ detail.version || '-' }}</dd>
          </div>
          <div>
            <dt>方向</dt>
            <dd>{{ detail.direction || '-' }}</dd>
          </div>
          <div>
            <dt>数据来源</dt>
            <dd>{{ detail.source || '-' }}</dd>
          </div>
          <div>
            <dt>关联场景</dt>
            <dd>{{ detail.scenes === null ? '—' : `${detail.scenes} 个` }}</dd>
          </div>
        </dl>

        <div class="detail-description">
          <span>指标说明</span>
          <p>{{ detail.description || '当前指标目录接口未返回详细说明。' }}</p>
        </div>

        <div class="related-scenarios">
          <div class="section-title compact"><div><h2>关联场景</h2><p class="section-title__description">按指标主 ID 反查当前有效场景，并展示实际引用的指标版本。</p></div></div>
          <StatePanel v-if="scenarioLoading" type="loading" title="正在加载关联场景" />
          <StatePanel v-else-if="scenarioError" type="error" title="关联场景加载失败" :description="scenarioError" />
          <StatePanel v-else-if="!scenarioRows.length" type="empty" title="暂无关联场景" description="该有效指标当前没有场景引用。" />
          <el-table v-else :data="scenarioRows" size="small" table-layout="fixed">
            <el-table-column prop="code" label="场景编码" min-width="180" />
            <el-table-column prop="name" label="场景名称" min-width="180" />
            <el-table-column label="场景版本" width="120"><template #default="{ row }">V{{ row.scenarioVersionNo || '-' }}</template></el-table-column>
            <el-table-column prop="versionSource" label="版本来源" width="150" />
            <el-table-column label="引用的指标版本" min-width="180"><template #default="{ row }">{{ scenarioReferenceText(row) }}</template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openScenario(row)">查看</el-button></template></el-table-column>
          </el-table>
        </div>
      </article>

      <aside class="detail-side">
        <article class="surface-card version-card">
          <div class="section-title compact">
            <div>
              <h2>版本与公式</h2>
              <p class="section-title__description">按后端版本列表倒序展示，当前读取最新版本定义。</p>
            </div>
          </div>
          <StatePanel
            v-if="!versionRows.length"
            type="empty"
            title="暂无版本"
            description="当前指标尚未返回可查看的版本定义。"
          />
          <div v-else class="version-list">
            <button
              v-for="version in versionRows"
              :key="resolveIndicatorVersionId(version)"
              type="button"
              class="version-item"
              :class="{ 'is-active': resolveIndicatorVersionId(version) === toOpaqueId(selectedVersion?.id) }"
              @click="selectVersion(version)"
            >
              <strong>V{{ version.versionNo || '-' }}</strong>
              <span>{{ version.status ? getStatusLabel(version.status) : '-' }}</span>
              <small class="mono-data version-id-text" :title="resolveIndicatorVersionId(version)">{{ resolveIndicatorVersionId(version) }}</small>
            </button>
          </div>
          <dl v-if="selectedVersion" class="version-grid">
            <div class="version-grid__wide">
              <dt>版本 ID</dt>
              <dd class="mono-data version-id-text" :title="selectedVersionId">{{ selectedVersionId || '-' }}</dd>
            </div>
            <div>
              <dt>编译产物</dt>
              <dd class="mono-data">{{ selectedVersion.currentArtifactId || '-' }}</dd>
            </div>
            <div>
              <dt>资源版本</dt>
              <dd>{{ selectedVersion.resourceVersion ?? selectedVersion.version ?? '-' }}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{{ selectedVersion.createdAt || '-' }}</dd>
            </div>
          </dl>
          <pre v-if="selectedVersion?.formula" class="json-preview">{{ formatJson(selectedVersion.formula) }}</pre>
        </article>
        <article v-if="selectedVersion" class="surface-card policy-card">
          <div class="section-title compact"><div><h2>政策依据</h2><p class="section-title__description">仅能绑定已发布的指标版本和政策文件版本。</p></div></div>
          <StatePanel v-if="policyReferenceLoading" type="loading" title="正在读取政策引用" />
          <el-table v-else :data="policyReferences" size="small" table-layout="fixed" empty-text="暂无有效政策引用">
            <el-table-column label="政策文件" min-width="170"><template #default="{ row }">{{ row.policyFileName || row.policyFileCode || row.policyFileVersionId }}</template></el-table-column>
            <el-table-column prop="relationRole" label="角色" width="100" />
            <el-table-column label="操作" width="66"><template #default="{ row }"><el-button link type="danger" @click="invalidatePolicy(row)">失效</el-button></template></el-table-column>
          </el-table>
          <div v-if="isPublishedVersion" class="policy-reference-form"><el-input v-model.trim="policyReferenceForm.policyFileVersionId" placeholder="已发布政策版本 ID" /><el-select v-model="policyReferenceForm.relationRole"><el-option v-for="item in POLICY_REFERENCE_ROLES" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-button type="primary" :loading="policyReferenceSaving" @click="addPolicyReference">添加</el-button></div>
          <el-input v-if="isPublishedVersion" v-model="policyReferenceForm.citationLocation" class="policy-reference-input" placeholder="政策出处（可选）" />
          <el-input v-if="isPublishedVersion" v-model="policyReferenceForm.citationText" class="policy-reference-input" type="textarea" :rows="2" placeholder="政策原文（可选）" />
          <div class="version-mapping-links"><div class="section-title compact"><div><h3>有效指标映射</h3><p class="section-title__description">反查当前指标版本作为源侧或目标侧的已发布有效映射。</p></div></div><StatePanel v-if="mappingReferenceLoading" type="loading" title="正在读取有效映射" /><StatePanel v-else-if="mappingReferenceError" type="error" title="有效映射读取失败" :description="mappingReferenceError" /><el-table v-else :data="mappingReferences" size="small" empty-text="暂无有效映射"><el-table-column prop="code" label="映射编码" min-width="150" /><el-table-column prop="mappingType" label="关系" width="110" /><el-table-column prop="comparability" label="可比性" width="120" /><el-table-column label="操作" width="68"><template #default="{ row }"><el-button link type="primary" @click="openMapping(row)">查看</el-button></template></el-table-column></el-table></div>
        </article>
        <StatePanel
          type="unavailable"
          title="规则、场景与发布门禁待接入"
          description="当前仅展示目录摘要；规则/场景持久化和发布门禁结果仍需后端接口补齐。"
        />
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import {
  fetchIndicator,
  fetchIndicatorFormula,
  fetchIndicators,
  fetchIndicatorScenarios,
  fetchIndicatorVersion,
  fetchIndicatorVersions
} from '@/idmp/api/modules/indicators'
import { indicatorRows } from '@/idmp/data/demo'
import { getStatusLabel } from '@/idmp/design/status'
import { createPolicyReference, fetchMappingsByIndicatorVersion, fetchPolicyReferences, invalidatePolicyReference } from '@/idmp/api/modules/mappings'
import { POLICY_REFERENCE_ROLES } from '@/idmp/api/adapters/mapping'

const route = useRoute()
const router = useRouter()
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const loadError = ref('')
const versionRows = ref([])
const selectedVersion = ref(null)
const scenarioRows = ref([])
const scenarioLoading = ref(false)
const scenarioError = ref('')
const policyReferences = ref([])
const policyReferenceLoading = ref(false)
const policyReferenceSaving = ref(false)
const mappingReferences = ref([])
const mappingReferenceLoading = ref(false)
const mappingReferenceError = ref('')
const policyReferenceForm = reactive({ policyFileVersionId: '', citationLocation: '', citationText: '', relationRole: 'SOURCE' })
const detail = reactive({
  id: '',
  code: '',
  name: '',
  category: '',
  attribute: '',
  version: '',
  direction: '',
  source: '',
  status: '',
  scenes: null,
  description: ''
})

const indicatorName = computed(() => detail.name || detail.code || routeIndicatorKey.value || '待加载')
const indicatorStatus = computed(() => detail.status || 'UNKNOWN')
const selectedVersionId = computed(() => resolveIndicatorVersionId(selectedVersion.value))
const isPublishedVersion = computed(() => String(selectedVersion.value?.publicationStatus || selectedVersion.value?.status || '').toUpperCase() === 'PUBLISHED')

function hydrateDetail(item) {
  Object.assign(detail, {
    id: toOpaqueId(item.id ?? item.indicatorId ?? ''),
    code: item.code || routeIndicatorKey.value,
    name: item.name || '',
    category: item.category || '后端指标',
    attribute: item.attribute || '定量',
    version: item.versionNo ? `V${item.versionNo}` : item.version || 'V1',
    direction: item.direction || '监测比较',
    source: item.source || '后端接口',
    status: item.status || 'UNKNOWN',
    scenes: item.scenarioCount ?? null,
    description: item.description || ''
  })
}

async function loadIndicatorDetail() {
  loadError.value = ''
  try {
    const target = await loadBackendDetail()
    if (target) return
    loadError.value = `未在指标接口中找到 ${routeIndicatorKey.value}，已显示本地兜底摘要。`
  } catch (error) {
    loadError.value = error?.message || '指标详情接口暂不可用，已显示本地兜底摘要。'
  }

  const demoTarget = findIndicator(indicatorRows)
  if (demoTarget) {
    hydrateDetail(demoTarget)
  } else {
    detail.code = routeIndicatorKey.value
    detail.name = routeIndicatorKey.value
  }
}

async function loadBackendDetail() {
  const key = routeIndicatorKey.value
  let target = null

  if (/^\d+$/.test(key)) {
    target = await fetchIndicator(key)
  } else {
    const rows = await fetchIndicators()
    target = findIndicator(normalizeList(rows))
    if (target?.id || target?.indicatorId) {
      target = await fetchIndicator(target.id ?? target.indicatorId)
    }
  }

  if (!target) return false

  hydrateDetail(target)
  await Promise.allSettled([loadRelatedScenarios(), loadVersions(detail.id)])
  return true
}

async function loadRelatedScenarios() {
  if (!detail.id) return
  scenarioLoading.value = true
  scenarioError.value = ''
  try {
    const page = await fetchIndicatorScenarios(detail.id, { page: 1, size: 100 })
    scenarioRows.value = normalizeList(page)
    detail.scenes = Number(page?.total ?? scenarioRows.value.length)
  } catch (error) {
    scenarioRows.value = []
    scenarioError.value = error?.message || '关联场景接口暂不可用。'
    detail.scenes = null
  } finally {
    scenarioLoading.value = false
  }
}

function scenarioReferenceText(row) {
  const refs = Array.isArray(row.references) ? row.references : []
  return refs.map((item) => `V${item.indicatorVersionNo || '-'}（${item.indicatorVersionId || '-'}）`).join('，') || '-'
}

function openScenario(row) {
  const scenarioId = row.id || row.scenarioId
  if (!scenarioId) return
  router.push({ name: 'ScenarioEditor', params: { scenarioId }, query: { versionId: row.scenarioVersionId } })
}

async function loadVersions(indicatorId) {
  if (!indicatorId) return
  const versions = normalizeList(await fetchIndicatorVersions(indicatorId))
  versionRows.value = versions
  const latest = pickLatestVersion(versions)
  if (resolveIndicatorVersionId(latest) || latest?.id) {
    await selectVersion(latest)
  }
}

async function selectVersion(version) {
  selectedVersion.value = version
  const versionId = resolveIndicatorVersionId(version) || toOpaqueId(version?.id)
  if (!versionId) return
  try {
    const versionDetail = await fetchIndicatorVersion(versionId)
    let formula = extractFormula(versionDetail)
    if (!formula) {
      try {
        formula = await fetchIndicatorFormula(versionId)
      } catch {
        formula = null
      }
    }
    selectedVersion.value = {
      ...versionDetail,
      id: versionId,
      formula: formula || versionDetail.formula || versionDetail.formulaAst
    }
    detail.version = selectedVersion.value?.versionNo ? `V${selectedVersion.value.versionNo}` : detail.version
    detail.status = selectedVersion.value?.status || detail.status
  } catch {
    selectedVersion.value = version
  }
  void loadPolicyReferences(selectedVersionId.value)
  void loadMappingReferences(selectedVersionId.value)
}

async function loadPolicyReferences(versionId) {
  if (!versionId) return
  policyReferenceLoading.value = true
  try {
    policyReferences.value = await fetchPolicyReferences(versionId)
  } catch (error) {
    policyReferences.value = []
    ElMessage.warning(error?.message || '政策引用读取失败')
  } finally { policyReferenceLoading.value = false }
}

async function addPolicyReference() {
  if (!selectedVersionId.value || !policyReferenceForm.policyFileVersionId) return ElMessage.warning('请填写已发布政策版本 ID')
  policyReferenceSaving.value = true
  try {
    await createPolicyReference(selectedVersionId.value, {
      ...policyReferenceForm,
      policyFileVersionId: String(policyReferenceForm.policyFileVersionId)
    })
    Object.assign(policyReferenceForm, { policyFileVersionId: '', citationLocation: '', citationText: '', relationRole: 'SOURCE' })
    await loadPolicyReferences(selectedVersionId.value)
    ElMessage.success('政策引用已添加')
  } catch (error) { ElMessage.error(error?.message || '添加政策引用失败') } finally { policyReferenceSaving.value = false }
}

async function loadMappingReferences(versionId) {
  if (!versionId) return
  mappingReferenceLoading.value = true
  mappingReferenceError.value = ''
  try {
    mappingReferences.value = await fetchMappingsByIndicatorVersion(versionId)
  } catch (error) {
    mappingReferences.value = []
    mappingReferenceError.value = error?.message || '无法读取有效映射'
  } finally { mappingReferenceLoading.value = false }
}

function openMapping(row) {
  if (row?.id === undefined || row?.id === null) return
  router.push({ name: 'IndicatorMappingDetail', params: { id: String(row.id) } })
}

async function invalidatePolicy(reference) {
  try {
    await ElMessageBox.confirm('确认使该政策引用失效？', '失效政策引用', { type: 'warning' })
    await invalidatePolicyReference(reference.id, reference.resourceVersion)
    await loadPolicyReferences(selectedVersionId.value)
    ElMessage.success('政策引用已失效')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '失效政策引用失败')
  }
}

function findIndicator(rows) {
  return rows.find(item => [item.id, item.indicatorId, item.code].map(toOpaqueId).includes(routeIndicatorKey.value))
}

function statusTone(status) {
  return {
    '草稿': 'warning',
    '待审核': 'info',
    '已发布': 'success',
    '已停用': 'neutral',
    DRAFT: 'warning',
    PUBLISHED: 'success',
    DISABLED: 'neutral'
  }[status] || 'neutral'
}

function toOpaqueId(value) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function resolveIndicatorVersionId(version) {
  return toOpaqueId(
    version?.indicatorVersionId ??
    version?.versionId ??
    version?.draftVersionId ??
    version?.currentVersionId ??
    version?.latestVersionId ??
    version?.id
  )
}

function extractFormula(payload) {
  return payload?.formula?.formula || payload?.formula || payload?.formulaAst || payload?.definition?.formula || null
}

function pickLatestVersion(versions) {
  return [...versions].sort((a, b) => {
    const aNo = Number(a.versionNo ?? a.version ?? 0)
    const bNo = Number(b.versionNo ?? b.version ?? 0)
    if (aNo !== bNo) return bNo - aNo
    return String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || ''))
  })[0]
}

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

onMounted(loadIndicatorDetail)
</script>

<style scoped lang="scss">
.detail-notice {
  margin-bottom: 16px;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
}

.detail-main {
  padding: 18px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 16px 0 0;
  gap: 12px;
}

.detail-grid div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
}

.detail-grid dt {
  margin-bottom: 6px;
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.detail-grid dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--idmp-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-description {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);

  span {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  p {
    margin: 8px 0 0;
    color: var(--idmp-text-secondary);
    line-height: 22px;
  }
}

.detail-side {
  display: grid;
  align-content: start;
  gap: 16px;
}

.version-card {
  padding: 16px;
}

.policy-card { padding: 16px; }
.policy-reference-form { display: grid; grid-template-columns: minmax(0, 1fr) 128px auto; gap: 8px; margin: 12px 0 8px; }
.policy-reference-input { margin-bottom: 8px; }

.section-title.compact {
  margin-bottom: 12px;

  h2 {
    margin: 0 0 4px;
    font-size: 15px;
  }
}

.version-list {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.version-item {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  background: var(--idmp-layer-02);
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-sm);

  &.is-active {
    border-color: var(--idmp-interactive);
    background: var(--idmp-interactive-subtle);
  }

  strong {
    color: var(--idmp-text-primary);
  }

  span,
  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  small {
    grid-column: 1 / -1;
  }
}

.version-id-text {
  display: block;
  max-width: 100%;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-all;
  user-select: all;
}

.version-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0 0 12px;

  div {
    min-width: 0;
    padding: 10px;
    background: var(--idmp-layer-02);
    border: 1px solid var(--idmp-border-subtle);
    border-radius: var(--idmp-radius-sm);
  }

  dt {
    margin-bottom: 5px;
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--idmp-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .version-grid__wide {
    grid-column: 1 / -1;
  }

  .version-id-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

.json-preview {
  max-height: 260px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  color: var(--idmp-text-secondary);
  font-size: 12px;
  line-height: 18px;
  background: var(--idmp-layer-02);
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-sm);
}

@media (max-width: 1180px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .policy-reference-form { grid-template-columns: 1fr; }
}
</style>
