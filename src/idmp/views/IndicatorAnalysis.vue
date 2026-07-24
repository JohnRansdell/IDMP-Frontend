<template>
  <div class="idmp-page indicator-analysis">
    <PageHeader title="指标分析 / 手术患者并发症发生率">
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="Connection" @click="showSceneCompare">场景对比</el-button>
          <el-button :icon="Download" @click="showUnavailable">导出PDF</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="summary-grid" aria-label="指标核心数据">
      <article
        v-for="item in analysisSummary"
        :key="item.label"
        class="surface-card summary-card"
        :class="{ 'summary-card--danger': item.tone === 'danger' }"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="surface-card scene-comparison" aria-label="不同场景计算值对比">
      <div class="scene-comparison__label">
        <span>不同场景对比</span>
        <small>同一指标在不同场景下的计算口径存在差异</small>
      </div>
      <div class="scene-tags">
        <button
          v-for="scene in sceneComparisons"
          :key="scene.name"
          type="button"
          class="scene-tag"
          :class="{ 'is-current': scene.current }"
          @click="showSceneValue(scene)"
        >
          <span>{{ scene.name }}</span>
          <strong>{{ scene.value }}</strong>
          <em v-if="scene.difference">{{ scene.difference }}</em>
          <em v-else>当前场景</em>
        </button>
      </div>
    </section>

    <section class="surface-card analysis-panel">
      <el-tabs v-model="activeTab" class="analysis-tabs">
        <el-tab-pane label="趋势分析" name="trend">
          <div class="trend-toolbar">
            <div>
              <h2>指标变化趋势</h2>
              <p>展示本院实际值与同级医院均值的周期变化</p>
            </div>
            <div class="period-control">
              <span class="period-range">{{ currentTrend.range }}</span>
              <el-radio-group v-model="period" size="small" aria-label="分析周期">
                <el-radio-button
                  v-for="item in periodOptions"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <IdmpChart :option="trendOption" height="338px" />
        </el-tab-pane>

        <el-tab-pane label="科室排名" name="rank">
          <div class="table-heading">
            <div>
              <h2>科室指标排名</h2>
              <p>按手术患者并发症发生率由高到低排序</p>
            </div>
            <span>统计周期：2024 年度</span>
          </div>
          <div class="table-scroll">
            <el-table
              :data="analysisRankRows"
              table-layout="fixed"
              class="analysis-table rank-table"
            >
              <el-table-column label="排名" width="90" align="center">
                <template #default="{ row }">
                  <span class="rank-number" :class="{ 'is-top': row.rank <= 3 }">
                    {{ row.rank }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="department" label="科室" min-width="190" />
              <el-table-column label="指标值" width="135">
                <template #default="{ row }">
                  <strong :class="{ 'text-danger': row.status === '超标' }">
                    {{ row.rate }}
                  </strong>
                </template>
              </el-table-column>
              <el-table-column prop="numerator" label="分子（例）" width="130" />
              <el-table-column prop="denominator" label="分母（人）" width="130" />
              <el-table-column label="较上期" width="120">
                <template #default="{ row }">
                  <span :class="changeClass(row.change)">{{ row.change }}</span>
                </template>
              </el-table-column>
              <el-table-column label="达标状态" width="120">
                <template #default="{ row }">
                  <span class="status-pill" :class="rankStatusClass(row.status)">
                    {{ row.status }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="112" fixed="right">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="action-link"
                    @click="showTableAction(`查看${row.department}明细`)"
                  >
                    查看明细
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="下钻明细" name="drill">
          <div class="table-heading">
            <div>
              <h2>并发症病例下钻明细</h2>
              <p>患者标识已按演示数据脱敏处理</p>
            </div>
            <span>共 {{ analysisDrillRows.length }} 条演示记录</span>
          </div>
          <div class="table-scroll">
            <el-table
              :data="analysisDrillRows"
              table-layout="fixed"
              class="analysis-table drill-table"
            >
              <el-table-column prop="patientId" label="患者标识" width="130" />
              <el-table-column prop="admissionNo" label="住院号" width="140" />
              <el-table-column prop="admissionDate" label="入院日期" width="130" />
              <el-table-column prop="surgeryDate" label="手术日期" width="130" />
              <el-table-column label="手术级别" width="110">
                <template #default="{ row }">
                  <span class="status-pill is-info">{{ row.level }}</span>
                </template>
              </el-table-column>
              <el-table-column
                prop="complication"
                label="并发症类型"
                min-width="180"
                show-overflow-tooltip
              />
              <el-table-column prop="occurredAt" label="发生日期" width="130" />
              <el-table-column label="操作" width="108" fixed="right">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="action-link"
                    @click="showTableAction(`查看病例 ${row.admissionNo}`)"
                  >
                    查看
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, Download } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import {
  analysisDrillRows,
  analysisRankRows,
  analysisSummary,
  analysisTrendByPeriod
} from '@/idmp/data/demo'

const activeTab = ref('trend')
const period = ref('月度')
const periodOptions = ['月度', '季度', '年度']

const sceneComparisons = [
  { name: '绩效考核', value: '2.1%', difference: '当前场景', current: true },
  { name: '医院评审', value: '2.5%', difference: '较当前 +0.4%' },
  { name: '专业质控', value: '2.3%', difference: '较当前 +0.2%' }
]

const currentTrend = computed(() => analysisTrendByPeriod[period.value])

const trendOption = computed(() => ({
  animationDuration: 450,
  color: ['#1890ff', '#91d5ff'],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) => `${value}%`
  },
  legend: {
    top: 2,
    right: 8,
    itemWidth: 18,
    itemHeight: 8,
    textStyle: { color: '#595959', fontSize: 12 },
    data: ['本院实际值', '同级医院均值']
  },
  grid: { top: 44, left: 50, right: 26, bottom: 40 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: currentTrend.value.labels,
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisTick: { show: false },
    axisLabel: { color: '#8c8c8c', margin: 12 }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 4,
    interval: 1,
    name: '单位：%',
    nameTextStyle: { color: '#8c8c8c', padding: [0, 0, 4, 0] },
    axisLabel: { color: '#8c8c8c', formatter: '{value}%' },
    splitLine: { lineStyle: { color: '#eef0f3', type: 'dashed' } }
  },
  series: [
    {
      name: '本院实际值',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3 },
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24, 144, 255, 0.22)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.02)' }
          ]
        }
      },
      data: currentTrend.value.actual,
      markLine: {
        silent: true,
        symbol: 'none',
        label: {
          formatter: '目标值 3%',
          color: '#f5222d',
          position: 'insideEndTop'
        },
        lineStyle: { color: '#ff7875', type: 'dashed', width: 1 },
        data: [{ yAxis: 3 }]
      }
    },
    {
      name: '同级医院均值',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2, type: 'dashed' },
      data: currentTrend.value.peer
    }
  ]
}))

