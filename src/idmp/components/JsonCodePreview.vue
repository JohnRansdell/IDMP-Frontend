<template>
  <pre class="json-code-preview" :aria-label="label"><code><span v-for="(token, index) in tokens" :key="index" :class="token.kind ? `json-token--${token.kind}` : ''">{{ token.text }}</span></code></pre>
</template>

<script setup>
import { computed } from 'vue'
import { tokenizeJson } from '@/idmp/utils/jsonHighlight'

const props = defineProps({ value: { type: [Object, Array], default: () => ({}) }, label: { type: String, default: 'JSON 预览' } })
const tokens = computed(() => tokenizeJson(props.value))
</script>

<style scoped>
.json-code-preview{box-sizing:border-box;max-height:340px;overflow:auto;margin:0;padding:16px 18px;border:1px solid var(--idmp-border-subtle);background:#f5f7f8;color:#29343b;font:600 15px/1.65 "Cascadia Code",Consolas,monospace;white-space:pre;tab-size:2}
.json-token--key{color:#086879}.json-token--string{color:#277142}.json-token--number{color:#a34c20}.json-token--boolean{color:#315baa}.json-token--null{color:#68747d}
</style>
