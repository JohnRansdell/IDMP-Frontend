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
              <small class="mono-data">{{ resolveIndicatorVersionId(version) }}</small>
            </button>
          </div>
          <dl v-if="selectedVersion" class="version-grid">
            <div>
              <dt>版本 ID</dt>
              <dd class="mono-data">{{ selectedVersion.id }}</dd>
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
import { InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import {
  fetchIndicator,
  fetchIndicatorFormula,
  fetchIndicators,
  fetchIndicatorVersion,
  fetchIndicatorVersions
} from '@/idmp/api/modules/indicators'
import { fetchScenarioVersion, fetchScenarios } from '@/idmp/api/modules/scenarios'
import { indicatorRows } from '@/idmp/data/demo'
import { getStatusLabel } from '@/idmp/design/status'

const route = useRoute()
const router = useRouter()
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const loadError = ref('')
const versionRows = ref([])
const selectedVersion = ref(null)
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
    scenes: null,
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
  await Promise.allSettled([loadScenarioCount(), loadVersions(detail.id)])
  return true
}

async function loadScenarioCount() {
  try {
    const scenarios = normalizeList(await fetchScenarios({ page: 1, size: 100 }))
    const versionResults = await Promise.allSettled(
      scenarios.filter((scenario) => scenario.currentPublishedVersionId)
        .map((scenario) => fetchScenarioVersion(scenario.currentPublishedVersionId))
    )
    detail.scenes = versionResults
      .filter((result) => result.status === 'fulfilled')
      .reduce((count, result) => (
        result.value?.version?.indicators?.some((item) => toOpaqueId(item.indicatorId) === detail.id)
          ? count + 1
          : count
      ), 0)
  } catch (error) {
    console.warn('指标关联场景加载失败', error)
    detail.scenes = null
  }
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
</style>
