<template>
  <div class="idmp-page dashboard-management">
    <PageHeader title="看板管理">
      <template #meta><span class="page-description">集中创建、维护和配置指标看板</span></template>
      <template #actions><el-button type="primary" @click="openCreate">+ 新建看板</el-button></template>
    </PageHeader>

    <section class="dashboard-toolbar" aria-label="看板列表工具栏">
      <el-input v-model="search" class="dashboard-search" placeholder="搜索看板名称" clearable />
      <div class="dashboard-toolbar__summary">
        <span class="dashboard-count">{{ search.trim() ? `找到 ${filtered.length} 个` : `共 ${catalog.length} 个看板` }}</span>
      </div>
    </section>

    <StatePanel v-if="loading" type="loading" title="正在读取看板" />
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false"><el-button link @click="refresh">重试</el-button></el-alert>
    <section v-if="filtered.length" class="dashboard-cards">
      <article v-for="item in filtered" :key="item.id" class="dashboard-card">
        <header class="dashboard-card__header">
          <h2 :title="item.name">{{ item.name }}</h2>
          <el-tag size="small" effect="plain">{{ typeLabel(item.dashboardType) }}</el-tag>
        </header>
        <p class="dashboard-card__description">{{ item.description || '暂无看板说明' }}</p>
        <div class="dashboard-card__metadata">
          <span>{{ item.category || '未分类' }}</span><i aria-hidden="true" />
          <span>{{ scopeLabel(item.scope) }}</span>
        </div>
        <time class="dashboard-card__updated" :datetime="item.updatedAt">更新于 {{ formatDate(item.updatedAt) }}</time>
        <footer class="dashboard-card__actions">
          <el-button @click="open(item.id)">查看</el-button>
          <el-button type="primary" @click="edit(item.id)">编辑</el-button>
          <el-dropdown @command="command => menu(command, item)">
            <el-button aria-label="更多看板操作">···</el-button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="copy">复制</el-dropdown-item><el-dropdown-item command="rename">重命名</el-dropdown-item><el-dropdown-item command="delete" :disabled="item.origin !== 'remote' && protectedIds.has(item.id)">删除</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </footer>
      </article>
    </section>
    <StatePanel v-else-if="!loading && !loadError" type="empty" :title="search.trim() ? '未找到匹配看板' : '还没有看板'" :description="search.trim() ? '请尝试其他名称，或清除搜索条件。' : '创建一个看板，自由组合指标与图表。'">
      <template #actions><el-button v-if="search.trim()" @click="search = ''">清除搜索</el-button><el-button v-else type="primary" @click="openCreate">新建看板</el-button></template>
    </StatePanel>
    <el-dialog v-model="creating" title="新建看板" width="min(900px, 92vw)" destroy-on-close>
      <el-form label-position="top" class="create-form">
        <div class="create-form__metadata">
          <el-form-item label="名称 *"><el-input v-model="form.name" placeholder="例如：全院医疗质量月报" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="简要说明看板用途" /></el-form-item>
          <el-form-item label="类型 *"><el-select v-model="form.dashboardType"><el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="分类"><el-input v-model="form.category" placeholder="例如：医疗质量" /></el-form-item>
          <el-form-item label="适用范围 *"><el-select v-model="form.scope"><el-option label="全院" value="hospital" /><el-option label="科室" value="department" /><el-option label="个人" value="personal" /></el-select></el-form-item>
        </div>

        <el-form-item label="从哪里开始">
          <div class="creation-modes" role="radiogroup" aria-label="看板创建方式">
            <button type="button" class="creation-mode" :class="{ 'is-selected': form.mode === 'blank' }" @click="form.mode = 'blank'">
              <span class="blank-preview" aria-hidden="true"><i /><i /><i /></span>
              <strong>空白看板</strong><small>从空画布开始，自由添加指标和图表</small>
            </button>
            <button type="button" class="creation-mode" :class="{ 'is-selected': form.mode === 'template' }" @click="form.mode = 'template'">
              <span class="template-preview-icon" aria-hidden="true"><i /><i /><i /><i /></span>
              <strong>使用模板</strong><small>先选一种成熟布局，再替换指标内容</small>
            </button>
          </div>
        </el-form-item>

        <el-form-item v-if="form.mode === 'template'" label="选择布局模板">
          <div class="template-gallery">
            <button
              v-for="item in templates"
              :key="item.id"
              type="button"
              class="template-card"
              :class="{ 'is-selected': form.templateId === item.id }"
              @click="form.templateId = item.id"
            >
              <span class="template-card__canvas" :style="templateCanvasStyle(item)" aria-hidden="true">
                <i v-for="(widget, index) in item.widgets" :key="index" :style="templateWidgetStyle(widget, item)" />
              </span>
              <span class="template-card__copy"><strong>{{ item.name }}</strong><small>{{ item.description || '自定义布局模板' }}</small></span>
              <span v-if="form.templateId === item.id" class="template-card__selected">已选择</span>
            </button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="creating = false">取消</el-button><el-button type="primary" :disabled="!form.name.trim() || (form.mode === 'template' && !form.templateId)" @click="create">创建并编辑</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { BUILT_IN_LAYOUT_TEMPLATES, readLocalLayoutTemplates } from '@/idmp/features/dashboard/layoutTemplates.js'
