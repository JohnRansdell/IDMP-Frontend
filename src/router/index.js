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
          activeMenu: '/indicator/edit',
          breadcrumb: ['首页', '指标管理', '编辑指标']
        }
      },
      {
        path: 'factor',
        name: 'FactorManagement',
        component: () => import('@/idmp/views/FactorManagement.vue'),
        meta: { title: '因子管理', breadcrumb: ['首页', '因子管理'] }
      },
      {
        path: 'scene',
        name: 'SceneManagement',
        component: () => import('@/idmp/views/SceneManagement.vue'),
        meta: {
          title: '场景管理',
          breadcrumb: ['首页', '场景管理', '绩效考核']
        }
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
        path: 'alerts',
        name: 'AlertCenter',
        component: () => import('@/idmp/views/AlertCenter.vue'),
        meta: { title: '预警中心', breadcrumb: ['首页', '预警中心'] }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
