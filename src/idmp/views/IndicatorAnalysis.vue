<template>
  <div class="idmp-page indicator-analysis">
    <PageHeader :title="`指标分析 / ${currentProfile.name}`">
      <template #actions>
        <div class="page-toolbar">
          <el-select
            v-model="selectedIndicatorCode"
            filterable
            class="header-indicator-select"
            placeholder="请选择指标"
            :loading="indicatorOptionsLoading"
          >
            <el-option
              v-for="item in analysisIndicatorOptions"
              :key="item.optionKey || item.code"
              :label="item.name"
              :value="item.code"
              :disabled="item.disabled"
            >
              <div class="indicator-option">
                <span>{{ item.name }}</span>
                <small>{{ item.backendCode || item.code }} · {{ item.disabled ? '暂未配置分析页' : item.source }}</small>
              </div>
            </el-option>
          </el-select>
          <el-button type="primary" @click="switchIndicatorAnalysis">查看分析</el-button>
          <el-button :icon="Connection" @click="showSceneCompare">场景对比</el-button>
          <el-button :icon="Download" @click="showUnavailable">导出PDF</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="summary-grid" aria-label="指标核心数据">
      <article
        v-for="item in currentProfile.summary"
        :key="item.label"
        class="surface-card summary-card"
        :class="{ 'summary-card--danger': item.tone === 'danger', 'summary-card--success': item.tone === 'success' }"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="surface-card scene-comparison" aria-label="不同场景计算值对比">
      <div class="scene-comparison__label">
        <span>不同场景对比</span>
        <small>同一指标在不同场景下的计算口径可能存在差异</small>
      </div>
      <div class="scene-tags">
        <button
          v-for="scene in currentProfile.sceneComparisons"
          :key="scene.name"
          type="button"
          class="scene-tag"
          :class="{ 'is-current': scene.current }"
          @click="showSceneValue(scene)"
        >
          <span>{{ scene.name }}</span>
          <strong>{{ scene.value }}</strong>
          <em>{{ scene.difference || '当前场景' }}</em>
        </button>
      </div>
    </section>

    <section v-if="showMortalityChainPanel" class="surface-card chain-panel" aria-label="住院死亡率计算链路">
      <div class="chain-panel__header">
        <div>
          <h2>住院死亡率计算链路</h2>
          <p>展示第16章后端链路中的数据域、因子试算、公式结果、异步任务与编译状态</p>
        </div>
        <span class="chain-status" :class="{ 'is-loading': mortalityChainLoading }">
          {{ mortalityChainLoading ? '同步中' : mortalityChainStatusText }}
        </span>
      </div>

      <div class="chain-equation">
        <span>死亡患者记录数</span>
        <strong>{{ chainDeathValue }}</strong>
        <em>÷</em>
        <span>出院病案记录数</span>
        <strong>{{ chainDischargeValue }}</strong>
        <em>=</em>
        <span>住院死亡率</span>
        <strong>{{ chainDisplayValue }}</strong>
      </div>

      <div class="chain-grid">
        <article v-for="node in mortalityChainNodes" :key="node.label" class="chain-node">
          <span>{{ node.label }}</span>
          <strong>{{ node.value }}</strong>
          <small>{{ node.meta }}</small>
        </article>
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
              <p>按 {{ currentProfile.name }} 由高到低排序</p>
            </div>
            <span>统计周期：2024 年度</span>
          </div>
          <div class="table-scroll">
            <el-table
              :data="currentProfile.rankRows"
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
              <el-table-column prop="numerator" label="分子" width="130" />
              <el-table-column prop="denominator" label="分母" width="130" />
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
              <h2>{{ currentProfile.name }}下钻明细</h2>
              <p>明细记录已按演示数据脱敏处理，后续可切换为接口返回结果</p>
            </div>
            <span>共 {{ currentProfile.drillRows.length }} 条演示记录</span>
          </div>
          <div class="table-scroll">
            <el-table
              :data="currentProfile.drillRows"
              table-layout="fixed"
              class="analysis-table drill-table"
            >
              <el-table-column prop="subjectId" label="对象标识" width="130" />
              <el-table-column prop="recordNo" label="记录号" width="140" />
              <el-table-column prop="startDate" label="开始日期" width="130" />
              <el-table-column prop="eventDate" label="事件日期" width="130" />
              <el-table-column label="记录级别" width="110">
                <template #default="{ row }">
                  <span class="status-pill is-info">{{ row.level }}</span>
                </template>
              </el-table-column>
              <el-table-column
                prop="event"
                label="事件类型"
                min-width="180"
                show-overflow-tooltip
              />
              <el-table-column prop="occurredAt" label="发生日期" width="130" />
              <el-table-column label="操作" width="108" fixed="right">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="action-link"
                    @click="showTableAction(`查看记录 ${row.recordNo}`)"
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, Download } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { fetchIndicators } from '@/idmp/api/modules/indicators'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import {
  DEFAULT_ANALYSIS_INDICATOR,
  getAnalysisProfileOptions,
  getAnalysisProfile,
  periodOptions,
  updateMortalityProfileFromChain
} from '@/idmp/features/analysis/indicatorProfiles'

