<template>
  <div class="idmp-page scene-management">
    <PageHeader title="场景管理 / 三级公立医院绩效考核">
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="EditPen" @click="showLightResult('编辑场景')">编辑</el-button>
          <el-button :icon="CopyDocument" @click="confirmSceneCopy">复制场景</el-button>
          <el-button :icon="Download" @click="showUnavailable">导出配置</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="surface-card scene-summary" aria-label="场景摘要">
      <div v-for="item in summaryItems" :key="item.label" class="summary-item">
        <span class="summary-item__label">{{ item.label }}</span>
        <strong v-if="item.kind !== 'status'" :class="{ 'summary-item__link': item.kind === 'link' }">
          {{ item.value }}
        </strong>
        <span v-else class="status-pill">{{ item.value }}</span>
      </div>
    </section>

    <el-tabs v-model="activeTab" class="scene-tabs">
      <el-tab-pane label="关联指标" name="indicators">
        <section class="surface-card tab-surface">
          <div class="indicator-toolbar">
            <div class="indicator-toolbar__actions">
              <el-button type="primary" plain :icon="Plus" @click="showLightResult('添加指标')">
                添加指标
              </el-button>
              <el-button :icon="CollectionTag" @click="showLightResult('批量添加指标')">
                批量添加
              </el-button>
            </div>
            <el-input
              v-model.trim="indicatorKeyword"
              clearable
              :prefix-icon="Search"
              placeholder="搜索指标..."
              aria-label="搜索指标"
            />
          </div>

          <div class="table-scroll">
            <el-table
              :data="filteredSceneIndicators"
              :row-class-name="sceneRowClassName"
              table-layout="fixed"
              empty-text="暂无符合条件的关联指标"
              class="scene-table"
            >
              <el-table-column prop="code" label="指标编码" width="126">
                <template #default="{ row }">
                  <span class="mono-code">{{ row.code }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="指标名称" min-width="260" show-overflow-tooltip />
              <el-table-column prop="version" label="版本" width="100" />
              <el-table-column label="排除条件" width="126">
                <template #default="{ row }">
                  <span :class="row.exclusion === '默认' ? 'text-success' : 'text-warning'">
                    {{ row.exclusion }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="参数覆盖" width="126">
                <template #default="{ row }">
                  <span :class="row.override === '无' ? 'text-success' : 'text-warning'">
                    {{ row.override }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="report" label="上报要求" width="124" />
              <el-table-column label="最近计算值" width="142">
                <template #default="{ row }">
                  <strong :class="{ 'text-danger': row.tone === 'warning' }">{{ row.latest }}</strong>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="190" fixed="right">
                <template #default="{ row }">
                  <button class="action-link" type="button" @click="confirmOverride(row)">
                    配置覆盖
                  </button>
                  <button class="action-link" type="button" @click="showLightResult('查看计算结果')">
                    查看结果
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="通用排除条件" name="exclusions">
        <section class="surface-card tab-surface">
          <div class="subsection-head">
            <div>
              <h2>场景通用排除条件</h2>
              <p>以下条件会在场景内所有指标计算前统一应用，指标级规则可继续叠加。</p>
            </div>
            <el-button type="primary" plain :icon="Plus" @click="showLightResult('新增通用排除条件')">
              新增条件
            </el-button>
          </div>
          <div class="table-scroll">
            <el-table :data="exclusionRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="name" label="条件名称" min-width="210" />
              <el-table-column prop="scope" label="适用范围" min-width="190" />
              <el-table-column prop="logic" label="业务规则" min-width="300" show-overflow-tooltip />
              <el-table-column prop="updated" label="最近更新" width="150" />
              <el-table-column label="状态" width="100">
                <template #default>
                  <span class="status-pill">已启用</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="126" fixed="right">
                <template #default>
                  <button class="action-link" type="button" @click="showLightResult('编辑条件')">编辑</button>
                  <button class="action-link" type="button" @click="showLightResult('查看条件')">查看</button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="参数覆盖" name="overrides">
        <section class="surface-card tab-surface">
          <div class="subsection-head">
            <div>
              <h2>场景参数覆盖</h2>
              <p>仅展示相对于指标默认配置发生变化的参数。</p>
            </div>
            <el-button :icon="Setting" @click="showLightResult('参数覆盖设置')">覆盖设置</el-button>
          </div>
          <div class="table-scroll">
            <el-table :data="overrideRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="code" label="指标编码" width="126" />
              <el-table-column prop="name" label="指标名称" min-width="230" />
              <el-table-column prop="parameter" label="参数项" min-width="180" />
              <el-table-column prop="defaultValue" label="默认值" width="130" />
              <el-table-column label="场景覆盖值" width="150">
                <template #default="{ row }">
                  <strong class="text-warning">{{ row.overrideValue }}</strong>
                </template>
              </el-table-column>
              <el-table-column prop="effective" label="生效周期" width="150" />
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <button class="action-link" type="button" @click="confirmOverride(row)">配置覆盖</button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="计算结果" name="results">
        <section class="surface-card tab-surface">
          <div class="result-toolbar">
            <div>
              <span class="result-toolbar__label">计算周期</span>
              <el-select v-model="resultPeriod" aria-label="计算周期">
                <el-option label="2024 年度" value="2024 年度" />
                <el-option label="2024 年第四季度" value="2024 年第四季度" />
                <el-option label="2024 年 12 月" value="2024 年 12 月" />
              </el-select>
            </div>
            <el-button type="primary" :icon="RefreshRight" @click="showLightResult('重新计算')">
              重新计算
            </el-button>
          </div>
          <div class="table-scroll">
            <el-table :data="calculationRows" table-layout="fixed" class="scene-table">
              <el-table-column prop="code" label="指标编码" width="126" />
              <el-table-column prop="name" label="指标名称" min-width="260" />
              <el-table-column label="计算周期" width="160">
                <template #default>{{ resultPeriod }}</template>
              </el-table-column>
              <el-table-column prop="result" label="计算结果" width="140">
                <template #default="{ row }">
                  <strong :class="{ 'text-danger': row.tone === 'warning' }">{{ row.result }}</strong>
                </template>
              </el-table-column>
              <el-table-column prop="target" label="目标要求" width="130" />
              <el-table-column label="达标状态" width="120">
                <template #default="{ row }">
                  <span
                    class="status-pill"
                    :class="{ 'is-danger': row.tone === 'warning' }"
                  >
                    {{ row.tone === 'warning' ? '未达标' : '已达标' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="updated" label="计算时间" width="170" />
            </el-table>
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CollectionTag,
  CopyDocument,
  Download,
  EditPen,
  Plus,
  RefreshRight,
  Search,
  Setting
} from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { sceneIndicators } from '@/idmp/data/demo'

const activeTab = ref('indicators')
const indicatorKeyword = ref('')
const resultPeriod = ref('2024 年度')

const summaryItems = [
  { label: '场景编码', value: 'KH' },
  { label: '关联政策', value: '绩效考核2024版' },
  { label: '主管部门', value: '国家卫健委' },
  { label: '统计周期', value: '年度' },
  { label: '关联指标', value: '56 项', kind: 'link' },
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

const sceneRowClassName = ({ row }) => (row.tone === 'warning' ? 'warning-row' : '')

const showUnavailable = () => {
  ElMessage.info('演示版暂不可用')
}

const showLightResult = (action) => {
  ElMessage.success(`${action}操作已触发`)
}

const confirmSceneCopy = () => {
  ElMessageBox.confirm('确认复制当前场景配置吗？', '复制场景', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'info'
  })
    .then(() => ElMessage.success('场景配置已复制（演示）'))
    .catch(() => {})
}

const confirmOverride = (row) => {
  ElMessageBox.confirm(`确认查看并配置“${row.name}”的场景覆盖参数吗？`, '配置覆盖', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => ElMessage.success('配置覆盖操作已确认'))
    .catch(() => {})
}
</script>

<style scoped lang="scss">
.scene-management {
  min-width: 0;
}

.scene-summary {
  display: grid;
  grid-template-columns: repeat(6, minmax(120px, 1fr));
  gap: 24px;
  margin-bottom: 15px;
  padding: 19px 16px 17px;
}

.summary-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.summary-item__label {
  color: #8c8c8c;
  font-size: 13px;
  line-height: 20px;
}

.summary-item strong {
  overflow: hidden;
  color: #20232a;
  font-size: 14px;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-item__link {
  color: #1890ff !important;
}

.scene-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background: #dfe3e8;
  }

  :deep(.el-tabs__item) {
    height: 43px;
    padding: 0 21px;
    color: #4e535a;
    font-size: 14px;
  }

  :deep(.el-tabs__item.is-active) {
    color: #1890ff;
    font-weight: 600;
  }

  :deep(.el-tabs__active-bar) {
    height: 2px;
    background: #1890ff;
  }

  :deep(.el-tabs__content) {
    padding-top: 16px;
  }
}

.tab-surface {
  min-width: 0;
  padding: 16px;
}

.indicator-toolbar,
.subsection-head,
.result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 13px;
}

.indicator-toolbar__actions {
  display: flex;
  gap: 8px;
}

.indicator-toolbar :deep(.el-input) {
  width: 218px;
}

.subsection-head h2 {
  margin: 0 0 4px;
  color: #20232a;
  font-size: 15px;
  line-height: 22px;
}

.subsection-head p {
  margin: 0;
  color: #8c8c8c;
  font-size: 13px;
  line-height: 20px;
}

.result-toolbar__label {
  margin-right: 10px;
  color: #60656d;
  font-size: 13px;
}

.result-toolbar :deep(.el-select) {
  width: 190px;
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.scene-table {
  min-width: 1050px;

  :deep(th.el-table__cell) {
    height: 45px;
    padding: 0;
    color: #1f2329;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 46px;
    padding: 0;
    color: #31343a;
  }

  :deep(.warning-row td.el-table__cell) {
    background: #fffbe6 !important;
  }
}

.mono-code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  color: #4f5d6b;
}

.text-success {
  color: #52c41a;
}

.text-warning {
  color: #d9980d;
}

.text-danger {
  color: #f5222d;
}

.action-link {
  margin-right: 0;
  padding: 0;
  color: #1890ff;
  font: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;

  & + & {
    margin-left: 14px;
  }
}

@media (max-width: 1450px) {
  .scene-summary {
    gap: 14px;
  }
}
</style>
