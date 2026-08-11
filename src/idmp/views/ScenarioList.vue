<template>
  <div class="idmp-page scenario-list">
    <PageHeader title="场景管理" status="ENABLED" status-label="后端联调">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="createOpen = true">新建场景</el-button>
      </template>
    </PageHeader>

    <section class="filter-card">
      <el-form :inline="true" @submit.prevent="load">
        <el-form-item><el-input v-model.trim="filters.code" clearable placeholder="场景编码" /></el-form-item>
        <el-form-item><el-input v-model.trim="filters.name" clearable placeholder="场景名称" /></el-form-item>
        <el-form-item><el-select v-model="filters.type" clearable placeholder="场景类型" style="width: 150px">
          <el-option v-for="item in SCENARIO_TYPES" :key="item.value" :label="item.label" :value="item.value" />
        </el-select></el-form-item>
        <el-form-item><el-select v-model="filters.publicationStatus" clearable placeholder="版本状态" style="width: 140px">
          <el-option label="已发布" value="PUBLISHED" /><el-option label="草稿" value="DRAFT" />
        </el-select></el-form-item>
        <el-form-item><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="reset">重置</el-button></el-form-item>
      </el-form>
    </section>

    <section class="surface-card table-card">
      <el-table v-loading="loading" :data="rows" empty-text="暂无场景">
        <el-table-column prop="code" label="场景编码" width="220"><template #default="{ row }"><span class="mono-data">{{ row.code }}</span></template></el-table-column>
        <el-table-column prop="name" label="场景名称" min-width="220" />
        <el-table-column label="类型" width="130"><template #default="{ row }">{{ scenarioTypeLabel(row.type) }}</template></el-table-column>
        <el-table-column prop="governingOrgName" label="主管部门" min-width="160" />
        <el-table-column prop="indicatorCount" label="指标数" width="90" />
        <el-table-column label="状态" width="110"><template #default="{ row }"><StatusBadge :label="publicationStatusLabel(row.status)" :status="row.status" /></template></el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180" />
        <el-table-column label="操作" width="180" fixed="right"><template #default="{ row }"><button class="action-link" type="button" @click="open(row)">查看/编辑</button><button class="action-link" type="button" @click="newVersion(row)">新建版本</button></template></el-table-column>
      </el-table>
      <div class="table-footer"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" v-model:page-size="size" layout="prev, pager, next, sizes" :page-sizes="[10, 20, 50]" :total="total" @current-change="load" @size-change="load" /></div>
    </section>

    <el-dialog v-model="createOpen" title="新建场景" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="场景编码" prop="code"><el-input v-model.trim="form.code" /></el-form-item>
        <el-form-item label="场景名称" prop="name"><el-input v-model.trim="form.name" /></el-form-item>
        <el-form-item label="场景类型" prop="type"><el-select v-model="form.type" style="width: 100%"><el-option v-for="item in SCENARIO_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="默认周期" prop="defaultPeriodType"><el-select v-model="form.defaultPeriodType" style="width: 100%"><el-option v-for="item in PERIOD_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="主管部门"><el-input v-model="form.governingOrgName" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createOpen = false">取消</el-button><el-button type="primary" :loading="saving" @click="create">创建并编辑</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { createScenario, createScenarioVersion, fetchScenarios } from '@/idmp/api/modules/scenarios'
import { normalizePage, PERIOD_TYPES, SCENARIO_TYPES, publicationStatusLabel, scenarioTypeLabel } from '@/idmp/api/adapters/scenario'

const router = useRouter()
const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const loading = ref(false)
const saving = ref(false)
const createOpen = ref(false)
const formRef = ref()
const filters = reactive({ code: '', name: '', type: '', publicationStatus: '' })
const form = reactive({ code: '', name: '', type: 'CUSTOM', defaultPeriodType: 'MONTHLY', governingOrgName: '', description: '' })
const rules = { code: [{ required: true, message: '请输入场景编码' }], name: [{ required: true, message: '请输入场景名称' }], type: [{ required: true, message: '请选择场景类型' }], defaultPeriodType: [{ required: true, message: '请选择默认周期' }] }

async function load() {
  loading.value = true
  try {
    const result = normalizePage(await fetchScenarios({ ...filters, page: page.value, size: size.value }))
    rows.value = result.items
    total.value = result.total
  } catch (error) {
    ElMessage.error(error?.message || '场景列表加载失败')
  } finally { loading.value = false }
}

function reset() { Object.assign(filters, { code: '', name: '', type: '', publicationStatus: '' }); page.value = 1; load() }
function open(row) { router.push({ name: 'ScenarioEditor', params: { scenarioId: row.id }, query: { versionId: row.currentPublishedVersionId || undefined } }) }
async function newVersion(row) {
  if (!row.currentPublishedVersionId) return open(row)
  try {
    const detail = await createScenarioVersion(row.id, { copyFromVersionId: row.currentPublishedVersionId }, `scenario-version-${row.id}-${row.currentPublishedVersionId}-${Date.now()}`)
    router.push({ name: 'ScenarioEditor', params: { scenarioId: row.id }, query: { versionId: detail?.version?.id } })
  } catch (error) { ElMessage.error(error?.message || '创建场景版本失败') }
}
async function create() {
  await formRef.value?.validate()
  saving.value = true
  try {
    const result = await createScenario({ ...form, defaultParameters: {}, defaultExclusionDsl: { nodeType: 'TRUE' } }, `scenario-create-${Date.now()}`)
    createOpen.value = false
    router.push({ name: 'ScenarioEditor', params: { scenarioId: result?.scenario?.id }, query: { versionId: result?.version?.id } })
  } catch (error) { ElMessage.error(error?.message || '创建场景失败') } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped>
.scenario-list { min-width: 0; }
.filter-card { margin-bottom: 16px; padding: 16px; }
.table-card { padding: 16px; }
.table-footer { display:flex; align-items:center; justify-content:space-between; padding-top:14px; color:var(--idmp-text-helper); }
.action-link { padding:0; margin-right:14px; border:0; color:var(--idmp-interactive); background:transparent; cursor:pointer; }
</style>