const route = useRoute()
const router = useRouter()
const activeTab = ref('trend')
const period = ref('月度')
const profileRefreshVersion = ref(0)
const mortalityChain = ref(null)
const mortalityChainLoading = ref(false)
const selectedIndicatorCode = ref(String(route.query.indicator || DEFAULT_ANALYSIS_INDICATOR))
const backendIndicators = ref([])
const indicatorOptionsLoading = ref(false)

const indicatorCode = computed(() => String(route.query.indicator || DEFAULT_ANALYSIS_INDICATOR))
const localAnalysisOptions = computed(() => getAnalysisProfileOptions())
const analysisIndicatorOptions = computed(() =>
  backendIndicators.value.length
    ? createBackendAnalysisOptions(backendIndicators.value, localAnalysisOptions.value)
    : localAnalysisOptions.value.map((item) => ({ ...item, source: '本地配置' }))
)
const currentProfile = computed(() => {
  profileRefreshVersion.value
  return getAnalysisProfile(indicatorCode.value)
})
const currentTrend = computed(() => currentProfile.value.trends[period.value] || currentProfile.value.trends.月度)

const showMortalityChainPanel = computed(() => indicatorCode.value === 'MORTALITY_INPATIENT')

const trendOption = computed(() => ({
  animationDuration: 450,
  color: ['#1890ff', '#91d5ff'],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) => `${value}${currentProfile.value.unit || ''}`
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
    max: currentProfile.value.yAxisMax,
    name: currentProfile.value.unit ? `单位：${currentProfile.value.unit}` : '指标值',
    nameTextStyle: { color: '#8c8c8c', padding: [0, 0, 4, 0] },
    axisLabel: { color: '#8c8c8c', formatter: `{value}${currentProfile.value.unit || ''}` },
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
          formatter: currentProfile.value.targetLabel,
          color: '#f5222d',
          position: 'insideEndTop'
        },
        lineStyle: { color: '#ff7875', type: 'dashed', width: 1 },
        data: [{ yAxis: currentProfile.value.markLineValue }]
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

const mortalityDeathRecord = computed(() => mortalityChain.value?.deathFactor?.results?.records?.[0])
const mortalityDischargeRecord = computed(() => mortalityChain.value?.dischargeFactor?.results?.records?.[0])
const mortalityIndicatorRecord = computed(() => mortalityChain.value?.indicatorResult?.results?.records?.[0])
const chainDeathValue = computed(() => formatCount(mortalityDeathRecord.value?.valueDecimal))
const chainDischargeValue = computed(() => formatCount(mortalityDischargeRecord.value?.valueDecimal))
const chainDisplayValue = computed(() => mortalityIndicatorRecord.value?.displayValue || currentProfile.value.summary?.[0]?.value || '-')
const chainRawValue = computed(() => formatDecimal(mortalityIndicatorRecord.value?.resultValue))
const mortalityChainStatusText = computed(() => {
  if (!mortalityChain.value) return '使用演示链路'
  const batchStatus = mortalityChain.value.indicatorResult?.batchStatus || mortalityChain.value.calcBatch?.batchStatus || '-'
  const qualityStatus = mortalityChain.value.indicatorResult?.qualityStatus || mortalityChain.value.calcBatch?.qualityStatus || '-'
  return `${batchStatus} / ${qualityStatus}`
})
const mortalityChainNodes = computed(() => {
  const chain = mortalityChain.value
  const config = chain?.config || {}
  return [
    {
      label: '死亡数据域',
      value: config.deathDomainCode || 'INPATIENT_DEATH_RECORD',
      meta: config.deathSourceTable || 'vmq_deathpatientdetail'
    },
    {
      label: '出院数据域',
      value: config.dischargeDomainCode || 'INPATIENT_DISCHARGE_RECORD',
      meta: config.dischargeSourceTable || 'vmq_basicinformationba'
    },
    {
      label: '分子因子',
      value: chainDeathValue.value,
      meta: `版本 ${config.deathFactorVersionId || '-'}`
    },
    {
      label: '分母因子',
      value: chainDischargeValue.value,
      meta: `版本 ${config.dischargeFactorVersionId || '-'}`
    },
    {
      label: '公式结果',
      value: chainDisplayValue.value,
      meta: `原始值 ${chainRawValue.value}`
    },
    {
      label: '异步任务',
      value: chain?.asyncTask?.status || '-',
      meta: `任务 ${config.indicatorBatchId || '-'}`
    },
    {
      label: '计算批次',
      value: chain?.calcBatch?.batchStatus || chain?.indicatorResult?.batchStatus || '-',
      meta: chain?.calcBatch?.qualityStatus || chain?.indicatorResult?.qualityStatus || '-'
    },
    {
      label: '编译产物',
      value: buildArtifactStatus(chain),
      meta: '死亡因子 / 出院因子 / 指标公式'
    }
  ]
})

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

function formatCount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '-'
}

