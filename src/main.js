import { resolveAccessGrant } from '@/idmp/auth/accessPolicy.js'
import { createApp, watchEffect } from 'vue'
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
app.directive('access', {
  beforeMount(el, binding) {
    el.__accessStop = watchEffect(() => {
      const grant = resolveAccessGrant(binding.value)
      const allowed = Boolean(grant && canRequest(...grant))
      el.hidden = !allowed
      if (!allowed) el.style.setProperty('display', 'none', 'important')
      else el.style.removeProperty('display')
    })
  },
  beforeUnmount(el) { el.__accessStop?.() }
})

app.use(router)
app.use(ElementPlus, {
  locale,
  size: 'default'
})

app.mount('#app')
