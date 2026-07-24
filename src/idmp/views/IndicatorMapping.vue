<template>
  <div class="idmp-page indicator-mapping">
    <PageHeader title="指标映射管理">
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="showLightResult('手动创建映射')">
            手动创建映射
          </el-button>
          <el-button :icon="MagicStick" @click="confirmRecommend">自动推荐</el-button>
          <el-button :icon="Document" @click="showUnavailable">生成报告</el-button>
          <el-button :icon="Upload" @click="showUnavailable">批量导入</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="mapping-stat-grid" aria-label="映射统计">
      <article
        v-for="item in mappingStats"
        :key="item.label"
        class="surface-card mapping-stat"
        :class="`mapping-stat--${item.tone}`"
      >
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </article>
    </section>

    <section class="surface-card mapping-table-card" aria-label="映射关系列表">
      <div class="table-scroll">
        <el-table
          :data="rows"
          :row-class-name="mappingRowClassName"
          table-layout="fixed"
          class="mapping-table"
        >
          <el-table-column label="源指标" min-width="250">
            <template #default="{ row }">
              <div class="indicator-cell">
                <span class="indicator-cell__code indicator-cell__code--source">
                  {{ row.sourceCode }}
                </span>
                <span class="indicator-cell__name">{{ row.sourceName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="目标指标" min-width="250">
            <template #default="{ row }">
              <div class="indicator-cell">
                <span class="indicator-cell__code indicator-cell__code--target">
                  {{ row.targetCode }}
                </span>
                <span class="indicator-cell__name">{{ row.targetName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="映射类型" width="150">
            <template #default="{ row }">
              <span
                class="status-pill"
                :class="{ 'is-warning': row.type !== '完全一致' }"
              >
                {{ row.type }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="112">
            <template #default="{ row }">
              <strong
                class="confidence"
                :class="row.confidence >= 90 ? 'confidence--high' : 'confidence--medium'"
              >
                {{ row.confidence }}%
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="审核状态" width="132">
            <template #default="{ row }">
              <span
                class="status-pill"
                :class="{ 'is-danger': row.status !== '已审核' }"
              >
                {{ row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="difference" label="差异说明" min-width="230" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="{ 'difference--pending': row.status === '待审核' }">
                {{ row.difference }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="144" fixed="right">
            <template #default="{ row }">
              <button
                class="action-link"
                type="button"
                @click="row.status === '待审核' ? reviewMapping(row) : showLightResult('查看映射')"
              >
                {{ row.status === '待审核' ? '审核' : '查看' }}
              </button>
              <button class="action-link" type="button" @click="showLightResult('编辑映射')">
                编辑
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="table-footer">共 {{ rows.length }} 条演示映射关系</div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, MagicStick, Plus, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { mappingRows, mappingStats } from '@/idmp/data/demo'

const rows = ref(mappingRows.map((item) => ({ ...item })))

const mappingRowClassName = ({ row }) => (row.status === '待审核' ? 'pending-row' : '')

const showUnavailable = () => {
  ElMessage.info('演示版暂不可用')
}

const showLightResult = (action) => {
  ElMessage.success(`${action}操作已触发`)
}

const confirmRecommend = () => {
  ElMessageBox.confirm('是否基于指标名称、口径与公式进行自动推荐？', '自动推荐', {
    confirmButtonText: '开始推荐',
    cancelButtonText: '取消',
    type: 'info'
  })
    .then(() => ElMessage.success('自动推荐已完成（演示）'))
    .catch(() => {})
}

const reviewMapping = (row) => {
  ElMessageBox.confirm(
    `确认通过 ${row.sourceCode} 与 ${row.targetCode} 的映射关系吗？`,
    '映射审核',
    {
      confirmButtonText: '审核通过',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(() => {
      ElMessage.success('映射审核操作已确认（演示）')
    })
    .catch(() => {})
}
</script>

<style scoped lang="scss">
.indicator-mapping {
  min-width: 0;
}

.mapping-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(132px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.mapping-stat {
  display: flex;
  min-height: 74px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  text-align: center;

  strong {
    color: #1f2329;
    font-size: 26px;
    line-height: 30px;
  }

  span {
    color: #8c8c8c;
    font-size: 13px;
    line-height: 20px;
  }
}

.mapping-stat--green strong {
  color: #52c41a;
}

.mapping-stat--orange strong,
.mapping-stat--gold strong {
  color: #faad14;
}

.mapping-stat--red strong {
  color: #f5222d;
}

.mapping-table-card {
  min-width: 0;
  padding: 16px 16px 10px;
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.mapping-table {
  min-width: 1120px;

  :deep(th.el-table__cell) {
    height: 46px;
    padding: 0;
    color: #1f2329;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 58px;
    padding: 0;
    color: #31343a;
  }

  :deep(.pending-row td.el-table__cell) {
    background: #fffbe6 !important;
  }
}

.indicator-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.indicator-cell__code {
  overflow: hidden;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indicator-cell__code--source {
  color: #168ad3;
}

.indicator-cell__code--target {
  color: #7a5eb3;
}

.indicator-cell__name {
  overflow: hidden;
  color: #31343a;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confidence {
  font-size: 14px;
}

.confidence--high {
  color: #52c41a;
}

.confidence--medium {
  color: #d9980d;
}

.difference--pending {
  color: #d9980d;
}

.action-link {
  margin-right: 0;
  padding: 0;
  color: #1890ff;
  font: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;

  & + & {
    margin-left: 15px;
  }
}

.table-footer {
  padding: 12px 4px 2px;
  color: #8c8c8c;
  font-size: 13px;
}

@media (max-width: 1450px) {
  .mapping-stat-grid {
    gap: 10px;
  }
}
</style>