function formatDecimal(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(8) : '-'
}

function buildArtifactStatus(chain) {
  return [
    chain?.deathFactorArtifact?.status,
    chain?.dischargeFactorArtifact?.status,
    chain?.indicatorFormulaArtifact?.status
  ].filter(Boolean).join(' / ') || '-'
}

function switchIndicatorAnalysis() {
  if (!selectedIndicatorCode.value) return
  if (selectedIndicatorCode.value === indicatorCode.value) {
    ElMessage.info('当前已是所选指标分析页')
    return
  }
  router.push({
    path: '/analysis',
    query: { indicator: selectedIndicatorCode.value }
  })
}

async function loadBackendAnalysisIndicators() {
  indicatorOptionsLoading.value = true
  try {
    const rows = await fetchIndicators()
    backendIndicators.value = Array.isArray(rows) ? rows : []
  } catch {
    backendIndicators.value = []
    ElMessage.warning('后端指标列表暂不可用，已使用本地分析配置')
  } finally {
    indicatorOptionsLoading.value = false
  }
}

function createBackendAnalysisOptions(indicators, profileOptions) {
  const fallbackOptions = profileOptions.map((item) => ({ ...item, source: '本地配置' }))
  const mappedOptions = indicators.map((item) => {
    const profile = matchAnalysisProfile(item, profileOptions)
    return {
      optionKey: `${item.id || item.indicatorId || item.code || item.name}`,
      code: profile?.code || `UNSUPPORTED:${item.code || item.id || item.name}`,
      name: item.name || profile?.name || item.code || '未命名指标',
      backendCode: item.code,
      source: '后端指标',
      disabled: !profile
    }
  })
  const enabledCodes = new Set(mappedOptions.filter((item) => !item.disabled).map((item) => item.code))
  const missingLocalOptions = fallbackOptions
    .filter((item) => !enabledCodes.has(item.code))
    .map((item) => ({ ...item, source: '本地配置' }))
  return [...mappedOptions, ...missingLocalOptions]
}

