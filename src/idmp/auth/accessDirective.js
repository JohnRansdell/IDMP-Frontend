import { shallowRef, watchEffect } from 'vue'
import { resolveAccessGrant } from './accessPolicy.js'

export function createAccessDirective(canRequest) {
  const bindings = new WeakMap()
  return {
    beforeMount(el, binding) {
      const value = shallowRef(binding.value)
      const stop = watchEffect(() => {
        const grant = resolveAccessGrant(value.value)
        const allowed = Boolean(grant && canRequest(...grant))
        el.hidden = !allowed
        if (!allowed) el.style.setProperty('display', 'none', 'important')
        else el.style.removeProperty('display')
      }, { flush: 'sync' })
      bindings.set(el, { value, stop })
    },
    updated(el, binding) {
      const state = bindings.get(el)
      if (state) state.value.value = binding.value
    },
    beforeUnmount(el) {
      bindings.get(el)?.stop()
      bindings.delete(el)
    }
  }
}
