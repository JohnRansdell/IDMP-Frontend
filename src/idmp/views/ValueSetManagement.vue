<template>
  <div class="idmp-page value-set-page">
    <PageHeader title="值集管理">
      <template #meta><span class="data-source-badge is-live">真实接口</span><span class="header-meta">维护指标计算使用的标准枚举和值集版本</span></template>
      <template #actions><el-button :loading="loading" @click="loadValueSets">刷新</el-button><el-button type="primary" @click="openCreate">新建值集</el-button></template>
    </PageHeader>

    <section class="surface-card value-set-toolbar">
      <el-input v-model="filters.code" clearable placeholder="值集编码" @keyup.enter="loadValueSets" />
      <el-input v-model="filters.name" clearable placeholder="值集名称" @keyup.enter="loadValueSets" />
      <el-select v-model="filters.status" clearable placeholder="状态">
        <el-option label="草稿" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" />
      </el-select>
      <el-button type="primary" @click="loadValueSets">查询</el-button>
    </section>
    <el-dialog v-model="createVisible" title="新建值集" width="520px" destroy-on-close>
      <el-form label-position="top"><el-form-item label="编码"><el-input v-model.trim="createForm.code" placeholder="如 SEX" /></el-form-item><el-form-item label="名称"><el-input v-model.trim="createForm.name" placeholder="如 性别" /></el-form-item><el-form-item label="值类型"><el-select v-model="createForm.valueType"><el-option label="文本" value="STRING" /><el-option label="整数" value="INTEGER" /><el-option label="小数" value="DECIMAL" /><el-option label="日期" value="DATE" /></el-select></el-form-item><el-form-item label="匹配模式"><el-select v-model="createForm.matchMode"><el-option label="精确匹配" value="EXACT" /><el-option label="前缀匹配" value="PREFIX" /><el-option label="范围匹配" value="RANGE" /><el-option label="层级匹配" value="HIERARCHICAL" /></el-select></el-form-item><el-form-item label="说明"><el-input v-model="createForm.description" type="textarea" /></el-form-item></el-form>
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <section class="surface-card table-card">
      <StatePanel v-if="loading" type="loading" title="正在加载值集" />
      <StatePanel v-else-if="error" type="error" title="值集加载失败" :description="error" />
      <StatePanel v-else-if="!rows.length" type="empty" title="暂无值集" description="当前筛选条件没有返回值集。" />
      <el-table v-else :data="rows" row-key="id" table-layout="fixed">
        <el-table-column prop="code" label="编码" min-width="220" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="匹配模式" width="130"><template #default="{ row }">{{ matchModeLabel(row.matchMode) || '—' }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="130"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
        <el-table-column label="当前发布版本" width="180"><template #default="{ row }">{{ row.currentPublishedVersionId || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看版本</el-button></template></el-table-column>
      </el-table>
      <div v-if="pageInfo.total" class="pagination-bar"><span>共 {{ pageInfo.total }} 个</span><el-pagination v-model:current-page="pageInfo.pageNum" :page-size="pageInfo.pageSize" :total="pageInfo.total" layout="prev, pager, next" @current-change="loadValueSets" /></div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { createValueSet, fetchValueSets } from '@/idmp/api/modules/valueSets'
import { matchModeLabel } from '@/idmp/features/meta'

const router = useRouter()
const filters = reactive({ code: '', name: '', status: '' })
const rows = ref([])
const loading = ref(false)
const error = ref('')
const pageInfo = reactive({ pageNum: 1, pageSize: 20, total: 0 })
const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({ code: '', name: '', description: '', matchMode: 'EXACT', valueType: 'STRING' })

async function loadValueSets() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchValueSets({ ...filters, page: pageInfo.pageNum, size: pageInfo.pageSize })
    rows.value = data?.records || data?.items || []
    pageInfo.total = Number(data?.total || 0)
  } catch (err) {
    error.value = err?.message || '值集加载失败。'
  } finally { loading.value = false }
}

function openDetail(row) { router.push({ name: 'ValueSetDetail', params: { valueSetId: row.id } }) }
function openCreate() { Object.assign(createForm, { code: '', name: '', description: '', matchMode: 'EXACT', valueType: 'STRING' }); createVisible.value = true }
async function submitCreate() { if (!createForm.code || !createForm.name) return ElMessage.warning('请填写值集编码和名称'); creating.value = true; try { const data = await createValueSet(createForm); const valueSet = data?.valueSet || data; createVisible.value = false; ElMessage.success(`值集 ${valueSet?.code || createForm.code} 创建成功`); await loadValueSets(); if (valueSet?.id) router.push({ name: 'ValueSetDetail', params: { valueSetId: valueSet.id } }) } catch (err) { ElMessage.error(err?.message || '值集创建失败') } finally { creating.value = false } }
onMounted(loadValueSets)
</script>

<style scoped>
.value-set-toolbar { display: flex; gap: 12px; margin-bottom: 16px; }
.value-set-toolbar .el-input { max-width: 220px; }
.value-set-toolbar .el-select { width: 150px; }
.pagination-bar { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; color: var(--idmp-text-secondary); font-size: 12px; }
</style>