const rankStatusClass = (status) => {
  if (status === '超标') return 'is-danger'
  if (status === '预警') return 'is-warning'
  return ''
}

const changeClass = (change) => {
  if (change.startsWith('↑')) return 'text-danger'
  if (change.startsWith('↓')) return 'text-success'
  return 'text-muted'
}

const showUnavailable = () => {
  ElMessage.info('演示版暂不可用')
}

const showSceneCompare = () => {
  ElMessage.info('已展示当前指标的场景差异对比')
}

const showSceneValue = (scene) => {
  ElMessage.info(`${scene.name}场景计算值为 ${scene.value}`)
}

const showTableAction = (message) => {
  ElMessage.success(`${message}操作已触发`)
}
</script>

<style scoped lang="scss">
.indicator-analysis {
  min-width: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.summary-card {
  position: relative;
  min-height: 92px;
  overflow: hidden;
  padding: 17px 18px 15px;

  &::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: #e6f7ff;
    content: "";
  }

  span {
    display: block;
    margin-bottom: 8px;
    color: #8c8c8c;
    font-size: 13px;
    line-height: 18px;
  }

  strong {
    color: #1f2329;
    font-size: 25px;
    font-weight: 650;
    line-height: 31px;
  }
}

.summary-card--danger {
  &::before {
    background: #ff7875;
  }

  strong {
    color: #f5222d;
  }
}

.scene-comparison {
  display: flex;
  min-height: 80px;
  align-items: center;
  gap: 22px;
  margin-bottom: 16px;
  padding: 13px 16px;
}

.scene-comparison__label {
  display: flex;
  flex: 0 0 178px;
  flex-direction: column;
  gap: 3px;

  span {
    color: #262626;
    font-weight: 600;
    line-height: 22px;
  }

  small {
    color: #a0a3a8;
    font-size: 12px;
    line-height: 18px;
  }
}

.scene-tags {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
}

.scene-tag {
  display: grid;
  min-width: 0;
  flex: 1 1 0;
  grid-template-columns: minmax(88px, 1fr) auto auto;
  align-items: center;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid #e5e8ef;
  border-radius: 6px;
  background: #fafafa;
  color: #595959;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    border-color: #91d5ff;
    background: #f7fbff;
  }

  &.is-current {
    border-color: #91d5ff;
    background: #e6f7ff;
  }

  span {
    overflow: hidden;
    color: #3f4146;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    margin-left: 10px;
    color: #1890ff;
    font-size: 18px;
    line-height: 24px;
  }

  em {
    margin-left: 10px;
    color: #8c8c8c;
    font-size: 12px;
    font-style: normal;
    white-space: nowrap;
  }
}

.analysis-panel {
  min-width: 0;
  padding: 0 18px 16px;
  overflow: hidden;
}

.analysis-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background: #e5e8ef;
  }

  :deep(.el-tabs__item) {
    height: 47px;
    padding: 0 22px;
    color: #595959;
  }

  :deep(.el-tabs__item.is-active) {
    color: #1890ff;
    font-weight: 600;
  }

  :deep(.el-tabs__content) {
    padding-top: 15px;
  }
}

.trend-toolbar,
.table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 8px;

  h2 {
    margin: 0 0 3px;
    color: #262626;
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }
}

.period-control {
  display: flex;
  align-items: center;
  gap: 14px;
}

.period-range,
.table-heading > span {
  color: #8c8c8c;
  font-size: 12px;
  white-space: nowrap;
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.analysis-table {
  min-width: 1020px;

  :deep(th.el-table__cell) {
    height: 44px;
    padding: 0;
    color: #262626;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 48px;
    padding: 0;
    color: #3f4146;
  }
}

.rank-table {
  min-width: 1060px;
}

.drill-table {
  min-width: 1080px;
}

.rank-number {
  display: inline-grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: 4px;
  background: #f0f2f5;
  color: #8c8c8c;
  font-size: 12px;

  &.is-top {
    background: #e6f7ff;
    color: #1890ff;
    font-weight: 600;
  }
}

.text-danger {
  color: #f5222d;
}

.text-success {
  color: #52c41a;
}

.text-muted {
  color: #8c8c8c;
}

@media (max-width: 1450px) {
  .summary-grid {
    gap: 10px;
  }

  .summary-card {
    padding-right: 14px;
    padding-left: 14px;
  }

  .scene-comparison {
    gap: 14px;
  }

  .scene-comparison__label {
    flex-basis: 158px;
  }

  .scene-tag {
    grid-template-columns: minmax(76px, 1fr) auto;

    em {
      display: none;
    }
  }
}
</style>
