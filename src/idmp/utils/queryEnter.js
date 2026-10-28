const listeners = new WeakMap()

// Opt in only query regions; invoke the same enabled button as a mouse click.
export const queryEnterDirective = {
  mounted(element) {
    const onKeydown = event => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      const input = event.target
      if (input?.tagName !== 'INPUT' || input.disabled || input.readOnly
        || !['text', 'search', 'number', 'email', 'tel', 'url', 'password'].includes(input.type)
        || input.closest('.el-select, .el-select-v2, .el-date-editor, [role="combobox"], [contenteditable="true"]')) return
      const button = element.querySelector('button[data-query-submit], button[type="submit"]')
      if (!button) return
      event.preventDefault()
      if (event.repeat || button.disabled || button.getAttribute('aria-disabled') === 'true'
        || button.classList.contains('is-loading')) return
      button.click()
    }
    element.addEventListener('keydown', onKeydown)
    listeners.set(element, onKeydown)
  },
  beforeUnmount(element) {
    element.removeEventListener('keydown', listeners.get(element))
    listeners.delete(element)
  }
}
