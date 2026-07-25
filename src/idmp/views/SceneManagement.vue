<template>
  <div class="idmp-page scene-management">
    <PageHeader
      eyebrow="指标配置 / 场景管理"
      title="三级公立医院绩效考核"
      description="查看场景口径、关联指标及演示计算结果；当前页面不提供场景配置写入能力。"
      status="ENABLED"
      status-label="演示场景"
      status-tone="info"
    >
      <template #meta>
        <span class="data-source-badge">演示数据</span>
        <span>场景编码 <strong class="mono-data">KH</strong></span>
        <span>统计周期 年度</span>
      </template>
      <template #actions>
        <el-button type="primary" :icon="DataAnalysis" @click="showResults">
          查看计算结果
        </el-button>
        <el-tooltip content="后端尚未提供场景编辑接口" placement="bottom">
          <span class="disabled-action">
            <el-button :icon="EditPen" disabled>编辑场景</el-button>
          </span>
        </el-tooltip>
        <el-tooltip content="后端尚未提供场景复制接口" placement="bottom">
          <span class="disabled-action">
            <el-button :icon="CopyDocument" disabled>复制场景</el-button>
          </span>
        </el-tooltip>
        <el-tooltip content="后端尚未提供场景配置导出接口" placement="bottom">
          <span class="disabled-action">
            <el-button :icon="Download" disabled>导出配置</el-button>
          </span>
        </el-tooltip>
      </template>
    </PageHeader>

    <div class="notice-strip scene-notice" role="note">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>
        本页数据来自本地演示配置。搜索、页签和周期切换只影响当前页面展示，不会写入后端或触发真实计算。
      </span>
    </div>

    <section class="surface-card scene-summary" aria-labelledby="scene-summary-title">
      <div class="scene-summary__header">
        <div>
          <h2 id="scene-summary-title">场景口径摘要</h2>
          <p>用于识别当前政策来源、管理责任和关联范围。</p>
        </div>
        <span class="data-source-badge">本地静态配置</span>
      </div>
      <dl class="scene-summary__grid">
        <div v-for="item in summaryItems" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd v-if="item.kind !== 'status'" :class="{ 'clinical-metric': item.kind === 'metric' }">
            {{ item.value }}
          </dd>
          <dd v-else>
            <StatusBadge status="ENABLED" label="已启用" />
          </dd>
        </div>
      </dl>
    </section>

    <el-tabs v-model="activeTab" class="idmp-tabs scene-tabs">
      <el-tab-pane label="关联指标" name="indicators">
        <section class="surface-card table-card scene-table-card" aria-labelledby="scene-indicators-title">
          <div class="scene-table-toolbar">
            <div>
              <h2 id="scene-indicators-title">关联指标</h2>
              <p>展示本场景下的指标版本、口径覆盖和最近演示结果。</p>
            </div>
            <div class="scene-table-toolbar__controls">
              <el-input
                v-model.trim="indicatorKeyword"
                clearable
                :prefix-icon="Search"
                placeholder="搜索指标编码或名称"
                aria-label="搜索关联指标"
              />
              <el-tooltip content="后端尚未提供场景指标关联接口" placement="bottom">
                <span class="disabled-action">
                  <el-button :icon="Plus" disabled>添加指标</el-button>
                </span>
              </el-tooltip>
            </div>
          </div>

          <StatePanel
            v-if="!filteredSceneIndicators.length"
            type="empty"
            title="没有匹配的关联指标"
            description="请调整搜索条件；当前演示数据不会请求后端。"
          >
            <template #actions>
              <el-button @click="indicatorKeyword = ''">清除搜索</el-button>
            </template>
          </StatePanel>

          <div v-else class="table-scroll">
            <el-table
              :data="filteredSceneIndicators"
              table-layout="fixed"
              class="scene-table"
            >
              <el-table-column prop="code" label="指标编码" width="132">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.code }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="指标名称" min-width="260" show-overflow-tooltip />
              <el-table-column prop="version" label="版本" width="104">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.version }}</span>
                </template>
              </el-table-column>
              <el-table-column label="排除条件" width="128">
                <template #default="{ row }">
                  <StatusBadge
                    :label="row.exclusion"
                    :tone="row.exclusion === '默认' ? 'neutral' : 'warning'"
                  />
                </template>
              </el-table-column>
              <el-table-column label="参数覆盖" width="128">
                <template #default="{ row }">
                  <StatusBadge
                    :label="row.override"
                    :tone="row.override === '无' ? 'neutral' : 'info'"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="report" label="上报要求" width="130" />
              <el-table-column label="最近演示值" width="142">
                <template #default="{ row }">
                  <strong class="clinical-metric">{{ row.latest }}</strong>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="182" fixed="right">
                <template #default="{ row }">
                  <button class="action-link" type="button" @click="previewOverride(row)">
                    查看覆盖
                  </button>
                  <button class="action-link" type="button" @click="openIndicatorResult(row)">
                    查看结果
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="通用排除条件" name="exclusions">
        <section class="surface-card table-card scene-table-card" aria-labelledby="scene-exclusions-title">
          <div class="scene-table-toolbar">
            <div>
              <h2 id="scene-exclusions-title">场景通用排除条件</h2>
              <p>以下业务规则会在本场景的指标计算前统一应用。</p>
            </div>
            <el-tooltip content="后端尚未提供场景排除条件维护接口" placement="bottom">
              <span class="disabled-action">
                <el-button :icon="Plus" disabled>新增条件</el-button>
              </span>
            </el-tooltip>
          </div>
          <div class="table-scroll">
            <el-table :data="exclusionRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="name" label="条件名称" min-width="210" />
              <el-table-column prop="scope" label="适用范围" min-width="180" />
              <el-table-column prop="logic" label="业务规则" min-width="340" show-overflow-tooltip />
              <el-table-column prop="updated" label="最近更新" width="142">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.updated }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="104">
                <template #default>
                  <StatusBadge status="ENABLED" label="已启用" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="106" fixed="right">
                <template #default="{ row }">
                  <button class="action-link" type="button" @click="viewRule(row)">
                    查看规则
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="参数覆盖" name="overrides">
        <section class="surface-card table-card scene-table-card" aria-labelledby="scene-overrides-title">
          <div class="scene-table-toolbar">
            <div>
              <h2 id="scene-overrides-title">场景参数覆盖</h2>
              <p>仅展示相对于指标默认配置发生变化的演示参数。</p>
            </div>
            <el-tooltip content="后端尚未提供场景覆盖参数维护接口" placement="bottom">
              <span class="disabled-action">
                <el-button :icon="Setting" disabled>覆盖设置</el-button>
              </span>
            </el-tooltip>
          </div>
          <div class="table-scroll">
            <el-table :data="overrideRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="code" label="指标编码" width="132">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.code }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="指标名称" min-width="230" />
              <el-table-column prop="parameter" label="参数项" min-width="180" />
              <el-table-column prop="defaultValue" label="默认值" width="136" />
              <el-table-column label="场景覆盖值" width="152">
                <template #default="{ row }">
                  <StatusBadge :label="row.overrideValue" tone="info" />
                </template>
              </el-table-column>
              <el-table-column prop="effective" label="生效周期" width="148" />
              <el-table-column label="操作" width="106" fixed="right">
                <template #default="{ row }">
                  <button class="action-link" type="button" @click="previewOverride(row)">
                    查看覆盖
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="计算结果" name="results">
        <section class="surface-card table-card scene-table-card" aria-labelledby="scene-results-title">
          <div class="scene-table-toolbar">
            <div>
              <h2 id="scene-results-title">场景计算结果</h2>
              <p>演示结果用于呈现页面结构，不代表当前后端活动结果。</p>
            </div>
            <div class="scene-table-toolbar__controls">
              <el-select v-model="resultPeriod" aria-label="计算周期">
                <el-option label="2024 年度" value="2024 年度" />
                <el-option label="2024 年第四季度" value="2024 年第四季度" />
                <el-option label="2024 年 12 月" value="2024 年 12 月" />
              </el-select>
              <el-tooltip content="后端尚未提供场景重新计算接口" placement="bottom">
                <span class="disabled-action">
                  <el-button :icon="RefreshRight" disabled>重新计算</el-button>
                </span>
              </el-tooltip>
            </div>
          </div>
          <div class="notice-strip result-period-notice" role="note">
            周期选择只更新演示上下文，结果数值不会重新计算。
          </div>
          <div class="table-scroll">
            <el-table :data="calculationRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="code" label="指标编码" width="132">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.code }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="指标名称" min-width="260" />
              <el-table-column label="展示周期" width="170">
                <template #default>
                  <span class="mono-data">{{ resultPeriod }}</span>
                </template>
              </el-table-column>
              <el-table-column label="演示结果" width="136">
                <template #default="{ row }">
                  <strong class="clinical-metric">{{ row.result }}</strong>
                </template>
              </el-table-column>
              <el-table-column prop="target" label="目标要求" width="130" />
              <el-table-column label="达标状态" width="120">
                <template #default="{ row }">
                  <StatusBadge
                    :status="row.tone === 'warning' ? 'FAILED' : 'SUCCEEDED'"
                    :label="row.tone === 'warning' ? '未达标' : '已达标'"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="updated" label="演示计算时间" width="172">
                <template #default="{ row }">
                  <span class="mono-data">{{ row.updated }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CopyDocument,
  DataAnalysis,
  Download,
  EditPen,
  InfoFilled,
  Plus,
  RefreshRight,
  Search,
  Setting
} from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { sceneIndicators } from '@/idmp/data/demo'

