<template>
  <section class="publish-layout">
    <article class="surface-card publish-gates">
      <div class="section-title">
        <div>
          <h2>发布门禁</h2>
          <p class="section-title__description">仅展示当前前端能够判断的状态，不替代后端最终校验</p>
        </div>
      </div>
      <ul>
        <li v-for="gate in gates" :key="gate.label" :class="`is-${gate.state}`">
          <span class="publish-gate__mark" aria-hidden="true" />
          <div>
            <strong>{{ gate.label }}</strong>
            <p>{{ gate.description }}</p>
          </div>
          <span>{{ gate.stateLabel }}</span>
        </li>
      </ul>
    </article>
    <article class="surface-card publish-action-card">
      <div class="section-title">
        <div>
          <h2>发布指标版本</h2>
          <p class="section-title__description">调用当前后端接口发布已编译并试算通过的指标版本。</p>
        </div>
      </div>
      <div class="publish-action-content">
        <StatePanel
          :type="workflow.published ? 'empty' : 'permission'"
          :title="workflow.published ? '指标版本已发布' : '等待发布条件'"
          :description="description"
        />
      </div>
      <div class="business-action-bar publish-actions">
        <div>
          <span>当前指标版本</span>
          <small class="mono-data">{{ workflow.versionId || '尚未创建' }}</small>
        </div>
        <el-button
          type="primary"
          :disabled="!workflow.versionId || workflow.published || policyState.loading || policyState.saving"
          :loading="loading.publish"
          @click="emit('publish')"
        >
          发布指标版本
        </el-button>
        <el-button v-if="workflow.published && (policyDrafts.length || policyState.error)" type="warning" :loading="policyState.saving" @click="emit('retry-policy')">重试保存政策来源</el-button>
        <el-button v-if="workflow.published && !isStatic && !temporaryParameters" plain :loading="loading.formal" v-access="'calc.calculation.create'" @click="emit('formal-result')">独立正式计算并查看结果</el-button>

      </div>
    </article>
  </section>
</template>
<script setup>
import StatePanel from '../../../components/StatePanel.vue'
defineProps({ workflow: { type: Object, required: true }, loading: { type: Object, required: true },
  policyState: { type: Object, required: true }, policyDrafts: { type: Array, default: () => [] },
  isStatic: Boolean, temporaryParameters: Boolean, description: String, gates: { type: Array, required: true } })
const emit = defineEmits(['publish', 'retry-policy', 'formal-result'])
</script>
<style scoped lang="scss">
.publish-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 16px;
}

.publish-gates {
  padding: 18px;
}

.publish-action-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 18px;
}

.publish-action-content {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
}

.publish-action-content :deep(.state-panel) {
  width: 100%;
}

.publish-actions {
  align-items: flex-end;
}

.publish-actions small {
  overflow-wrap: anywhere;
}

.publish-gates ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.publish-gates li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 60px;
  padding: 8px 4px;
  gap: 12px;
  border-top: 1px solid var(--idmp-border-soft);

  strong {
    color: var(--idmp-text-primary);
    font-size: 13px;
  }

  p {
    margin: 2px 0 0;
    color: var(--idmp-text-helper);
    font-size: 11px;
  }

  > span:last-child {
    color: var(--idmp-text-secondary);
    font-size: 12px;
  }
}

.publish-gate__mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--idmp-border-strong);
}

.publish-gates li.is-pass .publish-gate__mark {
  background: var(--idmp-support-success);
}

.publish-gates li.is-warning .publish-gate__mark,
.publish-gates li.is-blocked .publish-gate__mark {
  background: var(--idmp-support-warning);
}

.business-action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--idmp-border-soft);

  > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
    gap: 2px;
  }

  span {
    color: var(--idmp-text-primary);
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

@media (max-width: 1280px) { .publish-layout { grid-template-columns: 1fr; } }
</style>
