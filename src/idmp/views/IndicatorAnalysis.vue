<template>
  <div class="idmp-page indicator-analysis">
    <PageHeader
      :title="`指标分析 / ${currentProfile.name}`"
      eyebrow="总览与分析"
      :description="analysisHeaderDescription"
      :status-label="analysisSourceLabel"
      status-tone="info"
    >
      <template #meta>
        <span>指标版本 <strong class="mono-data">{{ analysisMetadata.version }}</strong></span>
        <span>结果批次 <strong class="mono-data">{{ analysisMetadata.batch }}</strong></span>
        <span>数据水位 <strong>{{ analysisMetadata.watermark }}</strong></span>
        <span>更新时间 <strong class="mono-data">{{ analysisUpdatedAt }}</strong></span>
      </template>
      <template #actions>
        <div class="page-toolbar">
          <el-select
            v-model="selectedIndicatorCode"
            filterable
            class="header-indicator-select"
            placeholder="请选择指标"
            aria-label="选择要查看的分析指标"
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
          <el-button :icon="Connection" @click="scrollToSceneComparison">场景对比</el-button>
          <el-button :icon="Download" @click="showUnavailable('PDF 导出')">导出PDF</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="metric-overview" aria-label="指标核心数据">
      <article class="surface-card primary-metric">
        <div>
          <span>当前指标值</span>
          <StatusBadge status="ACTIVE" label="当前展示结果" />
        </div>
        <strong>{{ primaryMetric.value }}</strong>
        <p>{{ currentProfile.targetLabel }} · {{ analysisSourceLabel }}</p>
      </article>
      <article
        v-for="item in factorMetrics"
        :key="item.label"
        class="surface-card factor-metric"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.label === '分子' ? '计入事件数' : '统计对象总量' }}</small>
      </article>
      <div class="surface-card supporting-metrics">
        <article v-for="item in secondaryMetrics" :key="item.label">
          <span>{{ item.label }}</span>
          <strong :class="metricToneClass(item.tone)">{{ item.value }}</strong>
        </article>
      </div>
    </section>

    <section ref="sceneComparisonRef" class="surface-card scene-comparison" aria-label="不同场景计算值对比">
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
          :aria-pressed="scene.current ? 'true' : 'false'"
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
        <StatusBadge
          :status="mortalityChainLoading ? 'RUNNING' : mortalityChainBatchStatus"
          :label="mortalityChainLoading ? '同步中' : mortalityChainStatusText"
        />
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
          <IdmpChart
            :option="trendOption"
            height="338px"
            :updated-at="analysisUpdatedAt"
            :aria-label="`${currentProfile.name}趋势图；本院实际值与同级医院均值对比`"
            table-label="查看趋势数据表"
          >
            <template #table>
              <div class="chart-table-scroll">
                <table class="chart-data-table">
                  <thead>
                    <tr>
                      <th scope="col">周期</th>
                      <th scope="col">本院实际值</th>
                      <th scope="col">同级医院均值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in trendTableRows" :key="row.label">
                      <th scope="row">{{ row.label }}</th>
                      <td>{{ row.actual }}{{ currentProfile.unit }}</td>
                      <td>{{ row.peer }}{{ currentProfile.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </IdmpChart>
        </el-tab-pane>

        <el-tab-pane label="科室排名" name="rank">
          <div class="table-heading">
            <div>
              <h2>科室指标排名</h2>
              <p>本地 profile 演示排名，按 {{ currentProfile.name }} 由高到低排列；尚未接入服务端分页。</p>
            </div>
            <StatusBadge status="DRAFT" label="演示数据 · 2024 年度" tone="neutral" />
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
                  <StatusBadge :label="row.status" :tone="rankStatusTone(row.status)" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="112" fixed="right">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="action-link"
                    @click="openDepartmentDrill(row)"
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
              <p>当前 profile 内含脱敏演示样例，但患者级权限、数据范围、访问目的、审计和服务端分页均未接入。</p>
            </div>
            <StatusBadge status="DISABLED" label="患者级访问未授权" tone="neutral" />
          </div>
          <StatePanel
            type="permission"
            title="患者级下钻尚未开放"
            :description="drillPermissionDescription"
          />
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
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
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
const sceneComparisonRef = ref()
const selectedDrillDepartment = ref('')

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
const primaryMetric = computed(() => currentProfile.value.summary?.[0] || { label: '当前值', value: '-' })
const factorMetrics = computed(() => currentProfile.value.summary?.slice(4, 6) || [])
const secondaryMetrics = computed(() => currentProfile.value.summary?.slice(1, 4) || [])
const trendTableRows = computed(() =>
  currentTrend.value.labels.map((label, index) => ({
    label,
    actual: currentTrend.value.actual[index] ?? '-',
    peer: currentTrend.value.peer[index] ?? '-'
  }))
)

const showMortalityChainPanel = computed(() => indicatorCode.value === 'MORTALITY_INPATIENT')
const hasBackendMortalityData = computed(() => Boolean(
  mortalityChain.value?.indicatorResult ||
  mortalityChain.value?.deathFactor ||
  mortalityChain.value?.dischargeFactor ||
  mortalityChain.value?.calcBatch
))
const analysisSourceLabel = computed(() =>
  hasBackendMortalityData.value ? '只读接口摘要 + 演示趋势' : '本地演示数据'
)
const analysisHeaderDescription = computed(() =>
  hasBackendMortalityData.value
    ? '住院死亡率摘要包含现有只读链路结果；趋势、场景、科室排名仍来自本地 profile 演示数据。'
    : '摘要、趋势、场景和科室排名均来自本地 profile 演示数据；患者级下钻未接入权限、审计与分页。'
)
const analysisMetadata = computed(() => {
  const chain = mortalityChain.value
  const config = chain?.config || {}
  return {
    version: hasBackendMortalityData.value ? String(config.indicatorVersionId || '后端未返回') : '演示配置（无版本 ID）',
    batch: hasBackendMortalityData.value ? String(config.indicatorBatchId || '后端未返回') : '未接入',
    watermark: resolveChainWatermark(chain),
  }
})
const analysisUpdatedAt = computed(() => {
  const chain = mortalityChain.value
  return firstPresent(
    chain?.indicatorResult?.updatedAt,
    chain?.indicatorResult?.finishedAt,
    chain?.calcBatch?.finishedAt,
    chain?.asyncTask?.finishedAt,
    hasBackendMortalityData.value ? '后端未返回更新时间' : '2024-12-31（演示快照）'
  )
})
const mortalityChainBatchStatus = computed(() =>
  mortalityChain.value?.indicatorResult?.batchStatus ||
  mortalityChain.value?.calcBatch?.batchStatus ||
  (hasBackendMortalityData.value ? 'READY' : 'DRAFT')
)
const drillPermissionDescription = computed(() => {
  const scope = selectedDrillDepartment.value ? `已选择“${selectedDrillDepartment.value}”，但` : ''
  return `${scope}后端尚未完成患者级权限、数据范围、访问目的、脱敏审计与服务端分页契约；因此不展示本地样例为真实明细。`
})

const trendOption = computed(() => ({
  animationDuration: 450,
  color: [IDMP_CHART_COLORS[0], IDMP_CHART_COLORS[4]],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) => `${value}${currentProfile.value.unit || ''}`
  },
  legend: {
    top: 2,
    right: 8,
    itemWidth: 18,
    itemHeight: 8,
    textStyle: { fontSize: 12 },
    data: ['本院实际值', '同级医院均值']
  },
  grid: { top: 44, left: 50, right: 26, bottom: 40 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: currentTrend.value.labels,
    axisTick: { show: false },
    axisLabel: { margin: 12 }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: currentProfile.value.yAxisMax,
    name: currentProfile.value.unit ? `单位：${currentProfile.value.unit}` : '指标值',
    nameTextStyle: { padding: [0, 0, 4, 0] },
    axisLabel: { formatter: `{value}${currentProfile.value.unit || ''}` },
    splitLine: { lineStyle: { type: 'dashed' } }
  },
  series: [
    {
      name: '本院实际值',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3 },
      itemStyle: { borderWidth: 2 },
      data: currentTrend.value.actual,
      markLine: {
        silent: true,
        symbol: 'none',
        label: {
          formatter: currentProfile.value.targetLabel,
          color: '#b4232c',
          position: 'insideEndTop'
        },
        lineStyle: { color: '#b4232c', type: 'dashed', width: 1 },
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
  if (!hasBackendMortalityData.value) return '接口无可用结果 / 演示摘要'
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

const rankStatusTone = (status) => {
  if (status === '超标') return 'danger'
  if (status === '预警') return 'warning'
  return 'success'
}

const changeClass = (change) => {
  if (change.startsWith('↑')) return 'text-danger'
  if (change.startsWith('↓')) return 'text-success'
  return 'text-muted'
}

const metricToneClass = (tone) => {
  if (tone === 'danger') return 'text-danger'
  if (tone === 'success') return 'text-success'
  return ''
}

const showUnavailable = (capability) => {
  ElMessage.info(`${capability}尚未接入真实接口。`)
}

const scrollToSceneComparison = () => {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  sceneComparisonRef.value?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'center'
  })
}

const showSceneValue = (scene) => {
  ElMessage.info(`${scene.name}为本地演示场景值：${scene.value}，尚未接入场景结果接口。`)
}

const openDepartmentDrill = (row) => {
  selectedDrillDepartment.value = row.department
  activeTab.value = 'drill'
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

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '-'
}

function resolveChainWatermark(chain) {
  if (!hasBackendMortalityData.value) return '2024-12-31（演示快照）'
  return firstPresent(
    chain?.indicatorResult?.dataWatermark,
    chain?.indicatorResult?.watermark,
    chain?.calcBatch?.dataWatermark,
    chain?.calcBatch?.watermark,
    '后端未返回数据水位'
  )
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
    color: var(--idmp-text-helper);
    font-size: 12px;
  }
}

.metric-overview {
  display: grid;
  grid-template-columns: minmax(280px, 1.7fr) repeat(2, minmax(180px, 1fr));
  gap: var(--idmp-space-3);
  margin-bottom: var(--idmp-space-4);
}

.primary-metric {
  grid-row: span 2;
  min-height: 190px;
  padding: var(--idmp-space-5);
  border-left: 4px solid var(--idmp-interactive);

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--idmp-space-3);
  }

  span {
    color: var(--idmp-text-secondary);
    font-size: 14px;
    line-height: 18px;
  }

  > strong {
    display: block;
    margin: var(--idmp-space-5) 0 var(--idmp-space-2);
    color: var(--idmp-text-primary);
    font-size: 42px;
    font-weight: 650;
    line-height: 48px;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.factor-metric {
  min-height: 112px;
  padding: var(--idmp-space-4);

  span,
  small {
    display: block;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }

  strong {
    display: block;
    margin: var(--idmp-space-2) 0 var(--idmp-space-1);
    color: var(--idmp-text-primary);
    font-size: 22px;
    font-weight: 650;
    line-height: 28px;
    font-variant-numeric: tabular-nums;
  }
}

.supporting-metrics {
  display: grid;
  grid-column: 2 / 4;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-height: 66px;
  padding: 0;

  article {
    min-width: 0;
    padding: var(--idmp-space-3) var(--idmp-space-4);

    & + article {
      border-left: 1px solid var(--idmp-border-subtle);
    }
  }

  span {
    display: block;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }

  strong {
    display: block;
    margin-top: var(--idmp-space-1);
    color: var(--idmp-text-primary);
    font-size: 16px;
    line-height: 22px;
    font-variant-numeric: tabular-nums;
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
    color: var(--idmp-text-primary);
    font-weight: 600;
    line-height: 22px;
  }

  small {
    color: var(--idmp-text-disabled);
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
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-secondary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    border-color: var(--idmp-interactive);
    background: var(--idmp-layer-hover);
  }

  &.is-current {
    border-color: var(--idmp-interactive);
    background: var(--idmp-interactive-subtle);
  }

  span {
    overflow: hidden;
    color: var(--idmp-text-secondary);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    margin-left: 10px;
    color: var(--idmp-interactive);
    font-size: 18px;
    line-height: 24px;
  }

  em {
    margin-left: 10px;
    color: var(--idmp-text-helper);
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
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.chain-equation {
  display: flex;
  min-height: 46px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-interactive-subtle);

  span,
  em {
    color: var(--idmp-text-helper);
    font-size: 12px;
    font-style: normal;
    line-height: 20px;
  }

  strong {
    color: var(--idmp-interactive);
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
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-01);

  span {
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }

  strong {
    overflow: hidden;
    color: var(--idmp-text-primary);
    font-size: 16px;
    font-weight: 650;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--idmp-text-disabled);
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
    background: var(--idmp-border-subtle);
  }

  :deep(.el-tabs__item) {
    height: 47px;
    padding: 0 22px;
    color: var(--idmp-text-secondary);
  }

  :deep(.el-tabs__item.is-active) {
    color: var(--idmp-interactive);
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
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
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
  color: var(--idmp-text-helper);
  font-size: 12px;
  white-space: nowrap;
}

.chart-table-scroll {
  max-width: min(720px, 70vw);
  max-height: 280px;
  overflow: auto;
}

.chart-data-table {
  width: 100%;
  min-width: 480px;
  border-collapse: collapse;
  color: var(--idmp-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: var(--idmp-space-2) var(--idmp-space-3);
    border-bottom: 1px solid var(--idmp-border-subtle);
    text-align: right;
  }

  th:first-child {
    text-align: left;
  }

  thead th {
    background: var(--idmp-layer-02);
    color: var(--idmp-text-primary);
    font-weight: 600;
  }

  tbody th {
    color: var(--idmp-text-secondary);
    font-weight: 500;
  }
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
    color: var(--idmp-text-primary);
    font-weight: 600;
    background: var(--idmp-layer-02);
  }

  :deep(td.el-table__cell) {
    height: 48px;
    padding: 0;
    color: var(--idmp-text-secondary);
  }
}

.rank-table {
  min-width: 1060px;
}

.rank-number {
  display: inline-grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-helper);
  font-size: 12px;

  &.is-top {
    background: var(--idmp-interactive-subtle);
    color: var(--idmp-interactive);
    font-weight: 600;
  }
}

.text-danger {
  color: var(--idmp-support-danger);
}

.text-success {
  color: var(--idmp-support-success);
}

.text-muted {
  color: var(--idmp-text-helper);
}

@media (max-width: 1450px) {
  .header-indicator-select {
    width: 260px;
  }

  .metric-overview {
    grid-template-columns: minmax(250px, 1.45fr) repeat(2, minmax(150px, 1fr));
    gap: var(--idmp-space-2);
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

@media (max-width: 1180px) {
  .metric-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .primary-metric {
    grid-column: 1 / 3;
    grid-row: auto;
    min-height: 150px;
  }

  .supporting-metrics {
    grid-column: 1 / 3;
  }
}
</style>
