<template>
  <div class="indicator-source-picker">
    <el-select :model-value="modelValue" :loading="loading" :aria-label="label" :data-testid="testId" filterable clearable :placeholder="placeholder" @change="emit('change', $event || '')" @visible-change="visible => visible && emit('refresh')">
      <el-option v-if="modelValue && !sources.some(source => source.code === modelValue)" :value="modelValue" :label="currentName || '指标已不可用'" disabled />
      <el-option v-for="source in sources" :key="source.code" :value="source.code" :label="source.name">
        <span class="indicator-source-picker__name" :title="source.name">{{ source.name }}</span>
        <small v-if="source.indicatorVersionNo">发布版 {{ source.indicatorVersionNo }}</small>
      </el-option>
    </el-select>
    <div class="indicator-source-picker__note"><span>{{ error || (modelValue && !loading && !sources.some(source => source.code === modelValue) ? '当前来源已不在有效的已发布指标目录中，请重新选择。' : '按创建时间倒序；仅可选当前目录中的已发布指标。') }}</span><button type="button" :disabled="loading" @click="emit('refresh')">{{ loading ? '刷新中' : error ? '重试' : '刷新' }}</button></div>
  </div>
</template>

<script setup>
defineProps({ modelValue: { type: String, default: '' }, sources: { type: Array, default: () => [] }, loading: Boolean, error: { type: String, default: '' }, currentName: { type: String, default: '' }, label: { type: String, default: '指标来源' }, testId: { type: String, default: '' }, placeholder: { type: String, default: '搜索并选择指标' } })
const emit = defineEmits(['change', 'refresh'])
</script>

<style scoped>
.indicator-source-picker { min-width:0; width:100%; }
.indicator-source-picker .el-select { width:100%; }
.indicator-source-picker__name { display:inline-block; max-width:calc(100% - 75px); overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
.indicator-source-picker small { float:right; margin-left:8px; color:var(--db-muted,#78878e); font-size:10px; }
.indicator-source-picker__note { display:flex; align-items:start; gap:6px; margin-top:5px; color:var(--db-muted,#78878e); font-size:11px; line-height:1.5; }
.indicator-source-picker__note span { flex:1; min-width:0; }
.indicator-source-picker__note button { flex-shrink:0; padding:0; border:0; background:transparent; color:var(--db-accent,#1261a6); font:inherit; cursor:pointer; }
.indicator-source-picker__note button:disabled { opacity:.6; cursor:default; }
</style>
