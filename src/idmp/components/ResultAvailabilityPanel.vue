<template>
  <section v-if="availability" class="result-availability" :class="`is-${availability.status.toLowerCase()}`">
    <div class="result-availability__head">
      <div>
        <strong>分析可用性：{{ getStatusLabel(availability.status) }}</strong>
        <p>{{ availability.message }}</p>
      </div>
      <StatusBadge :status="availability.status" />
    </div>
    <dl v-if="availability.executionStatus || availability.outcomeStatus" class="result-availability__meta">
      <div v-if="availability.executionStatus"><dt>执行状态</dt><dd>{{ getStatusLabel(availability.executionStatus) }}</dd></div>
      <div v-if="availability.outcomeStatus"><dt>结果结论</dt><dd>{{ getStatusLabel(availability.outcomeStatus) }}</dd></div>
    </dl>
    <el-table v-if="availability.profiles?.length" :data="availability.profiles" size="small" class="result-availability__profiles">
      <el-table-column prop="factorVersionId" label="因子版本" min-width="150" />
      <el-table-column label="执行状态" width="120"><template #default="{ row }">{{ getStatusLabel(row.executionStatus) }}</template></el-table-column>
      <el-table-column label="源数据" width="120"><template #default="{ row }">{{ getStatusLabel(row.sourceDataStatus) }}</template></el-table-column>
      <el-table-column prop="sourceRecordCount" label="源记录数" width="110" />
      <el-table-column prop="errorMessage" label="诊断信息" min-width="220" show-overflow-tooltip />
    </el-table>
    <div v-if="availability.batchId" class="result-availability__actions">
      <el-button size="small" @click="$emit('open-batch', availability.batchId)">查看批次详情</el-button>
    </div>
  </section>
</template>

<script setup>
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getStatusLabel } from '@/idmp/design/status'

defineProps({ availability: { type: Object, default: null } })
defineEmits(['open-batch'])
</script>

<style scoped>
.result-availability { margin-bottom: 16px; padding: 14px 16px; border: 1px solid var(--idmp-border, #d0d5dd); border-radius: 10px; background: #f8fafc; }
.result-availability.is-calculation_error { border-color: #fecdca; background: #fffbfa; }
.result-availability.is-no_data { background: #f8fafc; }
.result-availability__head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; min-width:0; }
.result-availability__head > div { min-width:0; }
.result-availability__head p { margin:5px 0 0; color:var(--idmp-text-secondary, #667085); overflow-wrap:anywhere; word-break:break-word; }
.result-availability__meta { display:flex; gap:24px; margin:12px 0 0; }
.result-availability__meta div { display:flex; gap:6px; }
.result-availability__meta dt { color:var(--idmp-text-secondary, #667085); }
.result-availability__meta dd { margin:0; }
.result-availability__profiles { margin-top:12px; }
.result-availability__profiles :deep(.cell) { overflow-wrap:anywhere; word-break:break-word; }
.result-availability__actions { margin-top:12px; }
</style>
