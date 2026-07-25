<template>
  <div class="idmp-shell">
    <aside class="idmp-sidebar">
      <RouterLink to="/dashboard" class="idmp-brand" aria-label="返回指标总览">
        <span class="idmp-brand__mark">
          <el-icon :size="18"><DataAnalysis /></el-icon>
        </span>
        <span class="idmp-brand__copy">
          <span class="idmp-brand__title">IDMP</span>
          <span class="idmp-brand__subtitle">医疗质量指标平台</span>
        </span>
      </RouterLink>

      <nav class="idmp-nav" aria-label="主导航">
        <section
          v-for="group in navGroups"
          :key="group.label"
          class="idmp-nav__group"
          :aria-labelledby="group.id"
        >
          <div :id="group.id" class="idmp-nav__group-label">{{ group.label }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="idmp-nav__item"
            :class="{ 'is-active': activePath === item.path }"
            :aria-current="activePath === item.path ? 'page' : undefined"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="idmp-sidebar__foot">
        Clinical Carbon UI<br />
        业务能力以当前接口为准
      </div>
    </aside>

    <header class="idmp-topbar">
      <div class="idmp-breadcrumb" aria-label="面包屑">
        <template v-for="(item, index) in displayBreadcrumbs" :key="`${item}-${index}`">
          <RouterLink v-if="index === 0" to="/dashboard">{{ item }}</RouterLink>
          <span v-else>{{ item }}</span>
          <span v-if="index < displayBreadcrumbs.length - 1" class="separator">/</span>
        </template>
      </div>

      <div class="idmp-topbar__right">
        <div class="idmp-context">
          <span class="scene-label">全局场景</span>
          <el-select v-model="currentScene" class="scene-select" aria-label="全局场景">
            <el-option v-for="scene in sceneOptions" :key="scene" :label="scene" :value="scene" />
          </el-select>
        </div>
        <el-tooltip content="查看预警中心" placement="bottom">
          <el-badge :value="5" class="notification-badge">
            <el-button text circle aria-label="查看 5 条待处理预警" @click="router.push('/alerts')">
              <el-icon :size="19"><Bell /></el-icon>
            </el-button>
          </el-badge>
        </el-tooltip>
        <div class="idmp-user">
          <el-avatar :size="30">管</el-avatar>
          <span class="idmp-user__copy">
            <span class="idmp-user__name">指标管理员</span>
            <span class="idmp-user__role">质量管理中心</span>
          </span>
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
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Aim,
  Bell,
  Connection,
  DataAnalysis,
  Folder,
  Histogram,
  Link,
  List,
  Monitor,
  Setting,
  TrendCharts
} from '@element-plus/icons-vue'
import { sceneOptions } from '@/idmp/data/demo'
import { DEFAULT_ANALYSIS_INDICATOR, getAnalysisProfile } from '@/idmp/features/analysis/indicatorProfiles'

const route = useRoute()
const router = useRouter()
const currentScene = ref(sceneOptions[0])

const navGroups = [
  {
    id: 'nav-overview',
    label: '总览与分析',
    items: [
      { label: '指标总览', path: '/dashboard', icon: markRaw(Histogram) },
      { label: '指标分析', path: '/analysis', icon: markRaw(TrendCharts) },
      { label: '预警中心', path: '/alerts', icon: markRaw(Bell) }
    ]
  },
  {
    id: 'nav-indicator',
    label: '指标配置',
    items: [
      { label: '指标目录', path: '/indicator', icon: markRaw(List) },
      { label: '因子管理', path: '/factor', icon: markRaw(Connection) },
      { label: '场景管理', path: '/scene', icon: markRaw(Aim) },
      { label: '指标映射', path: '/mapping', icon: markRaw(Link) }
    ]
  },
  {
    id: 'nav-data',
    label: '数据治理',
    items: [
      { label: '数据资产', path: '/data', icon: markRaw(Folder) }
    ]
  },
  {
    id: 'nav-calculation',
    label: '计算运行',
    items: [
      { label: '计算任务', path: '/calc', icon: markRaw(Monitor) }
    ]
  },
  {
    id: 'nav-platform',
    label: '平台管理',
    items: [
      { label: '系统管理', path: '/system', icon: markRaw(Setting) }
    ]
  }
]

const activePath = computed(() => route.meta.activeMenu || route.path)
const breadcrumbs = computed(() => route.meta.breadcrumb || ['首页'])
const displayBreadcrumbs = computed(() => {
  if (route.name === 'IndicatorAnalysis') {
    const indicatorCode = String(route.query.indicator || DEFAULT_ANALYSIS_INDICATOR)
    return ['首页', '指标分析', getAnalysisProfile(indicatorCode).name]
  }
  return breadcrumbs.value
})
</script>
