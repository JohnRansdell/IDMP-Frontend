<template>
  <div class="idmp-page factor-management">
    <PageHeader title="因子管理">
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="handleLightAction('新增因子')">
            新增因子
          </el-button>
          <el-button :icon="Upload" @click="showUnavailable">批量导入</el-button>
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
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            clearable
            placeholder="因子名称"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" clearable placeholder="因子类型">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" clearable placeholder="业务分类">
            <el-option
              v-for="category in categoryOptions"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="surface-card factor-table-card" aria-label="因子列表">
      <div class="table-scroll">
        <el-table
          :data="filteredRows"
          table-layout="fixed"
          empty-text="暂无符合条件的因子"
          class="factor-table"
        >
          <el-table-column prop="code" label="因子编码" width="104">
            <template #default="{ row }">
              <button class="code-link" type="button" @click="handleLightAction('查看因子')">
                {{ row.code }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="因子名称" min-width="250" show-overflow-tooltip />
          <el-table-column label="类型" width="88">
            <template #default="{ row }">{{ row.type.replace('因子', '') }}</template>
          </el-table-column>
          <el-table-column prop="category" label="业务分类" width="102" />
          <el-table-column prop="aggregation" label="聚合方式" width="145" />
          <el-table-column prop="domain" label="数据域" min-width="145" show-overflow-tooltip />
          <el-table-column label="引用次数" width="102" align="center">
            <template #default="{ row }">
              <span class="reference-count">{{ row.references }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="106">
            <template #default="{ row }">
              <span
                class="status-pill"
                :class="{ 'is-muted': row.status !== '已发布' }"
              >
                {{ row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="188" fixed="right">
            <template #default>
              <button class="action-link" type="button" @click="handleLightAction('查看因子')">
                查看
              </button>
              <button class="action-link" type="button" @click="handleLightAction('编辑因子')">
                编辑
              </button>
              <button class="action-link" type="button" @click="handleLightAction('引用分析')">
                引用分析
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="table-footer">
        <span v-if="hasActiveFilters">筛选到 {{ filteredRows.length }} 条演示数据</span>
        <span v-else>共 35 条</span>
        <span class="table-footer__hint">当前展示 {{ filteredRows.length }} 条</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { factorRows } from '@/idmp/data/demo'

const emptyFilters = () => ({
  code: '',
  name: '',
  type: '',
  category: ''
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
      (!filters.category || row.category === filters.category)
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

const showUnavailable = () => {
  ElMessage.info('演示版暂不可用')
}

const handleLightAction = (action) => {
  ElMessage.success(`${action}操作已触发`)
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
    width: 136px;
  }
}

.filter-actions {
  margin-left: 2px !important;
}

.factor-table-card {
  min-width: 0;
  padding: 16px 16px 12px;
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
    color: #1f2329;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 47px;
    padding: 0;
    color: #31343a;
  }

  :deep(.cell) {
    line-height: 20px;
  }
}

.code-link,
.action-link {
  padding: 0;
  font: inherit;
  color: #1890ff;
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
  color: #168ad3;
  font-size: 12px;
  line-height: 22px;
  background: #eaf7ff;
  border-radius: 11px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  padding: 11px 4px 0;
  color: #8c8c8c;
  font-size: 13px;
}

.table-footer__hint {
  color: #b0b3b8;
}

@media (max-width: 1450px) {
  .factor-filter {
    :deep(.el-input) {
      width: 158px;
    }
  }
}
</style>
