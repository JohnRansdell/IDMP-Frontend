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
            <p class="section-title__description">当前只读页面优先使用指标目录接口返回的数据；详情接口接入后可扩展版本、公式与试算记录。</p>
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
            <dd>{{ detail.scenes ?? 0 }} 个</dd>
          </div>
        </dl>

        <div class="detail-description">
          <span>指标说明</span>
          <p>{{ detail.description || '当前指标目录接口未返回详细说明。' }}</p>
        </div>
      </article>

      <aside class="detail-side">
        <StatePanel
          type="unavailable"
          title="版本与公式详情待接入"
          description="后端提供指标详情、版本列表、公式详情和试算记录接口后，此处将展示完整只读配置快照。"
        />
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
import { fetchIndicators } from '@/idmp/api/modules/indicators'
import { indicatorRows } from '@/idmp/data/demo'

const route = useRoute()
const router = useRouter()
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const loadError = ref('')
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
  scenes: 0,
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
    scenes: item.scenes || 0,
    description: item.description || ''
  })
}

async function loadIndicatorDetail() {
  loadError.value = ''
  try {
    const rows = await fetchIndicators()
    const target = Array.isArray(rows) ? findIndicator(rows) : null
    if (target) {
      hydrateDetail(target)
      return
    }
    loadError.value = `未在指标目录接口中找到 ${routeIndicatorKey.value}，已显示本地兜底摘要。`
  } catch (error) {
    loadError.value = error?.message || '指标目录接口暂不可用，已显示本地兜底摘要。'
  }

  const demoTarget = findIndicator(indicatorRows)
  if (demoTarget) {
    hydrateDetail(demoTarget)
  } else {
    detail.code = routeIndicatorKey.value
    detail.name = routeIndicatorKey.value
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

@media (max-width: 1180px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}
</style>