import { BUILT_IN_DASHBOARD_IDS, createLocalDashboard, duplicateLocalDashboard, readDashboardCatalog, removeLocalDashboard, renameLocalDashboard } from '@/idmp/features/dashboard/catalog.js'
import { fetchDashboardCatalog, fetchDashboardDefinition, copyDashboard, deleteDashboard, saveDashboard } from '@/idmp/api/modules/analysisDashboard'
import { dashboardSummaryToCatalogEntry, dashboardDetailToSchema, dashboardDetailMeta, schemaToDashboardPayload } from '@/idmp/api/adapters/dashboard'
import { notifyDashboardCatalogChanged } from '@/idmp/layout/shellState.js'
const router = useRouter(), search = ref(''), creating = ref(false), catalog = ref([]), protectedIds = BUILT_IN_DASHBOARD_IDS
const loading = ref(false), loadError = ref('')
let refreshRevision = 0
const typeOptions = [{ value: 'hospital-overview', label: '全院概览' }, { value: 'topic', label: '专题' }, { value: 'scene', label: '场景' }, { value: 'department', label: '科室' }, { value: 'custom', label: '自定义' }]
const form = ref({ name: '', description: '', dashboardType: 'custom', category: '', scope: 'personal', mode: 'blank', templateId: 'builtin-hospital-overview' })
const templates = computed(() => [...BUILT_IN_LAYOUT_TEMPLATES, ...readLocalLayoutTemplates(localStorage)])
const filtered = computed(() => catalog.value.filter(item => item.name.includes(search.value.trim())))
function templateCanvasStyle(template) {
  const rows = Math.max(1, ...(template.widgets || []).map(widget => Number(widget.layout?.y || 0) + Number(widget.layout?.h || 1)))
  return { gridTemplateRows: `repeat(${rows}, minmax(1px, 1fr))` }
}
function templateWidgetStyle(widget, template) {
  const layout = widget.layout || {}
  const palette = template.previewPalette || ['#f3f7fb', '#1261a6', '#78a9d1', '#d8e2e7']
  return {
    gridColumn: `${Number(layout.x || 0) + 1} / span ${Number(layout.w || 1)}`,
    gridRow: `${Number(layout.y || 0) + 1} / span ${Number(layout.h || 1)}`,
    background: palette[widget.type === 'text' ? 3 : widget.type === 'kpi' ? 1 : 2] || palette[1]
  }
}
async function refresh() {
  const revision = ++refreshRevision
  loading.value = true
  loadError.value = ''
  const local = readDashboardCatalog(localStorage).map(item => ({ ...item, origin: 'local' }))
  try {
    const result = await fetchDashboardCatalog()
    if (revision !== refreshRevision) return
    const remote = (Array.isArray(result) ? result : []).map(dashboardSummaryToCatalogEntry)
    catalog.value = [...local, ...remote.filter(item => !local.some(entry => entry.id === item.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch (error) {
    if (revision !== refreshRevision) return
    catalog.value = local
    loadError.value = error?.message || '看板目录加载失败'
  } finally { if (revision === refreshRevision) loading.value = false }
}
function openCreate() { form.value = { name: '', description: '', dashboardType: 'custom', category: '', scope: 'personal', mode: 'blank', templateId: templates.value[0]?.id || '' }; creating.value = true }
function open(id) { router.push({ name: 'Dashboard', query: { id } }) }
function edit(id) { router.push({ name: 'Dashboard', query: { id, edit: '1' } }) }
function create() { try { const template = form.value.mode === 'template' ? templates.value.find(item => item.id === form.value.templateId) : null; const schema = createLocalDashboard(form.value, { template, storage: localStorage }); creating.value = false; refresh(); notifyDashboardCatalogChanged(); edit(schema.id) } catch (error) { ElMessage.error(error.message || '创建看板失败') } }
function copy(id) { try { const schema = duplicateLocalDashboard(id, localStorage); refresh(); notifyDashboardCatalogChanged(); ElMessage.success('已创建副本'); edit(schema.id) } catch (error) { ElMessage.error(error.message || '复制失败') } }
async function menu(command, item) {
  try {
    if (command === 'copy') {
      if (item.origin !== 'remote') return copy(item.id)
      const detail = await copyDashboard(item.id, { name: `${item.name} - 副本` })
      const id = detail?.dashboard?.id || detail?.id
      await refresh()
      notifyDashboardCatalogChanged()
      ElMessage.success('已创建副本')
      if (id) edit(String(id))
    } else if (command === 'rename') {
      const { value } = await ElMessageBox.prompt('请输入新名称', '重命名看板', { inputValue: item.name, inputValidator: value => String(value || '').trim() ? true : '名称不能为空' })
      if (item.origin === 'remote') {
        const detail = await fetchDashboardDefinition(item.id)
        const schema = dashboardDetailToSchema(detail)
        await saveDashboard(item.id, schemaToDashboardPayload({ ...schema, name: value.trim() }, { resourceVersion: dashboardDetailMeta(detail).resourceVersion }))
      } else renameLocalDashboard(item.id, value, localStorage)
      await refresh()
      notifyDashboardCatalogChanged()
      ElMessage.success('已重命名')
    } else if (command === 'delete') {
      await ElMessageBox.confirm(`确认删除“${item.name}”？删除后将无法继续查看此看板。`, '删除看板', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
      if (item.origin === 'remote') await deleteDashboard(item.id)
      else removeLocalDashboard(item.id, localStorage)
      await refresh()
      notifyDashboardCatalogChanged()
      ElMessage.success('已删除')
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '看板操作失败')
  }
}
function typeLabel(value) { return typeOptions.find(item => item.value === value)?.label || value }
function scopeLabel(value) { return ({ hospital: '全院', department: '科室', personal: '个人' })[value] || value }
function formatDate(value) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—' }
refresh()
</script>
<style scoped>
.dashboard-management{max-width:1440px;margin:0 auto}.page-description{color:#667085;font-size:13px}.dashboard-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:4px 0 20px;padding:12px 14px;border:1px solid #e6ebef;border-radius:8px;background:#fff}.dashboard-search{width:min(360px,100%)}.dashboard-toolbar__summary{display:flex;align-items:center;gap:14px;white-space:nowrap}.dashboard-count{color:#7b8794;font-size:12px}.dashboard-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.dashboard-card{display:flex;min-width:0;min-height:260px;flex-direction:column;box-sizing:border-box;padding:20px;border:1px solid #e1e7ec;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.04);transition:border-color .18s ease,box-shadow .18s ease}.dashboard-card:hover{border-color:#b8cfdf;box-shadow:0 5px 16px rgba(30,80,112,.09)}.dashboard-card__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dashboard-card__header h2{min-width:0;overflow:hidden;margin:0;color:#1f2d38;font-size:16px;font-weight:650;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}.dashboard-card__header .el-tag{flex:none;margin-top:1px}.dashboard-card__description{display:-webkit-box;min-height:42px;overflow:hidden;margin:14px 0 18px;color:#667085;font-size:13px;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:2}.dashboard-card__metadata{display:flex;align-items:center;gap:8px;color:#465665;font-size:12px}.dashboard-card__metadata i{width:3px;height:3px;border-radius:50%;background:#a9b4bd}.dashboard-card__updated{margin-top:9px;color:#98a2ad;font-size:11px}.dashboard-card__actions{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:18px;border-top:1px solid #edf0f2}.dashboard-card__actions .el-dropdown{margin-left:auto}.dashboard-card__actions :deep(.el-button){min-width:64px}.dashboard-card__actions .el-dropdown :deep(.el-button){min-width:38px;padding-inline:10px}
.create-form__metadata{display:grid;grid-template-columns:2fr 1fr 1fr;gap:0 16px}.create-form__metadata .el-form-item:nth-child(1),.create-form__metadata .el-form-item:nth-child(2){grid-column:span 2}.creation-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:100%}.creation-mode{display:grid;grid-template-columns:76px 1fr;grid-template-rows:auto auto;gap:4px 14px;align-items:center;padding:14px;border:1px solid #d9e0e6;border-radius:8px;background:#fff;color:#344054;text-align:left;cursor:pointer}.creation-mode:hover{border-color:#86b7df;background:#f8fbff}.creation-mode.is-selected{border-color:#1261a6;background:#f2f8fd;box-shadow:0 0 0 1px #1261a6}.creation-mode>span{grid-row:1 / span 2;width:76px;height:48px}.creation-mode strong{align-self:end;font-size:14px}.creation-mode small{align-self:start;color:#667085;line-height:1.45}.blank-preview,.template-preview-icon{display:grid;gap:4px;box-sizing:border-box;padding:5px;border:1px solid #c9d6df;border-radius:5px;background:#f8fafc}.blank-preview{grid-template-columns:repeat(3,1fr)}.blank-preview i{border:1px dashed #9db1bf;border-radius:2px;background:#fff}.template-preview-icon{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr)}.template-preview-icon i{border-radius:2px;background:#8bb8db}.template-preview-icon i:first-child{grid-row:span 2;background:#397fad}.template-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:100%;max-height:390px;overflow-y:auto;padding:2px}.template-card{position:relative;display:grid;gap:9px;min-width:0;padding:10px;border:1px solid #d9e0e6;border-radius:8px;background:#fff;text-align:left;cursor:pointer}.template-card:hover{border-color:#86b7df}.template-card.is-selected{border-color:#1261a6;box-shadow:0 0 0 1px #1261a6}.template-card__canvas{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;height:98px;padding:6px;border-radius:5px;background:#edf3f7}.template-card__canvas i{min-width:0;min-height:0;border-radius:2px;opacity:.9}.template-card__copy{display:grid;gap:3px;min-width:0}.template-card__copy strong{font-size:13px}.template-card__copy small{display:-webkit-box;overflow:hidden;color:#667085;font-size:11px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}.template-card__selected{position:absolute;top:16px;right:16px;padding:2px 6px;border-radius:999px;background:#1261a6;color:#fff;font-size:10px}
@media(max-width:1100px){.dashboard-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.dashboard-toolbar{align-items:stretch;flex-direction:column}.dashboard-search{width:100%}.dashboard-toolbar__summary{justify-content:space-between}.dashboard-cards{grid-template-columns:1fr}.dashboard-card{min-height:240px}.create-form__metadata{display:block}.creation-modes,.template-gallery{grid-template-columns:1fr}.template-gallery{max-height:420px}}
</style>
