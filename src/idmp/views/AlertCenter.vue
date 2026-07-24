<template>
  <div class="idmp-page alert-center">
    <PageHeader title="预警中心" />

    <section class="alert-stat-grid" aria-label="预警统计">
      <article
        v-for="item in decoratedStats"
        :key="item.label"
        class="surface-card alert-stat"
        :class="`alert-stat--${item.tone}`"
      >
        <span class="alert-stat__icon">
          <el-icon><component :is="item.icon" /></el-icon>
        </span>
        <div>
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </div>
      </article>
    </section>

    <section class="surface-card alert-table-card" aria-label="预警列表">
      <div class="alert-table-heading">
        <div>
          <h2>预警列表</h2>
          <p>按预警时间倒序展示当前指标异常</p>
        </div>
        <span>共 {{ rows.length }} 条演示预警</span>
      </div>

      <div class="table-scroll">
        <el-table
          :data="rows"
          :row-class-name="alertRowClassName"
          table-layout="fixed"
          class="alert-table"
        >
          <el-table-column label="预警级别" width="112">
            <template #default="{ row }">
              <span class="status-pill" :class="levelClass(row.level)">
                {{ row.level }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="预警类型" width="132" />
          <el-table-column
            prop="indicator"
            label="指标名称"
            min-width="220"
            show-overflow-tooltip
          />
          <el-table-column prop="scene" label="所属场景" width="126" />
          <el-table-column label="实际值" width="122">
            <template #default="{ row }">
              <strong :class="{ 'actual-danger': row.level === '严重' }">
                {{ row.actual }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column prop="threshold" label="预警阈值" min-width="148" show-overflow-tooltip />
          <el-table-column prop="time" label="预警时间" width="128" />
          <el-table-column label="处理状态" width="116">
            <template #default="{ row }">
              <span class="status-pill" :class="statusClass(row.status)">
                {{ row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="174" fixed="right">
            <template #default="{ row }">
              <button
                type="button"
                class="action-link"
                @click="viewAlert(row)"
              >
                查看
              </button>
              <button
                type="button"
                class="action-link"
                :class="{ 'is-disabled': row.status === '已确认' }"
                :disabled="row.status === '已确认'"
                @click="confirmHandled(row)"
              >
                {{ row.status === '已确认' ? '已处理' : '标记处理' }}
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { markRaw, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Clock, InfoFilled, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { alertRows, alertStats } from '@/idmp/data/demo'

const rows = ref(alertRows.map((item) => ({ ...item })))

const statIcons = {
  danger: markRaw(WarningFilled),
  warning: markRaw(Bell),
  info: markRaw(InfoFilled),
  pending: markRaw(Clock)
}

const decoratedStats = alertStats.map((item) => ({
  ...item,
  icon: statIcons[item.tone]
}))

const levelClass = (level) => {
  if (level === '严重') return 'is-danger'
  if (level === '警告') return 'is-warning'
  return 'is-info'
}

const statusClass = (status) => {
  if (status === '待处理') return 'is-danger'
  if (status === '处理中') return 'is-info'
  return ''
}

const alertRowClassName = ({ row }) => {
  if (row.level === '严重' && row.status !== '已确认') return 'severe-row'
  return ''
}

const viewAlert = (row) => {
  ElMessage.info(`正在查看“${row.indicator}”预警详情（演示）`)
}

const confirmHandled = (row) => {
  if (row.status === '已确认') return

  ElMessageBox.confirm(
    `确认将“${row.indicator}”本条预警标记为已处理吗？`,
    '标记处理',
    {
      confirmButtonText: '确认处理',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(() => {
      row.status = '已确认'
      ElMessage.success('预警已标记为处理完成')
    })
    .catch(() => {})
}
</script>

<style scoped lang="scss">
.alert-center {
  min-width: 0;
}

.alert-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.alert-stat {
  display: flex;
  min-height: 96px;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
}

.alert-stat__icon {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 50%;
  background: #fff2f0;
  color: #f5222d;
  font-size: 21px;
}

.alert-stat > div {
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: #f5222d;
    font-size: 27px;
    font-weight: 650;
    line-height: 32px;
  }

  span {
    color: #8c8c8c;
    font-size: 13px;
    line-height: 20px;
  }
}

.alert-stat--warning {
  .alert-stat__icon {
    background: #fffbe6;
    color: #faad14;
  }

  strong {
    color: #fa8c16;
  }
}

.alert-stat--info {
  .alert-stat__icon {
    background: #e6f7ff;
    color: #1890ff;
  }

  strong {
    color: #1890ff;
  }
}

.alert-stat--pending {
  .alert-stat__icon {
    background: #fff7e6;
    color: #fa8c16;
  }

  strong {
    color: #fa8c16;
  }
}

.alert-table-card {
  min-width: 0;
  padding: 16px 16px 10px;
  overflow: hidden;
}

.alert-table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 3px;
    color: #262626;
    font-size: 16px;
    line-height: 23px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }

  > span {
    color: #8c8c8c;
    font-size: 13px;
    white-space: nowrap;
  }
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.alert-table {
  min-width: 1200px;

  :deep(th.el-table__cell) {
    height: 45px;
    padding: 0;
    color: #262626;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 53px;
    padding: 0;
    color: #3f4146;
  }

  :deep(.severe-row td.el-table__cell) {
    background: #fffafa !important;
  }
}

.actual-danger {
  color: #f5222d;
}

.action-link.is-disabled {
  color: #bfbfbf;
  cursor: not-allowed;

  &:hover {
    color: #bfbfbf;
  }
}

@media (max-width: 1450px) {
  .alert-stat-grid {
    gap: 12px;
  }
}
</style>
