<template>
  <div
    class="grid-stack-item dashboard-widget"
    :class="{ 'is-selected': selected, 'is-editable': editable }"
    :gs-id="widget.id"
    :gs-x="widget.layout?.x"
    :gs-y="widget.layout?.y"
    :gs-w="widget.layout?.w"
    :gs-h="widget.layout?.h"
    :data-widget-id="widget.id"
    @click="$emit('select', widget.id)"
  >
    <div class="grid-stack-item-content dashboard-widget__content">
      <slot :widget="widget" />
      <div v-if="editable" class="dashboard-widget__actions">
        <button type="button" @pointerdown.stop @mousedown.stop @click.stop="$emit('remove', widget.id)">删除</button>
        <button type="button" @pointerdown.stop @mousedown.stop @click.stop="$emit('configure', widget.id)">配置</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  widget: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }
})

defineEmits(['select', 'remove', 'configure'])
</script>

<style scoped>
.dashboard-widget__content { position: relative; min-height: 100%; }
.dashboard-widget.is-selected .dashboard-widget__content { outline: 2px solid #409eff; outline-offset: -2px; }
.dashboard-widget__actions { position: absolute; top: 8px; right: 8px; z-index: 2; display: flex; gap: 4px; }
.dashboard-widget__actions button { padding: 3px 7px; border: 1px solid #d0d5dd; border-radius: 4px; background: #fff; color: #344054; cursor: pointer; font-size: 12px; }
</style>
