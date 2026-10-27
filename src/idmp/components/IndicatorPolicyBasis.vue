<template>
  <div class="indicator-policy-basis">
    <el-alert title="政策依据选填，留空不影响发布。来源文件在第 1 页选择，此处自动同步。草稿依据随来源在发布后保存。" type="info" :closable="false" show-icon />
    <el-alert v-if="controller.error" :title="controller.error" type="error" :closable="false" />
    <el-empty v-if="!controller.references.length && !modelValue.length" description="尚未选择政策文件来源，请先在第 1 页选择；依据可以留空。" />
    <el-table v-if="controller.references.length" :data="controller.references" empty-text="暂无已保存政策依据" table-layout="fixed">
      <el-table-column label="政策文件" min-width="200"><template #default="{ row }">{{ row.policyFileName || '未命名政策文件' }}</template></el-table-column>
      <el-table-column prop="policyVersionNo" label="版本" width="80" />
      <el-table-column label="文号" min-width="140"><template #default="{ row }">{{ controller.metadata[row.policyFileId]?.documentNumber || '未提供' }}</template></el-table-column>
      <el-table-column prop="citationLocation" label="章节或条款（选填）" min-width="160" />
      <el-table-column prop="citationText" label="依据说明（选填）" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="primary" @click="controller.viewerId = String(row.policyFileVersionId)">查看文件</el-button></template></el-table-column>
    </el-table>
    <p v-if="controller.references.length">已保存依据为只读；需要调整时，可创建新的指标草稿版本后补充。</p>
    <article v-for="row in modelValue" :key="row.policyFileVersionId" class="pending-source">
      <strong>{{ row.policyFileName }} · 版本 {{ row.versionNo }}</strong>
      <p>文号：{{ row.documentNumber || '未提供' }} <el-button link type="primary" @click="controller.viewerId = row.policyFileVersionId">查看文件</el-button></p>
      <el-input :model-value="row.citationLocation" :disabled="controller.saving" maxlength="500" aria-label="政策章节或条款（选填）" placeholder="政策章节或条款（选填）" @update:model-value="value => controller.edit(row, 'citationLocation', value)" />
      <el-input :model-value="row.citationText" :disabled="controller.saving" type="textarea" :rows="2" maxlength="10000" aria-label="政策依据说明（选填）" placeholder="政策依据说明或引用原文（选填），留空不影响发布" @update:model-value="value => controller.edit(row, 'citationText', value)" />
    </article>
    <el-button v-if="published && modelValue.length" type="primary" :loading="controller.saving" @click="controller.savePending">保存待绑定来源及依据</el-button>
  </div>
</template>
<script setup>
defineProps({ controller: { type: Object, required: true }, modelValue: { type: Array, default: () => [] }, published: Boolean })
</script>
<style scoped>
.pending-source { border: 1px solid var(--el-border-color); padding: 12px; margin: 12px 0; border-radius: 6px; }
.pending-source .el-input { margin-bottom: 8px; }
</style>
