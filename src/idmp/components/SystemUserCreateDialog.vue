<template>
  <el-dialog :model-value="modelValue" title="创建用户" width="620px" class="user-create-dialog" :before-close="close" :close-on-click-modal="false" @update:model-value="$emit('update:modelValue', $event)">
    <el-form label-position="top" :disabled="saving" @submit.prevent="submit">
      <div class="user-form-grid">
        <el-form-item label="工号" required label-for="new-user-number"><el-input id="new-user-number" v-model="form.userName" autocomplete="off" maxlength="64" /></el-form-item>
        <el-form-item label="姓名" required label-for="new-user-name"><el-input id="new-user-name" v-model="form.nickName" maxlength="128" /></el-form-item>
        <el-form-item label="初始密码" required label-for="new-user-password"><el-input id="new-user-password" v-model="form.password" type="password" show-password autocomplete="new-password" placeholder="至少8个字符" /></el-form-item>
        <el-form-item label="确认密码" required label-for="new-user-confirm"><el-input id="new-user-confirm" v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" /></el-form-item>
      </div>
      <el-alert v-if="departmentError" type="error" :closable="false" :title="departmentError"><el-button link @click="loadDepartments">重新加载科室</el-button></el-alert>
      <el-form-item label="所属科室" :required="!administratorSelected" label-for="new-user-department"><el-select id="new-user-department" v-model="form.deptId" aria-label="所属科室" :loading="departmentsLoading" filterable clearable placeholder="请选择科室" no-data-text="暂无可用科室"><el-option v-for="item in departmentOptions" :key="item.deptId" :value="String(item.deptId)" :label="item.dept.deptName" /></el-select></el-form-item>
      <el-alert v-if="rolesError" type="error" :closable="false" :title="rolesError"><el-button link @click="$emit('reloadRoles')">重新加载角色</el-button></el-alert>
      <el-form-item label="角色" required label-for="new-user-roles"><el-select id="new-user-roles" v-model="form.roleIds" aria-label="角色" multiple filterable :loading="rolesLoading" placeholder="请选择已有角色" no-data-text="暂无可用角色"><el-option v-for="role in roleOptions" :key="role.id" :label="role.name" :value="role.id" /></el-select></el-form-item>
      <div class="user-form-grid">
        <el-form-item label="手机号" label-for="new-user-phone"><el-input id="new-user-phone" v-model="form.phonenumber" maxlength="32" /></el-form-item>
        <el-form-item label="邮箱" label-for="new-user-email"><el-input id="new-user-email" v-model="form.email" maxlength="128" /></el-form-item>
      </div>
      <el-form-item label="备注" label-for="new-user-remark"><el-input id="new-user-remark" v-model="form.remark" type="textarea" :rows="2" maxlength="500" /></el-form-item>
      <el-form-item label="启用账号"><el-switch v-model="form.enabled" /></el-form-item>
      <el-alert v-if="error" type="error" :closable="false" :title="error" show-icon />
    </el-form>
    <template #footer><el-button :disabled="saving" @click="close">取消</el-button><el-button type="primary" :loading="saving" :disabled="rolesLoading || !!rolesError || departmentsLoading || !!departmentError" @click="submit">创建用户</el-button></template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { createSystemUser, fetchSystemDepartments } from '@/idmp/api/modules/system'
import { ElMessage } from '@/idmp/utils/message'
import { activeUserRoles, newSystemUserPayload, validateNewSystemUser } from '@/idmp/utils/systemUserCreate.js'

const props = defineProps({ modelValue: Boolean, roles: { type: Array, default: () => [] }, rolesLoading: Boolean, rolesError: String })
const emit = defineEmits(['update:modelValue', 'created', 'reloadRoles'])
const emptyForm = () => ({ userName: '', nickName: '', password: '', confirmPassword: '', deptId: '', roleIds: [], phonenumber: '', email: '', remark: '', enabled: true })
const form = reactive(emptyForm()), saving = ref(false), error = ref(''), departments = ref([]), departmentsLoading = ref(false), departmentError = ref('')
const departmentOptions = computed(() => departments.value.filter(item => item.dept.status === '0'))
const roleOptions = computed(() => activeUserRoles(props.roles))
const administratorSelected = computed(() => form.roleIds.some(id => roleOptions.value.some(role => role.id === id && ['ADMIN', 'SYSTEM_ADMIN'].includes(role.key))))
watch(() => props.modelValue, open => {
  Object.assign(form, emptyForm()); error.value = ''
  if (open) loadDepartments()
}, { immediate: true })

async function loadDepartments() {
  if (departmentsLoading.value) return
  departmentsLoading.value = true; departmentError.value = ''
  try { const result = await fetchSystemDepartments(); departments.value = Array.isArray(result) ? result : result?.items || result?.records || [] }
  catch (e) { departments.value = []; departmentError.value = e?.message || '科室加载失败，请重试' }
  finally { departmentsLoading.value = false }
}
function close() { if (!saving.value) emit('update:modelValue', false) }
async function submit() {
  if (saving.value || props.rolesLoading || props.rolesError || departmentsLoading.value || departmentError.value) return
  error.value = validateNewSystemUser(form, props.roles, departments.value)
  if (error.value) return
  saving.value = true
  try {
    const id = await createSystemUser(newSystemUserPayload(form))
    Object.assign(form, emptyForm())
    emit('update:modelValue', false); emit('created', id)
    ElMessage.success('用户已创建')
  } catch (e) { error.value = e?.message || '创建用户失败，请重试' }
  finally { saving.value = false }
}
</script>

<style scoped>
.user-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}
:deep(.el-select){width:100%}
@media(max-width:600px){.user-form-grid{grid-template-columns:1fr}}
</style>
