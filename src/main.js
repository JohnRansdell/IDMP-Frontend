import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import locale from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@/idmp/styles/index.scss'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)
app.use(ElementPlus, {
  locale,
  size: 'default'
})

window.addEventListener('idmp:unauthorized', () => {
  const redirect = `${window.location.pathname}${window.location.search}`
  if (window.location.pathname !== '/login') router.push({ path: '/login', query: { redirect } })
})

app.mount('#app')
