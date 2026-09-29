<template>
  <section class="map-config" aria-label="地图配置">
    <h3>地图边界</h3>
    <p>地图使用标准行政区划编码匹配数据。边界 GeoJSON 由组件查询接口返回，前端不再使用柱状图模拟地图。</p>
    <label>地图层级<select :value="modelValue?.boundaryLevel || 'PROVINCE'" @change="patch({ boundaryLevel: $event.target.value })"><option value="COUNTRY">全国</option><option value="PROVINCE">省级</option><option value="CITY">市级</option><option value="DISTRICT">区县</option></select></label>
    <label>父级行政区划编码<input :value="modelValue?.parentRegionCode || ''" placeholder="例如 330000；全国可留空" @input="patch({ parentRegionCode: $event.target.value.trim() })" /></label>
    <label>区域字段编码<input :value="modelValue?.regionCodeField || 'regionCode'" @input="patch({ regionCodeField: $event.target.value.trim() })" /></label>
    <label>区域名称字段<input :value="modelValue?.regionNameField || 'regionName'" @input="patch({ regionNameField: $event.target.value.trim() })" /></label>
  </section>
</template>
<script setup>
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } })
const emit = defineEmits(['change'])
function patch(value) { emit('change', { ...(props.modelValue || {}), ...value }) }
</script>
<style scoped>
.map-config { display:grid; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid var(--db-border,#e3e9eb); font-size:12px; }.map-config h3,.map-config p { margin:0; }.map-config p { color:var(--db-muted,#78878e); line-height:1.55; }.map-config label { display:grid; gap:4px; }.map-config input,.map-config select { box-sizing:border-box; width:100%; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; }
</style>
