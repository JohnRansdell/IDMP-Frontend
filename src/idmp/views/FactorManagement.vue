<template>
  <div class="idmp-page factor-management">
    <PageHeader
      title="因子管理"
      status-label="演示目录 + 后端新增流程"
      status-tone="info"
    >
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="openFactorEditor('new')">
            新增因子
          </el-button>
          <el-button :icon="Upload" @click="showUnavailable('批量导入')">批量导入</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="filter-card factor-filter" aria-label="因子筛选">
      <el-form :inline="true" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="form.code"
            clearable
            placeholder="因子编码"
            aria-label="按因子编码筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            clearable
            placeholder="因子名称"
            aria-label="按因子名称筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" clearable placeholder="因子类型" aria-label="按因子类型筛选">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" clearable placeholder="业务分类" aria-label="按业务分类筛选">
            <el-option
              v-for="category in categoryOptions"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.status" clearable placeholder="发布状态" aria-label="按发布状态筛选">
            <el-option label="已发布" value="已发布" />
            <el-option label="草稿" value="草稿" />
            <el-option label="待发布" value="待发布" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="surface-card factor-table-card" aria-label="因子列表">
      <div class="table-card-head">
        <div>
          <h2>因子目录</h2>
          <p>维护可被指标公式引用的计算因子，发布后的版本进入正式计算链路。</p>
        </div>
        <el-tag type="info" effect="plain">列表为演示目录，新增因子流程已接入后端</el-tag>
      </div>

      <div class="table-scroll">
        <el-table
          :data="filteredRows"
          table-layout="fixed"
          empty-text="暂无符合条件的因子"
          class="factor-table"
        >
          <el-table-column prop="code" label="因子编码" width="122">
            <template #default="{ row }">
              <button class="code-link" type="button" @click="openFactorEditor(row.code)">
                {{ row.code }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="因子名称" min-width="250" show-overflow-tooltip />
          <el-table-column label="类型" width="92">
            <template #default="{ row }">{{ row.type.replace('因子', '') }}</template>
          </el-table-column>
          <el-table-column prop="category" label="业务分类" width="110" />
          <el-table-column prop="aggregation" label="聚合方式" width="145" />
          <el-table-column prop="domain" label="数据域" min-width="150" show-overflow-tooltip />
          <el-table-column label="引用次数" width="104" align="center">
            <template #default="{ row }">
              <span class="reference-count">{{ row.references }}</span>
            </template>
          </el-table-column>
          <el-table-column label="发布状态" width="112">
            <template #default="{ row }">
              <StatusBadge
                :status="row.status === '已发布' ? 'PUBLISHED' : 'DRAFT'"
                :label="row.status"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="184" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="openFactorEditor(row.code)">
                查看
              </button>
              <button class="action-link" type="button" @click="openFactorEditor(row.code)">
                编辑
              </button>
              <button class="action-link" type="button" @click="showUnavailable(`${row.name}引用分析`)">
                引用分析
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="table-footer">
        <span v-if="hasActiveFilters">筛选到 {{ filteredRows.length }} 条因子</span>
        <span v-else>共 35 条</span>
        <span class="table-footer__hint">当前展示 {{ filteredRows.length }} 条</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { factorRows } from '@/idmp/data/demo'

const router = useRouter()

const emptyFilters = () => ({
  code: '',
  name: '',
  type: '',
  category: '',
  status: ''
})

const form = reactive(emptyFilters())
const filters = reactive(emptyFilters())

const categoryOptions = [...new Set(factorRows.map((item) => item.category))]

const hasActiveFilters = computed(() => Object.values(filters).some(Boolean))

const filteredRows = computed(() => {
  const code = filters.code.toLowerCase()
  const name = filters.name.toLowerCase()

  return factorRows.filter((row) => {
    return (
      (!code || row.code.toLowerCase().includes(code)) &&
      (!name || row.name.toLowerCase().includes(name)) &&
      (!filters.type || row.type === filters.type) &&
      (!filters.category || row.category === filters.category) &&
      (!filters.status || row.status === filters.status)
    )
  })
})

const applyFilters = () => {
  Object.assign(filters, form)
}

const resetFilters = () => {
  Object.assign(form, emptyFilters())
  Object.assign(filters, emptyFilters())
}

const openFactorEditor = (id) => {
  router.push(`/factor/edit/${encodeURIComponent(id)}`)
}

const showUnavailable = (capability) => {
  ElMessage.info(`${capability}尚未接入真实接口，当前演示列表不会伪造操作结果。`)
}
</script>

<style scoped lang="scss">
.factor-management {
  min-width: 0;
}

.factor-filter {
  margin-bottom: 16px;
  padding: 16px;

  :deep(.el-form) {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  :deep(.el-form-item) {
    margin: 0;
  }

  :deep(.el-input) {
    width: 178px;
  }

  :deep(.el-select) {
    width: 140px;
  }
}

.filter-actions {
  margin-left: 2px !important;
}

.factor-table-card {
  min-width: 0;
  padding: 16px 16px 12px;
}

.table-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 4px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.factor-table {
  min-width: 1080px;

  :deep(th.el-table__cell) {
    height: 46px;
    padding: 0;
    color: var(--idmp-text-primary);
    font-weight: 600;
    background: var(--idmp-layer-02);
  }

  :deep(td.el-table__cell) {
    height: 47px;
    padding: 0;
    color: var(--idmp-text-secondary);
  }

  :deep(.cell) {
    line-height: 20px;
  }
}

.code-link,
.action-link {
  padding: 0;
  font: inherit;
  color: var(--idmp-interactive);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.code-link {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.action-link {
  margin-right: 0;

  & + & {
    margin-left: 13px;
  }
}

.reference-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  color: var(--idmp-support-info);
  font-size: 12px;
  line-height: 22px;
  background: var(--idmp-support-info-bg);
  border-radius: var(--idmp-radius-sm);
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  padding: 11px 4px 0;
  color: var(--idmp-text-helper);
  font-size: 13px;
}

.table-footer__hint {
  color: var(--idmp-text-disabled);
}

@media (max-width: 1450px) {
  .factor-filter {
    :deep(.el-input) {
      width: 158px;
    }
  }
}
</style>
