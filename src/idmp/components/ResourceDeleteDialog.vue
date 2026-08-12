<template>
  <el-dialog v-model="visible" :title="`删除${resourceLabel}`" width="620px" @closed="reset">
    <el-skeleton v-if="loadingImpact" :rows="5" animated />
    <template v-else-if="impact">
      <el-alert
        v-if="impact.deletable === false"
        title="当前资源不能删除"
        type="error"
        :description="blockersSummary"
        show-icon
        :closable="false"
      />
      <div class="impact-groups">
        <section v-if="impact.blockers?.length" class="impact-group is-danger">
          <h4>删除阻断项</h4>
          <div v-for="item in impact.blockers" :key="item.code" class="impact-item">
            <strong>{{ item.message || item.code }}</strong><span>共 {{ item.count }} 项</span>
            <ul v-if="item.samples?.length"><li v-for="sample in item.samples" :key="`${item.code}-${sample.resourceId}-${sample.versionId}`">{{ sample.resourceName || sample.resourceCode || sample.resourceType || '关联资源' }}</li></ul>
          </div>
        </section>
        <section v-if="impact.automaticActions?.length" class="impact-group is-warning">
          <h4>删除后自动动作</h4>
          <div v-for="item in impact.automaticActions" :key="item.code" class="impact-item">{{ item.message || item.code }}（{{ item.count }} 项）</div>
        </section>
        <section v-if="impact.warnings?.length" class="impact-group is-info">
          <h4>提示</h4>
          <div v-for="item in impact.warnings" :key="item.code" class="impact-item">{{ item.message || item.code }}（{{ item.count }} 项）</div>
        </section>
      </div>
      <el-form label-position="top">
        <el-form-item label="删除原因" :error="reasonError">
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="请输入删除原因（必填）" />
        </el-form-item>
      </el-form>
    </template>
    <el-empty v-else description="无法读取删除影响，请稍后重试" />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="danger" :loading="submitting" :disabled="!impact || impact.deletable === false" @click="submit">确认删除</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { formatApiError } from '@/idmp/utils/apiError'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  resourceLabel: { type: String, default: '资源' },
  loadImpact: { type: Function, required: true },
  performDelete: { type: Function, required: true }
})
const emit = defineEmits(['update:modelValue', 'success'])
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const impact = ref(null)
const loadingImpact = ref(false)
const submitting = ref(false)
const reason = ref('')
const reasonError = ref('')
const blockersSummary = computed(() => (impact.value?.blockers || []).map(item => `${item.message || item.code}（${item.count}项）`).join('；'))

watch(() => props.modelValue, async opened => {
  if (!opened) return
  impact.value = null
  reason.value = ''
  reasonError.value = ''
  loadingImpact.value = true
  try { impact.value = await props.loadImpact() }
  catch (error) { ElMessage.error(formatApiError(error, '删除影响检查失败')) }
  finally { loadingImpact.value = false }
})

async function submit() {
  const trimmed = reason.value.trim()
  if (!trimmed) { reasonError.value = '请输入删除原因'; return }
  reasonError.value = ''
  submitting.value = true
  try {
    await props.performDelete({ resourceVersion: impact.value.resourceVersion, deleteReason: trimmed })
    ElMessage.success(`${props.resourceLabel}已移入回收站`)
    emit('success')
    visible.value = false
  } catch (error) {
    if (error?.code === 'RESOURCE-DELETE-40901' && error?.payload?.data) impact.value = error.payload.data
    ElMessage.error(formatApiError(error, '删除失败，请刷新影响检查结果'))
  } finally { submitting.value = false }
}

function reset() { impact.value = null; reason.value = ''; reasonError.value = '' }
</script>

<style scoped>
.impact-groups { margin: 16px 0; display: grid; gap: 10px; }
.impact-group { padding: 10px 12px; border-radius: 6px; background: var(--el-fill-color-light); }
.impact-group h4 { margin: 0 0 6px; }
.impact-group.is-danger h4 { color: var(--el-color-danger); }
.impact-group.is-warning h4 { color: var(--el-color-warning-dark); }
.impact-item { font-size: 13px; line-height: 22px; }
.impact-item span { margin-left: 8px; color: var(--el-text-color-secondary); }
.impact-item ul { margin: 2px 0 0 18px; padding: 0; color: var(--el-text-color-secondary); }
</style>
