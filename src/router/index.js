import { createRouter, createWebHistory } from 'vue-router'
import IdmpLayout from '@/idmp/layout/IdmpLayout.vue'

const routes = [
  {
    path: '/',
    component: IdmpLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/idmp/views/Dashboard.vue'),
        meta: { title: '指标看板', breadcrumb: ['首页', '指标看板'] }
      },
      {
        path: 'indicator',
        name: 'IndicatorManagement',
        component: () => import('@/idmp/views/IndicatorManagement.vue'),
        meta: { title: '指标管理', breadcrumb: ['首页', '指标管理'] }
      },
      {
        path: 'indicator/edit/:id?',
        name: 'IndicatorEditor',
        component: () => import('@/idmp/views/IndicatorEditor.vue'),
        meta: {
          title: '指标编辑',
          activeMenu: '/indicator',
          breadcrumb: ['首页', '指标管理', '编辑指标']
        }
      },
      {
        path: 'indicator/view/:id',
        name: 'IndicatorDetail',
        component: () => import('@/idmp/views/IndicatorDetail.vue'),
        meta: {
          title: '指标详情',
          activeMenu: '/indicator',
          breadcrumb: ['首页', '指标管理', '查看指标']
        }
      },
      {
        path: 'factor',
        name: 'FactorManagement',
        component: () => import('@/idmp/views/FactorManagement.vue'),
        meta: { title: '因子管理', breadcrumb: ['首页', '因子管理'] }
      },
      {
        path: 'factor/edit/:id?',
        name: 'FactorEditor',
        component: () => import('@/idmp/views/FactorEditor.vue'),
        meta: {
          title: '因子编辑',
          activeMenu: '/factor',
          breadcrumb: ['首页', '因子管理', '因子编辑']
        }
      },
      {
        path: 'scenarios',
        name: 'ScenarioList',
        component: () => import('@/idmp/views/ScenarioList.vue'),
        meta: { title: '场景管理', breadcrumb: ['首页', '场景管理'] }
      },
      {
        path: 'scenarios/:scenarioId/edit',
        name: 'ScenarioEditor',
        component: () => import('@/idmp/views/ScenarioEditor.vue'),
        meta: { title: '场景编辑', activeMenu: '/scenarios', breadcrumb: ['首页', '场景管理', '场景编辑'] }
      },
      {
        path: 'scene',
        redirect: '/scenarios'
      },
      {
        path: 'mapping',
        name: 'IndicatorMapping',
        component: () => import('@/idmp/views/IndicatorMapping.vue'),
        meta: { title: '指标映射', breadcrumb: ['首页', '指标映射管理'] }
      },
      {
        path: 'analysis',
        name: 'IndicatorAnalysis',
        component: () => import('@/idmp/views/IndicatorAnalysis.vue'),
        meta: {
          title: '指标分析',
          breadcrumb: ['首页', '指标分析', '手术患者并发症发生率']
        }
      },
      {
        path: 'analysis/drill',
        name: 'ResultDrill',
        component: () => import('@/idmp/views/ResultDrill.vue'),
        meta: {
          title: '结果下钻',
          activeMenu: '/analysis',
          breadcrumb: ['首页', '指标分析', '结果下钻']
        }
      },
      {
        path: 'alerts',
        name: 'AlertCenter',
        component: () => import('@/idmp/views/AlertCenter.vue'),
        meta: { title: '预警中心', breadcrumb: ['首页', '预警中心'] }
      },
      {
        path: 'calc',
        name: 'CalculationTaskCenter',
        component: () => import('@/idmp/views/CalculationTaskCenter.vue'),
        meta: { title: '计算任务中心', breadcrumb: ['首页', '计算任务中心'] }
      },
      {
        path: 'data',
        redirect: '/data/sources'
      },
      {
        path: 'data/sources',
        name: 'DataSourceManagement',
        component: () => import('@/idmp/views/SourceMetadataManagement.vue'),
        meta: {
          title: '数据源管理',
          activeMenu: '/data/sources',
          breadcrumb: ['首页', '数据治理', '数据源管理']
        }
      },
      {
        path: 'data/domains',
        name: 'DataDomainManagement',
        component: () => import('@/idmp/views/DataDomainManagement.vue'),
        meta: {
          title: '数据模型管理',
          activeMenu: '/data/domains',
          breadcrumb: ['首页', '数据治理', '数据模型管理']
        }
      },
      {
        path: 'data/domains/:id',
        name: 'DataDomainWorkspace',
        component: () => import('@/idmp/views/DataDomainWorkspace.vue'),
        meta: {
          title: '数据模型工作台',
          activeMenu: '/data/domains',
          breadcrumb: ['首页', '数据治理', '数据模型管理', '数据域工作台']
        }
      },
      {
        path: 'system',
        name: 'SystemManagement',
        component: () => import('@/idmp/views/SystemManagement.vue'),
        meta: { title: '系统管理', breadcrumb: ['首页', '系统管理'] }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const idmpPermissionMetadata = {
  ScenarioList: { view: 'scenario:view', actions: { create: 'scenario:create', edit: 'scenario:edit', publish: 'scenario:publish' } },
  ScenarioEditor: { view: 'scenario:view', actions: { edit: 'scenario:edit', publish: 'scenario:publish' } },
  // 后端权限码保持既有契约；页面术语改为面向用户的“数据源管理”。
  DataSourceManagement: { view: 'idmp:source-metadata:read', actions: { sync: 'idmp:source-metadata:sync' } },
  DataDomainManagement: { view: 'idmp:data-domains:read', actions: { create: 'idmp:data-domains:create' } },
  DataDomainWorkspace: { view: 'idmp:data-domains:read', actions: { createSemanticTable: 'idmp:semantic-tables:create', editSemanticField: 'idmp:semantic-fields:edit' }, compatibility: 'backend-permission-set-optional' }
}
routes[0].children.forEach((route) => {
  if (idmpPermissionMetadata[route.name]) route.meta = { ...route.meta, permissions: idmpPermissionMetadata[route.name] }
})
routes.splice(1, 0, { path: '/login', name: 'Login', component: () => import('@/idmp/views/Login.vue'), meta: { title: '登录' } })

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
