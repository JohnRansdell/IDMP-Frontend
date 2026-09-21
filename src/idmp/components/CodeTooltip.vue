<template>
  <el-tooltip
    v-if="code"
    :content="`${label}：${code}`"
    placement="top"
    :show-after="250"
  >
    <span class="code-hover-target" :tabindex="focusable ? 0 : undefined">
      <slot />
    </span>
  </el-tooltip>
  <span v-else><slot /></span>
</template>

<script setup>
defineProps({
  code: { type: [String, Number], default: '' },
  label: { type: String, default: '编码' },
  focusable: { type: Boolean, default: true }
})
</script>

<style scoped>
.code-hover-target {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
}
</style>