function matchAnalysisProfile(indicator, profileOptions) {
  const code = String(indicator?.code || '')
  const name = String(indicator?.name || '')
  const exact = profileOptions.find((item) => item.code === code)
  if (exact) return exact
  if (/MORTALITY|DEATH/i.test(code) || normalizeText(name).includes('住院死亡')) {
    return profileOptions.find((item) => item.code === 'MORTALITY_INPATIENT')
  }
  return profileOptions.find((item) => {
    const profileName = normalizeText(item.name)
    const indicatorName = normalizeText(name)
    return indicatorName && (profileName.includes(indicatorName) || indicatorName.includes(profileName))
  })
}

function normalizeText(value) {
  return String(value || '').replace(/\s/g, '').replace(/[（）()]/g, '')
}

async function refreshMortalityAnalysis() {
  if (indicatorCode.value !== 'MORTALITY_INPATIENT') return
  mortalityChainLoading.value = true
  try {
    const chain = await fetchMortalityReadonlyChain()
    mortalityChain.value = chain
    updateMortalityProfileFromChain(chain)
    profileRefreshVersion.value += 1
    mortalityChainLoading.value = false
  } catch {
    mortalityChain.value = null
    mortalityChainLoading.value = false
    ElMessage.warning('住院死亡率后端结果暂不可用，已使用演示数据')
  }
}

onMounted(() => {
  loadBackendAnalysisIndicators()
  refreshMortalityAnalysis()
})

watch(indicatorCode, () => {
  selectedIndicatorCode.value = indicatorCode.value
  refreshMortalityAnalysis()
})
</script>

<style scoped lang="scss">
.indicator-analysis {
  min-width: 0;
}

.page-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.header-indicator-select {
  width: 300px;
}

.indicator-option {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    color: #8c8c8c;
    font-size: 12px;
  }
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

.summary-card--success {
  &::before {
    background: #95de64;
  }

  strong {
    color: #389e0d;
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

.chain-panel {
  min-width: 0;
  margin-bottom: 16px;
  padding: 16px 18px;
}

.chain-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 12px;

  h2 {
    margin: 0 0 4px;
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

.chain-status {
  flex: 0 0 auto;
  padding: 4px 9px;
  border: 1px solid #b7eb8f;
  border-radius: 4px;
  background: #f6ffed;
  color: #389e0d;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;

  &.is-loading {
    border-color: #91d5ff;
    background: #e6f7ff;
    color: #1890ff;
  }
}

.chain-equation {
  display: flex;
  min-height: 46px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid #e6f4ff;
  border-radius: 6px;
  background: #f7fbff;

  span,
  em {
    color: #8c8c8c;
    font-size: 12px;
    font-style: normal;
    line-height: 20px;
  }

  strong {
    color: #1890ff;
    font-size: 18px;
    font-weight: 650;
    line-height: 24px;
  }
}

.chain-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.chain-node {
  display: flex;
  min-width: 0;
  min-height: 82px;
  flex-direction: column;
  justify-content: space-between;
  padding: 11px 12px;
  border: 1px solid #e5e8ef;
  border-radius: 6px;
  background: #fff;

  span {
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }

  strong {
    overflow: hidden;
    color: #262626;
    font-size: 16px;
    font-weight: 650;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: #a0a3a8;
    font-size: 12px;
    line-height: 18px;
    text-overflow: ellipsis;
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
  .header-indicator-select {
    width: 260px;
  }

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
