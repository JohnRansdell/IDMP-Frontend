<template>
  <div v-if="showPeriodControls" class="rank-period-toolbar">
    <el-radio-group v-model="rankGranularity" size="small" aria-label="排名统计粒度" @change="emit('change-granularity')">
      <el-radio-button v-for="item in DRILL_GRANULARITIES" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
    </el-radio-group>
    <el-select v-model="rankSelectedPeriod" filterable size="small" class="rank-period-select"
      aria-label="排名统计周期" :placeholder="rankPeriodPlaceholder" :loading="rankLoading"
      :disabled="!rankPeriodOptions.length" @change="emit('change-period')">
      <el-option v-for="item in rankPeriodOptions" :key="item.value" :label="item.label" :value="item.value" />
    </el-select>
  </div>
  <div class="table-heading">
    <div>
      <h2>科室指标排名</h2>
      <p v-if="hasBackendRankData">{{ rankPeriodDescription }}，按 {{ indicatorName }} 由高到低排列。</p>
      <p v-else>{{ '当前指标暂无正式科室维度结果。' }}</p>
    </div>
    <StatusBadge :status="hasBackendRankData ? 'ACTIVE' : 'NO_DATA'" :label="hasBackendRankData ? '科室正式结果' : '暂无正式数据'" tone="neutral" />
  </div>
  <StatePanel v-if="rankLoading" type="loading" title="正在读取科室排名" />
  <StatePanel v-else-if="rankErrorMessage" type="error" title="科室排名加载失败" :description="rankErrorMessage">
    <template #actions><el-button size="small" @click="emit('retry')">重试</el-button></template>
  </StatePanel>
  <StatePanel v-else-if="rankInitialized && !rankPeriodOptions.length" type="empty" :title="`暂无${rankGranularityLabel}正式结果`" description="该粒度尚未生成正式计算结果。" />
  <div v-else class="table-scroll rank-table-scroll">
    <el-table
      :data="rankTableData"
      empty-text="暂无正式科室维度结果"
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
            @click="emit('drill', row)"
          >
            查看明细
          </button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { DRILL_GRANULARITIES } from './drillPeriods.js'

const props = defineProps({
  rankTableData: { type: Array, required: true },
  indicatorName: { type: String, default: '' },
  rankPeriodDescription: { type: String, default: '' },
  showPeriodControls: Boolean,
  rankLoading: Boolean,
  rankErrorMessage: { type: String, default: '' },
  rankInitialized: Boolean,
  rankPeriodOptions: { type: Array, default: () => [] },
  rankGranularityLabel: { type: String, default: '' },
  rankPeriodPlaceholder: { type: String, default: '' }
})
const emit = defineEmits(['change-granularity', 'change-period', 'retry', 'drill'])
const rankGranularity = defineModel('granularity', { type: String, required: true })
const rankSelectedPeriod = defineModel('selectedPeriod', { type: String, required: true })
const hasBackendRankData = computed(() => props.rankTableData.length > 0)
const rankStatusTone = (status) => {
  if (status === '超标' || status === '未达标') return 'danger'
  if (status === '预警') return 'warning'
  return status === '达标' ? 'success' : 'neutral'
}

const changeClass = (change) => {
  if (change.startsWith('↑')) return 'text-danger'
  if (change.startsWith('↓')) return 'text-success'
  return 'text-muted'
}
</script>

<style scoped lang="scss">
.table-heading {
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

.rank-period-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
}

.rank-period-select {
  width: 200px;
  max-width: 100%;
}

.rank-table {
  min-width: 1060px;
}

.rank-table-scroll {
  max-height: 460px;
  overflow: auto;
  overscroll-behavior: contain;
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
</style>
