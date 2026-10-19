<template>
  <div class="idmp-shell" :class="{ 'is-designer-immersive': designerImmersive }">
    <aside v-if="!designerImmersive" class="idmp-sidebar">
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
          <template v-for="item in group.items" :key="item.path">
            <div class="idmp-nav__row" :class="{ 'has-children': Boolean(item.children), 'is-active': activePath === item.path }">
              <RouterLink
                :to="item.path"
                class="idmp-nav__item"
                :class="{ 'is-active': activePath === item.path }"
                :aria-current="activePath === item.path ? 'page' : undefined"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </RouterLink>
              <button
                v-if="item.children"
                type="button"
                class="idmp-nav__toggle"
                :aria-expanded="dashboardMenuExpanded"
                aria-controls="dashboard-submenu"
                :aria-label="dashboardMenuExpanded ? '收起已有看板' : '展开已有看板'"
                :title="dashboardMenuExpanded ? '收起已有看板' : '展开已有看板'"
                @click="dashboardMenuExpanded = !dashboardMenuExpanded"
              ><el-icon class="idmp-nav__toggle-icon" :class="{ 'is-expanded': dashboardMenuExpanded }" aria-hidden="true"><ArrowRight /></el-icon></button>
            </div>
            <div v-if="item.children && dashboardMenuExpanded" id="dashboard-submenu" class="idmp-nav__submenu" aria-label="已有看板">
              <RouterLink
                v-for="child in item.children"
                :key="child.id"
                :to="{ path: '/dashboard', query: { id: child.id } }"
                class="idmp-nav__subitem"
                :class="{ 'is-active': route.path === '/dashboard' && String(route.query.id || dashboardRequestedId) === String(child.id) }"
                :title="child.name"
              >{{ child.name }}</RouterLink>
              <span v-if="!item.children.length" class="idmp-nav__submenu-empty">暂无看板</span>
            </div>
          </template>
        </section>
      </nav>
    </aside>

    <header v-if="!designerImmersive" class="idmp-topbar">
      <nav class="idmp-breadcrumb" aria-label="面包屑">
        <template v-for="(item, index) in displayBreadcrumbs" :key="`${item.label}-${index}`">
          <RouterLink v-if="item.to" :to="item.to">{{ item.label }}</RouterLink>
          <span v-else :aria-current="item.current ? 'page' : undefined">{{ item.label }}</span>
          <span v-if="index < displayBreadcrumbs.length - 1" class="separator" aria-hidden="true">/</span>
        </template>
      </nav>

      <div class="idmp-topbar__right">
        <div v-if="isDashboardRoute" class="idmp-context">
          <span class="scene-label">{{ isDashboardRoute ? '场景看板' : '全局场景' }}</span>
          <el-select v-model="currentScene" class="scene-select" :aria-label="isDashboardRoute ? '场景看板' : '全局场景'">
            <el-option v-for="scene in currentSceneOptions" :key="scene.value" :label="scene.label" :value="scene.value" />
          </el-select>
        </div>
        <el-tooltip content="查看预警中心" placement="bottom">
          <el-badge :value="unreadCount || undefined" :hidden="!unreadCount" class="notification-badge">
            <el-button text circle :aria-label="`查看 ${unreadCount} 条未读站内通知`" @click="router.push('/alerts')">
              <el-icon :size="19"><Bell /></el-icon>
            </el-button>
          </el-badge>
        </el-tooltip>
        <div class="idmp-user">
          <el-avatar :size="30">{{ currentUserName.slice(0, 1) }}</el-avatar>
          <span class="idmp-user__copy">
            <span class="idmp-user__name">{{ currentUserName }}</span>
            <span v-if="currentUserDepartment" class="idmp-user__role">{{ currentUserDepartment }}</span>
          </span>
        </div>
      </div>
    </header>

    <main class="idmp-main">
      <RouterView v-slot="{ Component, route: currentRoute }">
        <KeepAlive :include="['Dashboard', 'AlertCenter']" :max="2">
          <component :is="Component" :key="currentRoute.path" />
        </KeepAlive>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