const activeTab = ref('indicators')
const indicatorKeyword = ref('')
const resultPeriod = ref('2024 年度')

const summaryItems = [
  { label: '关联政策', value: '绩效考核 2024 版' },
  { label: '主管部门', value: '国家卫健委' },
  { label: '统计周期', value: '年度' },
  { label: '关联指标口径', value: '56 项', kind: 'metric' },
  { label: '配置版本', value: '演示版本 V2024', kind: 'metric' },
  { label: '状态', value: '已启用', kind: 'status' }
]

const exclusionRows = [
  {
    name: '排除日间手术患者',
    scope: '手术类指标',
    logic: '就诊类型等于日间手术时不计入统计口径',
    updated: '2024-12-18'
  },
  {
    name: '排除新生儿患者',
    scope: '全场景',
    logic: '年龄小于 28 天的患者不纳入成人指标计算',
    updated: '2024-11-06'
  },
  {
    name: '排除临床试验用药',
    scope: '合理用药类指标',
    logic: '临床试验项目产生的药品消耗不计入 DDDs',
    updated: '2024-09-23'
  }
]

const overrideRows = [
  {
    code: 'KH-02',
    name: '手术患者并发症发生率',
    parameter: '手术级别范围',
    defaultValue: '全部手术',
    overrideValue: '二级及以上',
    effective: '2024 年度'
  },
  {
    code: 'KH-02',
    name: '手术患者并发症发生率',
    parameter: '除零策略',
    defaultValue: '显示为空',
    overrideValue: '显示 0%',
    effective: '2024 年度'
  }
]

