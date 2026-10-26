import { createAccessDirective } from '@/idmp/auth/accessDirective.js'
import { createApp } from 'vue'
import { canRequest } from '@/idmp/auth/session'
import ElementPlus from 'element-plus'
import locale from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@/idmp/styles/index.scss'

import App from './App.vue'
import router from './router'

const app = createApp(App)
app.config.globalProperties.$can = canRequest
// Explicitly annotated actions follow live session grants; the API remains the security boundary.
app.directive('access', createAccessDirective(canRequest))

app.use(router)
app.use(ElementPlus, {
  locale,
  size: 'default'
})

app.mount('#app')
