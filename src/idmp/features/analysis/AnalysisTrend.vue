<template>
  <div class="trend-toolbar">
    <div>
      <h2>指标变化趋势</h2>
      <p>{{ hasPeerTrend ? '展示本院实际值与同级医院均值的周期变化' : '展示本院实际值的周期变化；同级医院基准数据暂未接入' }}</p>
    </div>
    <div v-if="!staticMode" class="trend-controls">
      <div class="date-range-fields trend-period-picker" aria-label="趋势时间范围"><el-date-picker v-model="trendMonthRange" type="monthrange" unlink-panels format="YYYY-MM" value-format="YYYY-MM" range-separator="至" start-placeholder="开始月份" end-placeholder="结束月份" size="small" /></div>
      <el-tag v-if="isSourceDefaultTrendRange" size="small" type="info" effect="plain">源数据可用范围</el-tag>
      <el-button size="small" type="primary" @click="emit('apply')">应用</el-button>
      <el-button size="small" :disabled="!canClearRange" @click="emit('clear-range')">全部时间</el-button>
      <el-radio-group v-model="period" size="small" aria-label="趋势统计粒度" @change="emit('change-period')">
        <el-radio-button v-for="item in analysisPeriodOptions" :key="item" :value="item">{{ item }}</el-radio-button>
      </el-radio-group>
    </div>
  </div>
  <el-collapse v-if="grainFields.length" v-model="trendAdvancedExpanded" class="trend-advanced-filters">
    <el-collapse-item name="grain">
      <template #title>
        <span>高级筛选{{ hasAppliedGrain ? '（已应用）' : '' }}</span>
        <el-tooltip content="按一组业务维度查看趋势；请选择完整组合，或清空全部条件查看整体趋势。" placement="top">
          <span class="trend-advanced-help" tabindex="0" aria-label="高级筛选使用说明" @click.stop>说明</span>
        </el-tooltip>
      </template>
      <div class="trend-advanced-fields">
        <div v-for="field in grainFields" :key="field.code" class="trend-grain-field">
          <label :for="`trend-grain-${field.code}`" :title="field.code">{{ field.label }}</label>
          <el-select
            :id="`trend-grain-${field.code}`"
            :model-value="grain[field.code]"
            @update:model-value="value => updateGrain(field.code, value)"
            filterable remote clearable
            :remote-method="search => emit('search-grain', { code: field.code, search })"
            :loading="field.loading"
            placeholder="全部"
            size="small"
          >
            <el-option v-for="item in field.options" :key="item.value" :label="item.label" :value="item.value">
              <span>{{ item.label }}</span>
              <small v-if="item.label !== item.value" class="trend-grain-option-code">{{ item.value }}</small>
            </el-option>
          </el-select>
        </div>
        <div class="trend-advanced-actions">
          <el-button size="small" type="primary" @click="emit('apply')">应用筛选</el-button>
          <el-button size="small" @click="emit('clear-grain')">清空筛选</el-button>
        </div>
      </div>
    </el-collapse-item>
  </el-collapse>
  <div v-if="!trendLoading && !trendErrorMessage && !trendTableRows.length && hasRange" class="trend-empty-guidance">
    <span>所选时间段没有可展示的趋势点。可查看该指标全部已生成周期。</span>
    <el-button link type="primary" @click="emit('clear-range')">查看全部已有周期</el-button>
  </div>
  <IdmpChart
    :option="trendOption"
    :loading="trendLoading"
    :error="trendErrorMessage"
    :empty="!trendTableRows.length"
    height="338px"
    :updated-at="analysisUpdatedAt"
    :aria-label="hasPeerTrend ? `${indicatorName}趋势图；本院实际值与同级医院均值对比` : `${indicatorName}趋势图；本院实际值`"
    table-label="查看趋势数据表"
  >
    <template #actions><el-button size="small" @click="emit('retry')">重试</el-button></template>
    <template #table>
      <div class="chart-table-scroll">
        <table class="chart-data-table">
          <thead>
            <tr>
              <th scope="col">周期</th>
              <th scope="col">本院实际值</th>
              <th v-if="hasPeerTrend" scope="col">同级医院均值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in trendTableRows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td>{{ row.actualDisplay }}</td>
              <td v-if="hasPeerTrend">{{ row.peerDisplay }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </IdmpChart>
</template>

<script setup>
import { computed } from 'vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import { periodOptions as analysisPeriodOptions } from './indicatorProfiles.js'

const props = defineProps({
  model: { type: Object, required: true },
  indicatorName: { type: String, default: '' },
  staticMode: Boolean,
  trendLoading: Boolean,
  trendErrorMessage: { type: String, default: '' },
  analysisUpdatedAt: { type: String, default: '-' },
  grainFields: { type: Array, default: () => [] },
  hasAppliedGrain: Boolean,
  hasRange: Boolean,
  canClearRange: Boolean,
  isSourceDefaultTrendRange: Boolean
})
const emit = defineEmits(['apply', 'clear-range', 'change-period', 'clear-grain', 'search-grain', 'retry'])
const trendMonthRange = defineModel('months', { type: Array, required: true })
const period = defineModel('period', { type: String, required: true })
const grain = defineModel('grain', { type: Object, required: true })
const trendAdvancedExpanded = defineModel('expanded', { type: Array, required: true })
const hasPeerTrend = computed(() => props.model.hasPeer)
const trendTableRows = computed(() => props.model.rows)
const trendOption = computed(() => props.model.option)

function updateGrain(code, value) {
  grain.value = { ...grain.value, [code]: value }
}
</script>

<style scoped lang="scss">
.trend-empty-guidance {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 12px 0;
  color: var(--idmp-text-secondary);
  font-size: 13px;
}

.date-range-fields {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-range-fields > span {
  flex: 0 0 auto;
  color: var(--idmp-text-secondary, #667085);
  font-size: 12px;
}

.date-range-fields :deep(.el-date-editor) {
  width: 310px;
}

.trend-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 8px;
  flex-wrap: wrap;

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

.trend-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  padding-right: 4px;
}

.trend-grain-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 170px;
  max-width: 230px;
  flex: 1 1 170px;
  font-size: 12px;
  color: var(--idmp-text-secondary);
}

.trend-advanced-filters { margin-bottom: 8px; }
.trend-advanced-filters :deep(.el-collapse-item__header) { height: 34px; line-height: 34px; }
.trend-advanced-filters :deep(.el-collapse-item__content) { padding-bottom: 8px; }
.trend-advanced-help { margin-left: 8px; color: var(--idmp-text-helper); font-size: 12px; font-weight: 400; cursor: help; }
.trend-advanced-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.trend-advanced-fields .trend-grain-field { flex: 0 1 300px; flex-direction: row; align-items: center; min-width: min(180px, 100%); max-width: min(320px, 100%); }
.trend-advanced-fields .trend-grain-field label { flex: 0 1 auto; max-width: 160px; overflow: visible; white-space: normal; overflow-wrap: anywhere; }
.trend-advanced-fields .trend-grain-field :deep(.el-select) { width: auto; min-width: 0; flex: 1 1 120px; }
.trend-advanced-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.trend-advanced-actions .el-button + .el-button { margin-left: 0; }

.trend-grain-field label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-grain-field :deep(.el-select) {
  min-width: 80px;
  flex: 1 1 110px;
}

.trend-grain-option-code {
  margin-left: 8px;
  color: var(--idmp-text-helper);
}

.trend-period-picker {
  width: 292px;
  min-width: 0;
  flex: 0 0 292px;
}

.trend-period-picker :deep(.el-date-editor) {
  width: 132px;
}

.trend-controls :deep(.el-radio-group) {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  margin-left: 0;
  overflow: visible;
  white-space: nowrap;
}

.trend-controls :deep(.el-radio-button__inner) {
  box-sizing: border-box;
  padding-right: 8px;
  padding-left: 8px;
}

.trend-controls :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-right-width: 1px;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
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

@media (max-width: 1180px) {
  .trend-controls { justify-content: flex-start; flex-wrap: wrap; }
  .trend-controls :deep(.el-radio-group) { margin-left: 0; }
}
@media (max-width: 720px) {
  .date-range-fields { width: 100%; flex-wrap: wrap; }
  .date-range-fields :deep(.el-date-editor) { width: 100%; flex: 1 1 100%; }
  .trend-period-picker { flex-basis: 100%; }
}
</style>
