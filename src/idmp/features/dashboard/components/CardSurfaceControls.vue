<template>
  <section class="dashboard-settings-inspector card-surface-controls" aria-label="卡片表面">
    <h3>卡片表面</h3>
    <p>批量调整当前看板的组件卡片，不影响页面背景或主题方案。</p>
    <div class="surface-options" role="radiogroup" aria-label="卡片表面模式">
      <button v-for="option in CARD_SURFACE_OPTIONS" :key="option.id" type="button" :class="{ 'is-active': surface === option.id }" @click="surface = option.id">{{ option.label }}</button>
    </div>
    <label>作用范围<select v-model="scope" aria-label="卡片表面作用范围"><option value="ordinary">仅普通卡片</option><option value="all">全部组件</option></select></label>
    <small>仅普通卡片会保留已有图片或渐变背景。应用后仍可单独调整任意组件。</small>
    <button type="button" class="apply-surface" data-testid="dashboard-apply-card-surface" @click="$emit('apply', { surface, scope })">应用到当前看板</button>
  </section>
</template>
<script setup>
import { ref } from 'vue'
import { CARD_SURFACE_OPTIONS } from '../cardSurface.js'
const surface = ref('standard')
const scope = ref('ordinary')
defineEmits(['apply'])
</script>
<style scoped>
.card-surface-controls { display:grid; gap:8px; }.card-surface-controls p,.card-surface-controls small { margin:0; color:#667780; font-size:12px; line-height:1.45; }.surface-options { display:grid; grid-template-columns:repeat(4,1fr); gap:5px; }.surface-options button,.apply-surface { min-height:30px; border:1px solid #cbd8dd; border-radius:5px; background:#fff; color:#38505c; cursor:pointer; }.surface-options button.is-active { border-color:#1261a6; background:#eaf5ff; color:#1261a6; font-weight:600; }.apply-surface { border-color:#1261a6; background:#1261a6; color:#fff; }
</style>