const calculationRows = sceneIndicators.map((item, index) => ({
  code: item.code,
  name: item.name,
  result: item.latest.replace(' ↑', ''),
  target: index === 0 ? '> 1.50' : index === 1 ? '< 3%' : '< 40',
  tone: item.tone,
  updated: '2025-01-15 09:30'
}))

const filteredSceneIndicators = computed(() => {
  const keyword = indicatorKeyword.value.toLowerCase()
  if (!keyword) return sceneIndicators
  return sceneIndicators.filter(
    (item) =>
      item.code.toLowerCase().includes(keyword) ||
      item.name.toLowerCase().includes(keyword)
  )
})

const showResults = () => {
  activeTab.value = 'results'
}

const openIndicatorResult = (row) => {
  activeTab.value = 'results'
  ElMessage.info(`已切换到计算结果；“${row.name}”当前展示的是本地演示值。`)
}

const previewOverride = (row) => {
  const parameter = row.parameter ? `“${row.parameter}”` : '当前指标'
  ElMessage.info(`${parameter}仅提供演示配置预览，不会写入后端。`)
}

const viewRule = (row) => {
  ElMessage.info(`${row.name}：${row.logic}`)
}
</script>

<style scoped lang="scss">
.scene-management {
  min-width: 0;
}

.disabled-action {
  display: inline-flex;
}

.scene-notice {
  margin-bottom: var(--idmp-space-4);
}

.scene-summary {
  margin-bottom: var(--idmp-space-4);
}

.scene-summary__header,
.scene-table-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--idmp-space-4);
  gap: var(--idmp-space-4);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.scene-summary__header h2,
.scene-table-toolbar h2 {
  margin: 0;
  color: var(--idmp-text-primary);
  font-size: 16px;
  font-weight: 650;
  line-height: 24px;
}

.scene-summary__header p,
.scene-table-toolbar p {
  margin: var(--idmp-space-1) 0 0;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.scene-summary__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin: 0;
}

.scene-summary__grid > div {
  min-width: 0;
  padding: var(--idmp-space-3) var(--idmp-space-4);
  border-right: 1px solid var(--idmp-border-soft);
}

.scene-summary__grid > div:last-child {
  border-right: 0;
}

.scene-summary__grid dt {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.scene-summary__grid dd {
  min-height: 22px;
  margin: var(--idmp-space-1) 0 0;
  overflow: hidden;
  color: var(--idmp-text-primary);
  font-weight: 600;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-tabs {
  margin-bottom: 0;
}

.scene-tabs :deep(.el-tabs__content) {
  padding-top: var(--idmp-space-4);
}

.scene-table-card {
  padding: 0;
}

.scene-table-toolbar {
  align-items: center;
}

.scene-table-toolbar__controls {
  display: flex;
  align-items: center;
  gap: var(--idmp-space-2);
}

.scene-table-toolbar__controls :deep(.el-input) {
  width: 232px;
}

.scene-table-toolbar__controls :deep(.el-select) {
  width: 192px;
}

.scene-table-card > .table-scroll {
  padding: 0 var(--idmp-space-4) var(--idmp-space-4);
}

.scene-table {
  min-width: 1080px;
}

.result-period-notice {
  margin: var(--idmp-space-3) var(--idmp-space-4);
}

@media (max-width: 1280px) {
  .scene-summary__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .scene-summary__grid > div:nth-child(3) {
    border-right: 0;
  }

  .scene-summary__grid > div:nth-child(-n + 3) {
    border-bottom: 1px solid var(--idmp-border-soft);
  }
}
</style>
