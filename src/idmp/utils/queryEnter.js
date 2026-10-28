const listeners = new WeakMap()

// Opt in only query regions; invoke the same enabled button as a mouse click.
export const queryEnterDirective = {
  mounted(element) {
    const isQueryEnter = event => event.key === 'Enter' && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229
      && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
    const submit = (event, stop = false) => {
      const button = element.querySelector('button[data-query-submit], button[type="submit"]')
      if (!button) return
      event.preventDefault()
      if (stop) event.stopPropagation()
      if (event.repeat || button.disabled || button.getAttribute('aria-disabled') === 'true'
        || button.classList.contains('is-loading')) return
      button.click()
    }
    const onSelectEnter = event => {
      if (!isQueryEnter(event)) return
      const input = event.target
      if (input?.tagName !== 'INPUT' || input.disabled || input.readOnly || input.value
        || input.getAttribute('aria-expanded') !== 'false') return
      const select = input.closest('.el-select, .el-select-v2')
      // Open lists own Enter. Only an already confirmed value in a closed list can query.
      if (!select?.querySelector('.el-select__selected-item:not(.is-transparent):not(.el-select__input-wrapper)')) return
      submit(event, true)
    }
    const onKeydown = event => {
      if (!isQueryEnter(event)) return
      const input = event.target
      if (input?.tagName !== 'INPUT' || input.disabled || input.readOnly
        || !['text', 'search', 'number', 'email', 'tel', 'url', 'password'].includes(input.type)
        || input.closest('.el-select, .el-select-v2, .el-date-editor, [role="combobox"], [contenteditable="true"]')) return
      submit(event)
    }
    element.addEventListener('keydown', onSelectEnter, true)
    element.addEventListener('keydown', onKeydown)
    listeners.set(element, { onKeydown, onSelectEnter })
  },
  beforeUnmount(element) {
    const handlers = listeners.get(element)
    element.removeEventListener('keydown', handlers?.onKeydown)
    element.removeEventListener('keydown', handlers?.onSelectEnter, true)
    listeners.delete(element)
  }
}
