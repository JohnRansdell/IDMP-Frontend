<template>
  <div class="trace-tree" aria-label="因子结果依赖追溯">
    <div v-for="(factor,index) in factors" :key="`${factor.factorVersionId}-${index}`" class="trace-row">
      <div class="trace-row__summary">
        <el-button v-if="factor.expandable" :icon="expanded[index] ? ArrowDown : ArrowRight" circle size="small" :loading="loading[index]" :disabled="!factor.result?.factorResultId" :title="expanded[index] ? '收起上游因子' : '展开上游因子'" @click="toggle(factor,index)" />
        <span v-else class="trace-leaf" />
        <div class="trace-name"><strong>{{ factor.factorName || factor.factorCode }}</strong><small>{{ factor.factorKind === 'DERIVED' ? '复合因子' : '源表因子' }} · V{{ factor.versionNo }} · {{ factor.factorVersionId }}</small></div>
        <span>{{ factor.resultMatched ? factor.result?.displayValue ?? factor.result?.value ?? '-' : '未匹配结果' }}</span>
        <span v-if="factor.result?.qualityStatus">{{ getStatusLabel(factor.result.qualityStatus) }}</span>
        <el-button v-if="factor.factorId" link type="primary" @click="router.push({path:`/factor/edit/${factor.factorId}`,query:{factorVersionId:String(factor.factorVersionId)}})">查看因子</el-button>
      </div>
      <el-alert v-if="errors[index]" :title="errors[index]" type="error" :closable="false"><el-button size="small" @click="expand(factor,index)">重试</el-button></el-alert>
      <div v-if="expanded[index]" class="trace-children">
        <FactorTraceTree v-if="children[index]?.length" :result-id="resultId" :factors="children[index]" />
        <span v-else-if="!loading[index]">暂无上游结果</span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { fetchResultFactorDependencies } from '@/idmp/api/modules/drill'
import { getStatusLabel } from '@/idmp/design/status'
const props = defineProps({ resultId: { type: String, required: true }, factors: { type: Array, default: () => [] } })
const router = useRouter(), expanded = ref({}), children = ref({}), loading = ref({}), errors = ref({})
let generation = 0
watch(() => [props.resultId, props.factors], () => { generation += 1; expanded.value = {}; children.value = {}; loading.value = {}; errors.value = {} })
async function toggle(factor, index) {
  if (expanded.value[index]) { expanded.value[index] = false; return }
  if (children.value[index]) { expanded.value[index] = true; return }
  await expand(factor,index)
}
async function expand(factor,index) {
  if (!factor.result?.factorResultId || loading.value[index]) return
  const token = generation; loading.value[index] = true; errors.value[index] = ''
  try {
    const data = await fetchResultFactorDependencies(props.resultId, String(factor.result.factorResultId))
    if (generation === token) { children.value[index] = data.dependencies || []; expanded.value[index] = true }
  } catch (e) { if (generation === token) errors.value[index] = e?.message || '上游结果加载失败，请重试' }
  finally { if (generation === token) loading.value[index] = false }
}
</script>
<style scoped>
.trace-row { border-top: 1px solid var(--idmp-border-subtle, #e5e7eb); padding: 12px 0; min-width: 0; }
.trace-row__summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.trace-name { flex: 1; min-width: min(210px, 100%); overflow-wrap: anywhere; }
.trace-name strong, .trace-name small { display: block; }
.trace-name small { margin-top: 5px; color: var(--idmp-text-helper); }
.trace-leaf { width: 24px; flex-shrink: 0; }
.trace-children { margin: 12px 0 0 16px; padding-left: 12px; border-left: 2px solid var(--idmp-border-subtle, #e5e7eb); }
@media (max-width: 600px) { .trace-children { margin-left: 4px; padding-left: 8px; } }
</style>