import { computed, KeepAlive, markRaw, onMounted, ref, watch } from 'vue'
import { dashboardCatalogRevision, dashboardRequestedId, designerImmersive, notificationReadRevision } from './shellState.js'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Aim,
  ArrowRight,
  Bell,
  Connection,
  DocumentCopy,
  DataAnalysis,
  Collection,
  Folder,
  Histogram,
  Link,
  List,
  Monitor,
  Setting,
  TrendCharts
} from '@element-plus/icons-vue'
import { sessionState } from '@/idmp/auth/session'
import { fetchUnreadNotificationCount } from '@/idmp/api/modules/warnings'
import { fetchDashboardCatalog } from '@/idmp/api/modules/analysisDashboard'
import { dashboardSummaryToCatalogEntry } from '@/idmp/api/adapters/dashboard'
import { readDashboardCatalog } from '@/idmp/features/dashboard/catalog.js'
import { buildPageBreadcrumbs } from '@/router/breadcrumbs.js'

const route = useRoute()
const router = useRouter()
const currentUserName = computed(() => sessionState.user?.displayName || sessionState.user?.nickname || sessionState.user?.username || '当前用户')
const currentUserDepartment = computed(() => sessionState.user?.departmentName || sessionState.user?.deptName || '')
const isDashboardRoute = computed(() => route.name === 'Dashboard')
const remoteDashboardOptions = ref([])
const currentSceneOptions = computed(() => remoteDashboardOptions.value.map(item => ({ label: item.name, value: item.id })))
const currentScene = computed({
  get: () => dashboardRequestedId.value,
  set: value => { dashboardRequestedId.value = value }
})
const unreadCount = ref(0)
const dashboardMenuExpanded = ref(true)
async function refreshRemoteDashboardOptions() {
  const localOptions = readDashboardCatalog(localStorage).map(item => ({ ...item, origin: 'local' }))
  try {
    const catalog = await fetchDashboardCatalog()
    const remoteOptions = (Array.isArray(catalog) ? catalog : []).map(dashboardSummaryToCatalogEntry)
    remoteDashboardOptions.value = [...localOptions, ...remoteOptions.filter(remote => !localOptions.some(local => String(local.id) === String(remote.id)))]
  } catch {
    remoteDashboardOptions.value = localOptions
  }
}
let unreadRequestId = 0
async function loadUnreadCount() {
  const requestId = ++unreadRequestId
  try {
    const count = Number((await fetchUnreadNotificationCount())?.unreadCount || 0)
    if (requestId === unreadRequestId) unreadCount.value = count
  } catch {
    // Preserve the last confirmed count when a refresh fails.
  }
}

const navGroups = computed(() => [
  {
    id: 'nav-overview',
    label: '总览与分析',
    items: [
      { label: '看板总览', path: '/dashboard', icon: markRaw(Histogram), children: remoteDashboardOptions.value },
      { label: '看板管理', path: '/dashboard/manage', icon: markRaw(Monitor) },
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
      { label: '因子模板', path: '/factor/templates', icon: markRaw(DocumentCopy) },
      { label: '场景管理', path: '/scenarios', icon: markRaw(Aim) },
      { label: '指标映射', path: '/mapping', icon: markRaw(Link) }
    ]
  },
  {
    id: 'nav-data',
    label: '数据治理',
    items: [
      { label: '数据源管理', path: '/data/sources', icon: markRaw(Connection) },
      { label: '数据域管理', path: '/data/domains', icon: markRaw(Folder) },
      { label: '值集管理', path: '/data/value-sets', icon: markRaw(Collection) }
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
      { label: '政策文件', path: '/policies', icon: markRaw(DocumentCopy) },
      { label: '系统管理', path: '/system', icon: markRaw(Setting) }
    ]
  }
])

const activePath = computed(() => route.meta.activeMenu || route.path)
const displayBreadcrumbs = computed(() => buildPageBreadcrumbs(route))

watch(dashboardCatalogRevision, () => { void refreshRemoteDashboardOptions() })
watch(notificationReadRevision, () => { void loadUnreadCount() })
onMounted(() => { loadUnreadCount(); void refreshRemoteDashboardOptions() })
</script>
