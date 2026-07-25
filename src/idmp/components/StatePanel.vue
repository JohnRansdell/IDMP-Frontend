<template>
  <div class="state-panel" :class="`is-${type}`" :role="role" :aria-live="ariaLive">
    <el-icon class="state-panel__icon" aria-hidden="true">
      <component :is="icon" />
    </el-icon>
    <div class="state-panel__content">
      <h3>{{ resolvedTitle }}</h3>
      <p>{{ resolvedDescription }}</p>
      <div v-if="$slots.actions" class="state-panel__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw } from 'vue'
import {
  CircleClose,
  DataLine,
  Loading,
  Lock,
  Warning
} from '@element-plus/icons-vue'

const props = defineProps({
  type: {
    type: String,
    default: 'empty',
    validator: (value) => ['loading', 'empty', 'error', 'permission', 'unavailable'].includes(value)
  },
  title: { type: String, default: '' },
  description: { type: String, default: '' }
})

const presets = {
  loading: {
    title: '正在加载',
    description: '请稍候，正在获取最新数据。',
    icon: markRaw(Loading)
  },
  empty: {
    title: '暂无数据',
    description: '当前条件下没有可展示的记录。',
    icon: markRaw(DataLine)
  },
  error: {
    title: '加载失败',
    description: '未能获取数据，请检查连接后重试。',
    icon: markRaw(CircleClose)
  },
  permission: {
    title: '权限不足',
    description: '当前账号无权查看此内容，请联系系统管理员。',
    icon: markRaw(Lock)
  },
  unavailable: {
    title: '能力暂不可用',
    description: '当前后端尚未提供此能力。',
    icon: markRaw(Warning)
  }
}

const currentPreset = computed(() => presets[props.type])
const icon = computed(() => currentPreset.value.icon)
const resolvedTitle = computed(() => props.title || currentPreset.value.title)
const resolvedDescription = computed(() => props.description || currentPreset.value.description)
const role = computed(() => (props.type === 'error' ? 'alert' : 'status'))
const ariaLive = computed(() => (props.type === 'error' ? 'assertive' : 'polite'))
</script>
