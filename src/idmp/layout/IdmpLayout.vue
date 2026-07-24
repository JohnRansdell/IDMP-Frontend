<template>
  <div class="idmp-shell">
    <aside class="idmp-sidebar">
      <div class="idmp-brand">
        <el-icon :size="24"><DataAnalysis /></el-icon>
        <span>IDMP 指标管理平台</span>
      </div>

      <nav class="idmp-nav" aria-label="主导航">
        <template v-for="item in navItems" :key="item.label">
          <RouterLink
            v-if="!item.disabled"
            :to="item.path"
            class="idmp-nav__item"
            :class="{ 'is-active': activePath === item.path }"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </RouterLink>
          <div v-else class="idmp-nav__item is-disabled" aria-disabled="true">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </div>
        </template>
      </nav>
    </aside>

    <header class="idmp-topbar">
      <div class="idmp-breadcrumb" aria-label="面包屑">
        <template v-for="(item, index) in breadcrumbs" :key="`${item}-${index}`">
          <span>{{ item }}</span>
          <span v-if="index < breadcrumbs.length - 1" class="separator">/</span>
        </template>
      </div>

      <div class="idmp-topbar__right">
        <span class="scene-label">当前场景：</span>
        <el-select v-model="currentScene" class="scene-select" aria-label="当前场景">
          <el-option v-for="scene in sceneOptions" :key="scene" :label="scene" :value="scene" />
        </el-select>
        <el-badge :value="5" class="notification-badge">
          <el-button text circle aria-label="通知">
            <el-icon :size="20"><Bell /></el-icon>
          </el-button>
        </el-badge>
        <div class="idmp-user">
          <el-avatar :size="32">管</el-avatar>
          <span>指标管理员</span>
        </div>
      </div>
    </header>

    <main class="idmp-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed, markRaw, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  Aim,
  Bell,
  Connection,
  DataAnalysis,
  EditPen,
  Folder,
  Histogram,
  Link,
  List,
  Setting,
  TrendCharts
} from '@element-plus/icons-vue'
import { sceneOptions } from '@/idmp/data/demo'

const route = useRoute()
const currentScene = ref(sceneOptions[0])

const navItems = [
  { label: '指标看板', path: '/dashboard', icon: markRaw(Histogram) },
  { label: '指标管理', path: '/indicator', icon: markRaw(List) },
  { label: '指标编辑', path: '/indicator/edit', icon: markRaw(EditPen) },
  { label: '因子管理', path: '/factor', icon: markRaw(Connection) },
  { label: '场景管理', path: '/scene', icon: markRaw(Aim) },
  { label: '指标映射', path: '/mapping', icon: markRaw(Link) },
  { label: '指标分析', path: '/analysis', icon: markRaw(TrendCharts) },
  { label: '预警中心', path: '/alerts', icon: markRaw(Bell) },
  { label: '数据管理', path: '', icon: markRaw(Folder), disabled: true },
  { label: '系统管理', path: '', icon: markRaw(Setting), disabled: true }
]

const activePath = computed(() => route.meta.activeMenu || route.path)
const breadcrumbs = computed(() => route.meta.breadcrumb || ['首页'])
</script>
