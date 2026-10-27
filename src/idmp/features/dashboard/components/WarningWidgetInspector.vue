<template>
  <section class="warning-widget-inspector" aria-label="预警组件设置">
    <h3>预警事件</h3>
    <p>配置看板展示范围；预警事件由已发布并启用的规则根据计算结果生成，不能在看板中手工修改。</p>
    <label>事件状态<select :value="config.status" @change="patch({ status: $event.target.value })"><option value="">全部状态</option><option value="OPEN">待处理</option><option value="ACKNOWLEDGED">已确认</option><option value="CLOSED">已关闭</option></select></label>
    <label>严重程度<select :value="config.severity" @change="patch({ severity: $event.target.value })"><option value="">全部级别</option><option value="CRITICAL">严重</option><option value="HIGH">高</option><option value="MEDIUM">中</option><option value="LOW">低</option><option value="INFO">提示</option></select></label>
    <label>指标（可选）<ResourceReferenceSelect :model-value="config.indicatorVersionId" kind="INDICATOR_VERSION" placeholder="请选择指标版本" @update:model-value="value => patch({ indicatorVersionId: value })" /></label>
    <label>预警规则（可选）<ResourceReferenceSelect :model-value="config.ruleId" kind="RULE" placeholder="请选择预警规则" @update:model-value="value => patch({ ruleId: value })" /></label>
    <label>显示条数<input type="number" min="1" max="20" :value="config.pageSize" @change="patch({ pageSize: Number($event.target.value) })" /></label>
    <label><input type="checkbox" :checked="config.showSeverity" @change="patch({ showSeverity: $event.target.checked })" />显示严重程度</label>
    <label><input type="checkbox" :checked="config.showValue" @change="patch({ showValue: $event.target.checked })" />显示当前值</label>
    <label><input type="checkbox" :checked="config.showTime" @change="patch({ showTime: $event.target.checked })" />显示触发时间</label>
    <small>组件按事件状态、严重程度、规则和指标筛选，不受看板全局时间及组织筛选影响。</small>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import ResourceReferenceSelect from '@/idmp/components/ResourceReferenceSelect.vue'
import { normalizeWarningWidgetConfig } from '../warningWidget.js'
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } })
const emit = defineEmits(['update:modelValue'])
const config = computed(() => normalizeWarningWidgetConfig(props.modelValue))
function patch(value) { emit('update:modelValue', normalizeWarningWidgetConfig({ ...config.value, ...value })) }
</script>

<style scoped>
.warning-widget-inspector { display:grid; gap:9px; font-size:12px; }.warning-widget-inspector h3,.warning-widget-inspector p { margin:0; }.warning-widget-inspector p,.warning-widget-inspector small { color:var(--db-muted,#78878e); line-height:1.55; }.warning-widget-inspector label { display:grid; gap:4px; color:var(--db-secondary,#52636c); }.warning-widget-inspector input:not([type=checkbox]),.warning-widget-inspector select { width:100%; box-sizing:border-box; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; }.warning-widget-inspector input[type=checkbox] { width:auto; margin-right:5px; }
</style>
